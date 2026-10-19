import React, { useEffect, useMemo, useState } from "react";

/**
 * Loom signal-weave visual: labeled live signal checks on the left; each feeds a
 * thread that braids over and under the others (the loom metaphor) before merging
 * into a single execution node on the right. Pulses travel the threads; when one
 * lands, the node fires "order placed". Native SVG, unique composition.
 */
const SIGNALS = [
  { label: "ETH price, 1h", value: "+2.4%", check: "> 0%", color: "#94a3b8" },
  { label: "DOGE funding, /h", value: "0.0038%", check: "< 0.01%", color: "#b6bcc9" },
  { label: "Fear & Greed", value: "34", check: "< 40", color: "#cbd5e1" },
  { label: "$LOOM buys/sells, 1h", value: "1.8×", check: "> 1", color: "#e2e8f0" },
];

const VB = { w: 760, h: 452 };
const ROW_Y = [70, 176, 282, 388];
const NODE = { x: 672, y: 229 };
const WEAVE_START = 250;
const JITTER = [
  () => `+${(1.8 + Math.random() * 1.4).toFixed(1)}%`,
  () => `${(0.0028 + Math.random() * 0.0024).toFixed(4)}%`,
  () => `${Math.round(31 + Math.random() * 7)}`,
  () => `${(1.4 + Math.random() * 0.9).toFixed(1)}×`,
];

const smooth = (t) => t * t * (3 - 2 * t);

// catmull-rom -> cubic bezier path
function toPath(pts) {
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)}, ${c2[0].toFixed(1)} ${c2[1].toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

function weavePath(y0, phase, color) {
  const pts = [];
  const N = 48;
  for (let s = 0; s <= N; s++) {
    const t = s / N;
    const x = (WEAVE_START - 180) + (NODE.x - (WEAVE_START - 180)) * t;
    const base = y0 + (NODE.y - y0) * smooth(Math.max(0, (t - 0.42) / 0.58)); // converge late
    // braid: threads swap vertical order mid-flight
    const inWeave = t > 0.12 && t < 0.62;
    const env = inWeave ? Math.sin(((t - 0.12) / 0.5) * Math.PI) : 0;
    const braid = Math.sin(t * Math.PI * 4.4 + phase) * 44 * env;
    pts.push([x, base + braid]);
  }
  return toPath(pts);
}

export default function LoomSignals({ className = "" }) {
  const [vals, setVals] = useState(SIGNALS.map((s) => s.value));
  const [fired, setFired] = useState(false);

  const paths = useMemo(() => SIGNALS.map((s, i) => weavePath(ROW_Y[i], i * 1.9)), []);

  useEffect(() => {
    const iv = setInterval(() => setVals(JITTER.map((j) => j())), 2400);
    return () => clearInterval(iv);
  }, []);
  useEffect(() => {
    const iv = setInterval(() => {
      setFired(true);
      setTimeout(() => setFired(false), 900);
    }, 1700);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className={`relative ${className}`} data-testid="loom-signals">
      <div className="relative overflow-hidden rounded-2xl border border-[#ffffff26] bg-[#0a0a0c] p-5 md:p-6 shadow-[0_0_50px_-12px_rgba(226,232,255,0.25)]">
        <div className="absolute inset-0 pointer-events-none opacity-50"
          style={{ backgroundImage: "repeating-linear-gradient(90deg, rgba(226,232,255,0.06) 0 1px, transparent 1px 56px)" }} />
        <svg viewBox={`0 0 ${VB.w} ${VB.h}`} className="relative w-full" style={{ minHeight: 340 }}>
          {SIGNALS.map((s, i) => (
            <g key={i}>
              <path d={paths[i]} fill="none" stroke={s.color} strokeOpacity="0.55" strokeWidth="2.2"
                strokeDasharray="3 10" strokeLinecap="round" className="loom-dash" />
              <circle r="4" fill={s.color} style={{ filter: `drop-shadow(0 0 5px ${s.color})` }}>
                <animateMotion dur="3.4s" begin={`${i * 0.85}s`} repeatCount="indefinite" path={paths[i]} />
              </circle>
              {/* signal chip */}
              <g>
                <rect x="-6" y={ROW_Y[i] - 34} rx="10" width="222" height="52" fill="#131316" stroke="#ffffff26" />
                <circle cx="12" cy={ROW_Y[i] - 8} r="4" fill={s.color} />
                <text x="24" y={ROW_Y[i] - 15} fill="#9aa0ae" fontSize="13" fontFamily="Instrument Sans, sans-serif">{s.label}</text>
                <text x="24" y={ROW_Y[i] + 5} fill="#f4f4f5" fontSize="14.5" fontWeight="600" fontFamily="Geist Mono, monospace">{vals[i]}</text>
                <text x={28 + vals[i].length * 9.2} y={ROW_Y[i] + 5} fill="#10b981" fontSize="12" fontFamily="Geist Mono, monospace">✓{s.check}</text>
              </g>
            </g>
          ))}
          {/* execution node — triple ring echoing the knot */}
          <g>
            <circle cx={NODE.x} cy={NODE.y} r={fired ? 30 : 22} fill="none" stroke="#f1f5f9"
              strokeOpacity={fired ? 0.75 : 0.25} strokeWidth="1.5" style={{ transition: "all 0.5s ease" }} />
            <circle cx={NODE.x} cy={NODE.y} r="13" fill="none" stroke="#cbd5e1" strokeOpacity="0.5" strokeWidth="1.2">
              <animateTransform attributeName="transform" type="rotate" from={`0 ${NODE.x} ${NODE.y}`} to={`360 ${NODE.x} ${NODE.y}`} dur="7s" repeatCount="indefinite" />
            </circle>
            <circle cx={NODE.x} cy={NODE.y} r="6.5" fill="#cbd5e1" style={{ filter: "drop-shadow(0 0 8px #f1f5f9)" }}>
              <animate attributeName="r" values="5.5;7.5;5.5" dur="1.7s" repeatCount="indefinite" />
            </circle>
            <text x={NODE.x} y={NODE.y + 52} fill="#cbd5e1" fontSize="12.5" textAnchor="middle"
              fontFamily="Geist Mono, monospace" opacity={fired ? 1 : 0.55} style={{ transition: "opacity 0.4s" }}>
              {fired ? "order placed" : "all threads agree"}
            </text>
          </g>
        </svg>
        <style>{`.loom-dash { animation: loomdash 0.9s linear infinite; } @keyframes loomdash { to { stroke-dashoffset: -13; } }`}</style>
      </div>
      <p className="mt-3 mono text-[10.5px] tracking-[0.18em] uppercase text-[#6b7280] text-center">Signals woven live · the trade fires when all threads agree</p>
    </div>
  );
}
