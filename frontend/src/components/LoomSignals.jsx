import React, { useEffect, useState } from "react";

/**
 * Loom signal-convergence visual: labeled live signal checks on the left,
 * flowing dashed threads that curve into a single execution node on the right.
 * SVG + SMIL motion pulses; values tick periodically.
 */
const SIGNALS = [
  { label: "ETH price, 1h", value: "+2.4%", check: "> 0%", ok: true },
  { label: "DOGE funding, per hour", value: "0.0038%", check: "< 0.01%", ok: true },
  { label: "Fear & Greed index", value: "34", check: "< 40", ok: true },
  { label: "$LOOM buys vs sells, 1h", value: "1.8×", check: "> 1", ok: true },
];

const ROW_Y = [64, 172, 280, 388]; // y center of each row
const LINE_X = 400; // where text ends / thread begins (viewBox units)
const NODE = { x: 690, y: 226 };
const VB = { w: 760, h: 452 };

const JITTER = [
  () => `+${(1.8 + Math.random() * 1.4).toFixed(1)}%`,
  () => `${(0.0028 + Math.random() * 0.0024).toFixed(4)}%`,
  () => `${Math.round(31 + Math.random() * 7)}`,
  () => `${(1.4 + Math.random() * 0.9).toFixed(1)}×`,
];

export default function LoomSignals({ className = "" }) {
  const [vals, setVals] = useState(SIGNALS.map((s) => s.value));
  const [fired, setFired] = useState(false);

  useEffect(() => {
    const iv = setInterval(() => setVals(JITTER.map((j) => j())), 2400);
    return () => clearInterval(iv);
  }, []);

  // node fires each time a pulse arrives (pulses are 3.2s, staggered 0.8s)
  useEffect(() => {
    const iv = setInterval(() => {
      setFired(true);
      setTimeout(() => setFired(false), 900);
    }, 1600);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className={`relative ${className}`} data-testid="loom-signals">
      <div className="relative overflow-hidden rounded-2xl border border-[#a855f724] bg-[#0b0916] p-5 md:p-6 shadow-[0_0_50px_-12px_rgba(168,85,247,0.25)]">
        {/* faint vertical grid */}
        <div className="absolute inset-0 pointer-events-none opacity-60"
          style={{ backgroundImage: "repeating-linear-gradient(90deg, rgba(168,85,247,0.07) 0 1px, transparent 1px 56px)" }} />
        <svg viewBox={`0 0 ${VB.w} ${VB.h}`} className="relative w-full" style={{ minHeight: 340 }}>
          <defs>
            <linearGradient id="loomThread" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#818cf8" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.9" />
            </linearGradient>
          </defs>
          {SIGNALS.map((s, i) => {
            const y = ROW_Y[i];
            const path = `M 0 ${y} L ${LINE_X} ${y} C ${LINE_X + 130} ${y}, ${NODE.x - 150} ${NODE.y}, ${NODE.x} ${NODE.y}`;
            return (
              <g key={i}>
                {/* dashed flowing thread, straight then curving to the node */}
                <path d={path} fill="none" stroke="url(#loomThread)" strokeWidth="2.5"
                  strokeDasharray="11 9" className="loom-dash" />
                {/* traveling pulse */}
                <circle r="4" fill="#c4b5fd">
                  <animateMotion dur="3.2s" begin={`${i * 0.8}s`} repeatCount="indefinite" path={path} />
                </circle>
                {/* label block */}
                <text x="0" y={y - 26} fill="#a89ec4" fontSize="15" fontFamily="Instrument Sans, sans-serif">{s.label}</text>
                <text x="0" y={y - 4} fill="#f3f0fd" fontSize="17" fontWeight="600" fontFamily="Geist Mono, monospace">{vals[i]}</text>
                <text x={vals[i].length * 11 + 12} y={y - 4} fill="#10b981" fontSize="14" fontFamily="Geist Mono, monospace">✓ {s.check}</text>
              </g>
            );
          })}
          {/* execution node */}
          <circle cx={NODE.x} cy={NODE.y} r={fired ? 26 : 18} fill="none" stroke="#a855f7" strokeOpacity={fired ? 0.7 : 0.25} strokeWidth="1.5" style={{ transition: "all 0.5s ease" }} />
          <circle cx={NODE.x} cy={NODE.y} r="7" fill="#c084fc">
            <animate attributeName="r" values="6;8;6" dur="1.6s" repeatCount="indefinite" />
          </circle>
          <text x={NODE.x} y={NODE.y + 44} fill="#c084fc" fontSize="12.5" textAnchor="middle" fontFamily="Geist Mono, monospace" opacity={fired ? 1 : 0.55} style={{ transition: "opacity 0.4s" }}>
            {fired ? "order placed" : "all signals agree"}
          </text>
        </svg>
        <style>{`.loom-dash { animation: loomdash 1.1s linear infinite; } @keyframes loomdash { to { stroke-dashoffset: -20; } }`}</style>
      </div>
      <p className="mt-3 mono text-[10.5px] tracking-[0.18em] uppercase text-[#6d638c] text-center">Every condition checked live · trade fires when all agree</p>
    </div>
  );
}
