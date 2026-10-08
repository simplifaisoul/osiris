'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface CryptoPrice { symbol: string; price: number; }
interface CyberThreat { id: string; name: string; vendor: string; product: string; date: string; }
interface Earthquake { id: string; magnitude: number; place: string; time: number; depth: number; }

const CryptoIcon = ({ symbol }: { symbol: string }) => {
  if (symbol === 'BTC') return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="16" fill="#F7931A"/>
      <path d="M22.5 13.5c0-2-1.5-3-3.5-3h-1.5v-2h-2v2h-1.5v-2h-2v2h-2.5v2h1.5c.5 0 1 .5 1 1v6c0 .5-.5 1-1 1h-1.5v2h2.5v2h2v-2h1.5v2h2v-2c2 0 4-1 4-3 0-1.5-.5-2.5-1.5-3 1-.5 1.5-1.5 1.5-2.5zm-5 4c0 1-1 1-1.5 1h-2v-3h2c1 0 1.5 0 1.5 1v1zm-.5-4.5c0 1-1 1-1.5 1h-2v-2.5h2c.5 0 1.5 0 1.5 1v.5z" fill="#FFF"/>
    </svg>
  );
  if (symbol === 'ETH') return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M15.9 2L7 16.8l8.9 5.3 8.9-5.3L15.9 2z" fill="#627EEA"/>
      <path d="M15.9 24v6.8l8.9-12.6-8.9 5.8z" fill="#627EEA"/>
      <path d="M7 18.2l8.9 12.6V24l-8.9-5.8z" fill="#627EEA"/>
    </svg>
  );
  if (symbol === 'SOL') return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 10h14l4 3H10l-4-3zm0 9h14l4 3H10l-4-3zm18-6H10l-4 3h14l4-3z" fill="url(#sol_grad)"/>
      <defs>
        <linearGradient id="sol_grad" x1="6" y1="13" x2="24" y2="13" gradientUnits="userSpaceOnUse">
          <stop stopColor="#9945FF"/>
          <stop offset="1" stopColor="#14F195"/>
        </linearGradient>
      </defs>
    </svg>
  );
  return null;
};

