import React, { useEffect, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { makers } from "../lib/api";
import { fmtUsd } from "../lib/format";
import { Loading } from "./bits";

export default function DeskChart({ deskId, height = 300 }) {
  const [range, setRange] = useState("24h");
  const [mode, setMode] = useState("price");
  const [data, setData] = useState(null);

  useEffect(() => {
    let live = true;
    setData(null);
    makers.chart(deskId, range)
      .then((d) => live && setData(d))
      .catch(() => live && setData({ points: [], trades: [], claims: [] }));
    return () => { live = false; };
  }, [deskId, range]);

  const points = (data?.points || []).map((p) => ({
    t: Date.parse(p.at || p.t || p.time),
    price: p.priceSol ?? p.price ?? p.close ?? null,
    mcap: p.mcapUsd ?? p.mcap ?? null,
  })).filter((p) => p.t && (mode === "price" ? p.price != null : p.mcap != null));

  return (
    <div data-testid="desk-chart">
      <div className="flex items-center justify-between px-4 pt-3">
        <div className="flex gap-1">
          {[["price", "Price"], ["mcap", "Mcap"]].map(([k, l]) => (
            <button key={k} data-testid={`chart-mode-${k}`} onClick={() => setMode(k)}
              className={`rounded-[3px] px-3 py-1 font-mono text-[11px] uppercase ${mode === k ? "bg-[#3F9E00] text-[#131a0f]" : "text-[#5c6b50] hover:bg-black/5"}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {["1h", "6h", "24h", "7d"].map((r) => (
            <button key={r} data-testid={`chart-range-${r}`} onClick={() => setRange(r)}
              className={`rounded-[3px] px-2.5 py-1 font-mono text-[11px] uppercase ${range === r ? "bg-black/10 text-[#131a0f]" : "text-[#93a184] hover:text-[#131a0f]"}`}>
              {r}
            </button>
          ))}
        </div>
      </div>
      <div style={{ height }} className="px-2 pb-2 pt-2">
        {!data && <Loading label="Loading chart" />}
        {data && points.length === 0 && (
          <div className="flex h-full items-center justify-center font-mono text-xs text-[#93a184]">
            Not enough price history for this range yet. The maker records the price once a minute.
          </div>
        )}
        {data && points.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="mintfill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3F9E00" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#3F9E00" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="t" tickFormatter={(t) => new Date(t).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                stroke="#c9d6b8" fontSize={10} tickLine={false} axisLine={false} minTickGap={60} />
              <YAxis orientation="right" domain={["auto", "auto"]} stroke="#c9d6b8" fontSize={10} tickLine={false} axisLine={false}
                tickFormatter={(v) => (v >= 1 ? v.toFixed(2) : v >= 0.001 ? v.toFixed(5) : v.toExponential(1))} width={64} />
              <Tooltip
                contentStyle={{ background: "#ffffff", border: "1px solid rgba(19,26,15,0.12)", borderRadius: 8, fontFamily: "Space Mono", fontSize: 12 }}
                labelStyle={{ color: "#5c6b50" }}
                labelFormatter={(t) => new Date(t).toLocaleString()}
                formatter={(v) => [mode === "price" ? `${Number(v).toPrecision(6)} SOL` : fmtUsd(v), mode]}
              />
              <Area type="monotone" dataKey={mode === "price" ? "price" : "mcap"} stroke="#3F9E00" strokeWidth={1.5} fill="url(#mintfill)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="flex items-center gap-4 border-t border-black/5 px-4 py-2.5 font-mono text-[10px] uppercase tracking-wider text-[#93a184]">
        <span className="flex items-center gap-1.5"><span className="text-[#38c973]">▲</span> Maker buy</span>
        <span className="flex items-center gap-1.5"><span className="text-[#ff4d4f]">▼</span> Maker sell</span>
        <span className="flex items-center gap-1.5"><span className="text-[#3F9E00]">◆</span> Rewards claimed</span>
      </div>
    </div>
  );
}
