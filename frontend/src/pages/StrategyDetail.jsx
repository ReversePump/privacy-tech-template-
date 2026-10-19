import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { loom, errorMessage } from "../lib/api";
import { fmtUsd, fmtPct, fmtPctSigned, fmtNum } from "../lib/format";
import { Panel, Tag, Sparkline, Loading, Empty } from "../components/bits";
import RulesView from "../components/RulesView";

export default function StrategyDetail() {
  const { id } = useParams();
  const [strategy, setStrategy] = useState(null);
  const [missing, setMissing] = useState(false);
  const [bt, setBt] = useState(null);
  const [btBusy, setBtBusy] = useState(false);

  useEffect(() => {
    setStrategy(null);
    setMissing(false);
    setBt(null);
    Promise.all([loom.strategies().catch(() => ({ strategies: [] })), loom.examples().catch(() => ({ strategies: [] }))])
      .then(([a, b]) => {
        const all = [...(a.strategies || []), ...(b.strategies || [])];
        const found = all.find((s) => (s.strategy?.id || s.id) === id);
        if (found) setStrategy(found.strategy || found);
        else setMissing(true);
      });
  }, [id]);

  const runBacktest = async () => {
    if (!strategy || btBusy) return;
    setBtBusy(true);
    setBt(null);
    try {
      setBt(await loom.backtest({ strategy }));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBtBusy(false);
    }
  };

  const equity = (bt?.equityCurve || []).map((p) => ({ t: p.t ?? p[0], v: p.equityUsd ?? p.v ?? p[1] }));

  if (missing) return <div className="mx-auto max-w-[860px] px-4 pt-20"><Empty>Strategy not found. <Link to="/strategies" className="text-[#f1f5f9]">Browse all →</Link></Empty></div>;
  if (!strategy) return <Loading label="Loading strategy" />;

  return (
    <div className="mx-auto max-w-[860px] px-4 md:px-6 pt-14" data-testid="strategy-detail-page">
      <div className="mono text-[11px] uppercase tracking-wider text-[#9aa0ae]">
        <Link to="/strategies" className="hover:text-[#cbd5e1]">Strategies</Link> / {strategy.id}
      </div>
      <h1 className="mt-4 serif text-4xl md:text-5xl font-light tracking-tight">{strategy.name}</h1>

      <Panel className="mt-8 p-6">
        <RulesView strategy={strategy} />
      </Panel>

      <Panel className="mt-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="mono text-[10px] uppercase tracking-[0.16em] text-[#9aa0ae]">Backtest</div>
            <p className="mt-1 text-[13px] text-[#9aa0ae]">Replay the last 30 days at real prices with $10,000 of pretend money.</p>
          </div>
          <button onClick={runBacktest} disabled={btBusy} data-testid="detail-backtest-btn"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-[#e5e7eb] px-5 text-[13px] font-medium text-black shadow-[0_0_20px_rgba(226,232,255,0.35)] hover:bg-[#f1f5f9] disabled:opacity-40 transition-colors">
            {btBusy ? <Loader2 size={14} className="animate-spin" /> : <Play size={13} />} {btBusy ? "Running…" : "Run backtest"}
          </button>
        </div>
        {bt && (
          <div className="mt-6 fadeup" data-testid="detail-backtest-result">
            <Sparkline points={equity} height={140} />
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                ["Return", fmtPctSigned(bt.stats?.returnPct)],
                ["Max drawdown", `−${fmtPct(Math.abs(bt.stats?.maxDrawdownPct ?? 0))}`],
                ["Trades", fmtNum(bt.stats?.trades)],
                ["Win rate", fmtPct(bt.stats?.winRatePct, 0)],
              ].map(([l, v]) => (
                <div key={l}>
                  <div className="mono text-[9px] uppercase tracking-wider text-[#9aa0ae]">{l}</div>
                  <div className="mt-0.5 text-[15px] font-medium tnum">{v}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>

      <Link to={`/new?thesis=${encodeURIComponent(strategy.thesis || strategy.name)}`} data-testid="use-strategy-btn"
        className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-[#e5e7eb] px-6 text-sm font-medium text-black shadow-[0_0_20px_rgba(226,232,255,0.35)] hover:bg-[#f1f5f9] transition-colors">
        Use this strategy <ArrowRight size={14} />
      </Link>
    </div>
  );
}