const formatPrice = (price: number) => {
  if (price >= 1000) return `$${(price / 1000).toFixed(1)}K`;
  if (price < 0.01) return `$${price.toFixed(5)}`;
  if (price < 1) return `$${price.toFixed(4)}`;
  return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export default function GlobalStatusBar() {
  const [crypto, setCrypto] = useState<CryptoPrice[]>([]);
  const [quakes, setQuakes] = useState<Earthquake[]>([]);

  const [hoveredQuake, setHoveredQuake] = useState<Earthquake | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [cryptoRes, quakeRes] = await Promise.allSettled([
          fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd')
            .then(res => res.ok ? res.json() : Promise.reject('CoinGecko error'))
            .then(data => {
              const prices: CryptoPrice[] = [];
              if (data.bitcoin?.usd) prices.push({ symbol: 'BTC', price: data.bitcoin.usd });
              if (data.ethereum?.usd) prices.push({ symbol: 'ETH', price: data.ethereum.usd });
              if (data.solana?.usd) prices.push({ symbol: 'SOL', price: data.solana.usd });
              return { ok: true, json: async () => prices };
            }),
          fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson')
            .then(res => res.ok ? res.json() : Promise.reject('USGS error'))
            .then(data => ({
              ok: true,
              json: async () => ({
                earthquakes: (data.features || []).map((f: any) => ({
                  id: f.id,
                  lat: f.geometry?.coordinates?.[1] || 0,
                  lng: f.geometry?.coordinates?.[0] || 0,
                  depth: f.geometry?.coordinates?.[2] || 0,
                  magnitude: f.properties?.mag,
                  place: f.properties?.place,
                  time: f.properties?.time,
                  url: f.properties?.url,
                  tsunami: f.properties?.tsunami,
                  type: f.properties?.type,
                  felt: f.properties?.felt,
                  alert: f.properties?.alert,
                }))
              })
            })),
        ]);

        if (cryptoRes.status === 'fulfilled' && cryptoRes.value.ok) {
          setCrypto(await cryptoRes.value.json());
        }
        if (quakeRes.status === 'fulfilled' && quakeRes.value.ok) {
          const quakeData = await quakeRes.value.json();
          // Filter to mag >= 4.0 and take top 5 most recent
          const majorQuakes = (quakeData.earthquakes || [])
            .filter((q: Earthquake) => q.magnitude >= 4.0)
            .sort((a: Earthquake, b: Earthquake) => b.time - a.time)
            .slice(0, 5);
          setQuakes(majorQuakes);
        }
      } catch (e) { console.warn('[OSIRIS] Suppressed error:', e instanceof Error ? e.message : e); }
    };
    fetchData();
    const iv = setInterval(fetchData, 60000); // 1 min (to keep fresh)
    return () => clearInterval(iv);
  }, []);

  if (crypto.length === 0 && quakes.length === 0) return null;

  const cryptoContent = crypto.length > 0 ? (
    <>
      <span className="text-[var(--border-primary)] mx-1">|</span>
      <span className="inline-flex items-center gap-3 mx-2">
        {crypto.map(c => (
          <span key={c.symbol} className="inline-flex items-center gap-1 mx-2">
            <CryptoIcon symbol={c.symbol} />
            <span className="text-[var(--text-primary)] font-bold tracking-wider">{formatPrice(c.price)}</span>
          </span>
        ))}
      </span>
    </>
  ) : null;

  const quakeContent = quakes.length > 0 ? (
    <>
      <span className="text-[var(--border-primary)] mx-1">|</span>
      {quakes.map(quake => (
        <span 
          key={quake.id} 
          className="inline-flex items-center gap-1 mx-2 cursor-help pointer-events-auto"
          onMouseEnter={() => setHoveredQuake(quake)}
          onMouseLeave={() => setHoveredQuake(null)}
        >
          <span className="text-[#FF9500] text-[10px]">🌋</span>
          <span className="text-[#FF9500] font-bold tracking-wider">M{quake.magnitude.toFixed(1)}</span>
          <span className="text-[var(--text-muted)] truncate max-w-[150px]">{quake.place}</span>
        </span>
      ))}
    </>
  ) : null;

  const tickerContent = (
    <>
      {cryptoContent}
      {quakeContent}
    </>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 4, duration: 0.8 }}
      className="hidden md:block absolute bottom-0 left-0 right-0 z-[198] pointer-events-none"
    >
      <div className="h-[22px] overflow-hidden bg-black/90 border-t border-[var(--cyan-primary)]/40 flex items-center text-[8px] font-mono tracking-wider backdrop-blur-md relative" style={{ boxShadow: '0 -4px 20px rgba(0, 229, 255, 0.1)' }}>
        {/* Animated glitch line overlay */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[var(--cyan-primary)] to-transparent opacity-50" style={{ animation: 'hud-scanline 3s linear infinite' }} />
        
        {/* Static label */}
        <div className="flex-shrink-0 px-3 h-full flex items-center gap-1 border-r border-[var(--cyan-primary)]/30 bg-black pointer-events-auto relative z-10 shadow-[4px_0_10px_rgba(0,0,0,0.5)]">
          <span className="text-[var(--cyan-primary)] font-bold">LIVE</span>
        </div>

        {/* CSS-animated ticker */}
        <div className="flex-1 overflow-hidden relative" style={{ maskImage: 'linear-gradient(to right, transparent, black 5%, black 95%, transparent)' }}>
          <div className="flex items-center animate-ticker whitespace-nowrap">
            {/* Repeat enough times to loop seamlessly */}
            {tickerContent}
            {tickerContent}
            {tickerContent}
            {tickerContent}
          </div>
        </div>
      </div>

      {/* Hover tooltips */}
      {hoveredQuake && (
        <div className="absolute bottom-[28px] left-1/2 -translate-x-1/2 z-[300] pointer-events-none">
          <div className="glass-panel px-4 py-3 text-[10px] font-mono whitespace-nowrap" style={{ borderColor: '#FF950040' }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[12px] text-[#FF9500]">🌋</span>
              <span className="font-bold text-[#FF9500]">Magnitude {hoveredQuake.magnitude.toFixed(1)}</span>
              <span className="text-[var(--text-muted)] text-[9px] bg-black/40 px-1.5 py-0.5 rounded">USGS</span>
            </div>
            <div className="text-[11px] text-[var(--text-primary)] font-bold mb-2">
              {hoveredQuake.place}
            </div>
            <div className="flex flex-col gap-1 text-[9px]">
              <div className="text-[var(--text-secondary)]"><span className="opacity-50">Depth:</span> {hoveredQuake.depth} km</div>
              <div className="text-[var(--text-secondary)] mt-1"><span className="opacity-50">Time:</span> {new Date(hoveredQuake.time).toLocaleString()}</div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
