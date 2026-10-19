import React, { useEffect, useState } from "react";
import Seo from "../components/Seo";
import { Link } from "react-router-dom";
import { loom } from "../lib/api";
import { fmtUsd, fmtUsdSigned, fmtPctSigned, fmtAge } from "../lib/format";
import { Panel, Tag, Loading, Empty, Sparkline } from "../components/bits";

export default function Leaderboard() {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    loom.leaderboard().then((d) => setRows(d.rows || [])).catch(() => setRows([]));
  }, []);

  return (
    <div className="mx-auto max-w-[1200px] px-4 md:px-6 pt-14" data-testid="leaderboard-page">
      <Seo title="Leaderboard · Loom" description="Live strategy leaderboard — which theses are actually making money right now." path="/leaderboard" />
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
                <tr><th>#</th><th>Strategy</th><th>Mode</th><th className="text-right">P&L</th><th className="text-right">Return</th><th>Curve</th><th className="text-right">Started</th><th></th></tr>
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
                          <div className="text-[13px] font-medium">{s.name || r.name || r.strategyId}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {(r.tags || []).slice(0, 3).map((t) => <Tag key={t} tone="neutral">{t}</Tag>)}
                          </div>
                        </Link>
                      </td>
                      <td><Tag tone={r.mode === "live" ? "long" : "neutral"}>{r.mode || "practice"}</Tag></td>
                      <td className={`text-right mono tnum ${(pnl ?? 0) < 0 ? "text-[#f43f5e]" : "text-[#10b981]"}`}>{fmtUsdSigned(pnl)}</td>
                      <td className={`text-right mono tnum ${(ret ?? 0) < 0 ? "text-[#f43f5e]" : "text-[#10b981]"}`}>{fmtPctSigned(ret)}</td>
                      <td className="w-[110px]">
                        {(r.returnCurve || []).length > 1 && (
                          <Sparkline points={r.returnCurve.map((p) => ({ t: p[0], v: p[1] }))} height={26} />
                        )}
                      </td>
                      <td className="text-right mono text-[11px] text-[#9aa0ae]">{fmtAge(r.since || r.startedAt || r.createdAt)}</td>
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
