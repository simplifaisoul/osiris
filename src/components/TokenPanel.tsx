'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, TrendingUp } from 'lucide-react';

export default function TokenPanel() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="pointer-events-auto glass-panel px-3 py-1.5 flex items-center gap-2 text-[8px] font-mono tracking-widest hover:opacity-80 transition-opacity border-[#14F195]/40 bg-[#14F195]/10 ml-3 shadow-[0_0_10px_rgba(20,241,149,0.1)]"
      >
        <TrendingUp className="w-3 h-3 text-[#14F195]" />
        <span className="text-[#14F195] font-bold">$OSIRIS</span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[1000] flex items-center justify-center pointer-events-auto px-4"
            onClick={() => setIsOpen(false)}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

            {/* Modal */}
            <div 
              className="relative w-full max-w-4xl bg-[#0A0A0A] border border-[var(--border-primary)] shadow-2xl flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-primary)] bg-black/40">
                <div className="flex items-center gap-3">
                  <TrendingUp className="w-4 h-4 text-[#14F195]" />
                  <h2 className="text-xs font-mono font-bold text-white tracking-widest uppercase">$OSIRIS LIVE CHART</h2>
                </div>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="p-1 hover:bg-white/10 rounded transition-colors"
                >
                  <X className="w-4 h-4 text-[var(--text-muted)] hover:text-white" />
                </button>
              </div>

              {/* Chart Body */}
              <div className="p-1 relative w-full" style={{ height: '70vh', minHeight: '500px' }}>
                <iframe 
                  src="https://dexscreener.com/solana/G3rchnZ2WLsBDZSrVME4fTyzFP57F3yvvqWMxAy2b4ce?embed=1&loadChartSettings=0&chartLeftToolbar=0&chartTheme=dark&theme=dark&chartStyle=0&chartType=usd&interval=15"
                  className="absolute inset-0 w-full h-full border-0"
                  allow="clipboard-write"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
