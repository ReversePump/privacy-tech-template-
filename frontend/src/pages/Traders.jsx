import React, { useEffect, useState } from "react";
import { weft } from "../lib/api";
import { fmtUsd0, fmtUsdSigned, fmtPctSigned, short } from "../lib/format";
import { Panel, Tag, Loading, Empty } from "../components/bits";

export default function Traders() {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    weft.traders().then((d) => setRows(d.traders || [])).catch(() => setRows([]));
  }, []);

  return (
    <div className="mx-auto max-w-[1200px] px-4 md:px-6 pt-14" data-testid="traders-page">
      <h1 className="serif text-4xl md:text-5xl font-light tracking-tight">Traders</h1>
      <p className="mt-3 max-w-xl text-[14px] text-[#75777d]">
        Hyperliquid's public leaderboard. Copy a trader's entries with your own size and stop — or fade them. One sentence is enough.
      </p>

      <Panel className="mt-8 overflow-hidden" data-testid="traders-table-panel">
        {!rows && <Loading label="Loading traders" />}
        {rows && rows.length === 0 && <Empty>No traders right now.</Empty>}
        {rows && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="dtable" data-testid="traders-table">
              <thead>
                <tr><th>Trader</th><th className="text-right">Account</th><th className="text-right">P&L 30d</th><th className="text-right">ROI 30d</th><th className="text-right">P&L 7d</th><th className="text-right">All time</th><th></th></tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.address} data-testid={`trader-row-${t.name || short(t.address, 4, 4)}`}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#2b59ff12] mono text-[10px] text-[#2b59ff]">
                          {(t.name || t.address || "?").slice(0, 2).toUpperCase()}
                        </span>
                        <div>
                          <div className="text-[13px] font-medium">{t.name || short(t.address, 6, 6)}</div>
                          <div className="mono text-[10px] text-[#75777d]">{short(t.address, 6, 6)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="text-right mono tnum">{fmtUsd0(t.accountValueUsd)}</td>
                    <td className={`text-right mono tnum ${t.pnl30dUsd < 0 ? "text-[#c23434]" : "text-[#0b9466]"}`}>{fmtUsdSigned(t.pnl30dUsd)}</td>
                    <td className={`text-right mono tnum ${t.roi30dPct < 0 ? "text-[#c23434]" : "text-[#0b9466]"}`}>{fmtPctSigned(t.roi30dPct)}</td>
                    <td className={`text-right mono tnum ${t.pnl7dUsd < 0 ? "text-[#c23434]" : "text-[#0b9466]"}`}>{fmtUsdSigned(t.pnl7dUsd)}</td>
                    <td className="text-right mono tnum">{fmtUsd0(t.pnlAllTimeUsd)}</td>
                    <td className="text-right">
                      <a className="inline-flex items-center gap-1 text-[12px] text-[#2b59ff] hover:underline"
                        href={`/new?thesis=${encodeURIComponent(`Copy ${t.name || t.address} on Hyperliquid with $100 per trade. 15% stop.`)}`}
                        data-testid={`copy-trader-${short(t.address, 4, 4)}`}>
                        Copy →
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <p className="mt-4 text-[11px] text-[#75777d]">Past performance is not a promise. Fading works too: “fade {rows?.[0]?.name || "a trader"}, longs only”.</p>
    </div>
  );
}
