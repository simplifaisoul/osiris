import { NextRequest, NextResponse } from 'next/server';

const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview-2024-10-01';
const SOFT_CAP_USD = parseFloat(process.env.VOICE_COST_SOFT_CAP_USD || '2');
const HARD_CAP_USD = parseFloat(process.env.VOICE_COST_HARD_CAP_USD || '5');

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const probe = searchParams.get('probe');

  if (probe === '1') {
    const configured = !!process.env.OPENAI_API_KEY;
    return NextResponse.json({ configured });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Voice control is not configured. Set OPENAI_API_KEY in environment.' },
      { status: 503 }
    );
  }

  try {
    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: REALTIME_MODEL,
        voice: 'alloy',
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(
        { error: error.error?.message || 'Failed to create realtime session' },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // Return only the ephemeral secret, never the raw API key
    return NextResponse.json({
      ephemeralKey: data.client_secret?.value || data.ephemeral_key,
      model: REALTIME_MODEL,
      softCap: SOFT_CAP_USD,
      hardCap: HARD_CAP_USD,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to connect to OpenAI API' },
      { status: 500 }
    );
  }
}
