import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { weft } from "../lib/api";
import { fmtUsd, fmtUsdSigned, fmtPctSigned, fmtAge } from "../lib/format";
import { Panel, Tag, Loading, Empty } from "../components/bits";

export default function Leaderboard() {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    weft.leaderboard().then((d) => setRows(d.rows || [])).catch(() => setRows([]));
  }, []);

  return (
    <div className="mx-auto max-w-[1200px] px-4 md:px-6 pt-14" data-testid="leaderboard-page">
      <h1 className="serif text-4xl md:text-5xl font-light tracking-tight">Leaderboard</h1>
      <p className="mt-3 max-w-xl text-[14px] text-[#9aa0ae]">
        Live deployments, no names attached. Every fill is real; shareable result cards come from here.
      </p>

      <Panel className="mt-8 overflow-hidden" data-testid="leaderboard-panel">
        {!rows && <Loading label="Loading leaderboard" />}
        {rows && rows.length === 0 && <Empty>No deployments yet.</Empty>}
        {rows && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="dtable" data-testid="leaderboard-table">
              <thead>
                <tr><th>#</th><th>Strategy</th><th>Mode</th><th className="text-right">P&L</th><th className="text-right">Return</th><th className="text-right">Trades</th><th className="text-right">Started</th><th></th></tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const s = r.strategy || {};
                  const pnl = r.pnlUsd ?? r.stats?.pnlUsd;
                  const ret = r.returnPct ?? r.stats?.returnPct;
                  return (
                    <tr key={r.deploymentId || i} data-testid={`lb-row-${i}`}>
                      <td className="mono text-[#9aa0ae]">{i + 1}</td>
                      <td>
                        <Link to={`/strategies/${s.id || r.strategyId}`} className="hover:text-[#cbd5e1]">
                          <div className="text-[13px] font-medium">{s.name || r.strategyId}</div>
                          <div className="mono text-[10px] text-[#9aa0ae]">{s.id || r.strategyId}</div>
                        </Link>
                      </td>
                      <td><Tag tone={r.mode === "live" ? "long" : "neutral"}>{r.mode || "practice"}</Tag></td>
                      <td className={`text-right mono tnum ${(pnl ?? 0) < 0 ? "text-[#f43f5e]" : "text-[#10b981]"}`}>{fmtUsdSigned(pnl)}</td>
                      <td className={`text-right mono tnum ${(ret ?? 0) < 0 ? "text-[#f43f5e]" : "text-[#10b981]"}`}>{fmtPctSigned(ret)}</td>
                      <td className="text-right mono tnum">{r.trades ?? r.stats?.trades ?? "—"}</td>
                      <td className="text-right mono text-[11px] text-[#9aa0ae]">{fmtAge(r.startedAt || r.createdAt)}</td>
                      <td className="text-right">
                        <Link to={`/strategies/${s.id || r.strategyId}`} className="text-[12px] text-[#f1f5f9] hover:underline">Open →</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
