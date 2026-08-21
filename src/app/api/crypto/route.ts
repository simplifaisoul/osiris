import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd', { signal: AbortSignal.timeout(15000),
      next: { revalidate: 60 } // cache for 60 seconds
    });
    
    if (!res.ok) {
      throw new Error(`CoinGecko responded with ${res.status}`);
    }

    const data = await res.json();
    const prices: any[] = [];
    
    if (data.bitcoin?.usd) prices.push({ symbol: 'BTC', price: data.bitcoin.usd });
    if (data.ethereum?.usd) prices.push({ symbol: 'ETH', price: data.ethereum.usd });
    if (data.solana?.usd) prices.push({ symbol: 'SOL', price: data.solana.usd });

    return NextResponse.json(prices);
  } catch (error) {
    console.error('Failed to fetch crypto prices:', error);
    return NextResponse.json([]); // Return empty if entirely failed, no static fallbacks
  }
}


