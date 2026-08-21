import { NextResponse } from 'next/server';
import crypto from 'crypto';

export async function POST(request: Request) {
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    const forwardUrl = process.env.GITHUB_WEBHOOK_FORWARD_URL;

    // Fail-closed: require both secret and forward URL
    if (!secret || !forwardUrl) {
        return NextResponse.json(
            { error: 'Webhook endpoint not configured' },
            { status: 503 }
        );
    }

    try {
        const payloadText = await request.text();
        const signature = request.headers.get('x-hub-signature-256');

        // Always verify signature
        if (!signature) {
            return NextResponse.json({ error: 'Unauthorized: Missing signature' }, { status: 401 });
        }

        const hmac = crypto.createHmac('sha256', secret);
        const digest = 'sha256=' + hmac.update(payloadText).digest('hex');

        try {
            if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))) {
                return NextResponse.json({ error: 'Unauthorized: Invalid signature' }, { status: 401 });
            }
        } catch {
            return NextResponse.json({ error: 'Unauthorized: Invalid signature format' }, { status: 401 });
        }

        // Forward to configurable URL (no hardcoded IPs)
        const response = await fetch(forwardUrl, { signal: AbortSignal.timeout(15000),
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-hub-signature-256': signature,
            },
            body: payloadText,
        });

        if (!response.ok) {
            console.error('Failed to forward webhook:', response.statusText);
            return NextResponse.json({ error: 'Failed to forward to bot' }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: 'Webhook forwarded successfully' }, { status: 200 });

    } catch (error) {
        console.error('Error handling GitHub webhook:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
