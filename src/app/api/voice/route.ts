import { NextResponse } from 'next/server';

const SYSTEM_PROMPT = `You are OSIRIS Voice — an intelligent assistant for the OSIRIS global intelligence dashboard.
Respond in the same language the user speaks (Dari/Pashto/English).
Keep answers concise and actionable — suitable for voice playback (2–4 sentences max).
You help users understand map data, OSINT feeds, geopolitical events, and navigation within the dashboard.
If asked about real-time data you don't have, say so honestly and suggest what layer or panel to check.`;

export async function POST(req: Request) {
  const apiKey = req.headers.get('x-api-key')?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: 'API key required' }, { status: 401 });
  }

  let body: { messages?: { role: string; content: string }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'Messages required' }, { status: 400 });
  }

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        max_tokens: 300,
        temperature: 0.7,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      const detail = data?.error?.message || data?.error?.code || 'OpenAI request failed';
      return NextResponse.json({ error: detail }, { status: res.status });
    }

    const reply = data.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      return NextResponse.json({ error: 'Empty response from model' }, { status: 502 });
    }

    return NextResponse.json({ reply });
  } catch {
    return NextResponse.json({ error: 'Could not reach OpenAI' }, { status: 502 });
  }
}
