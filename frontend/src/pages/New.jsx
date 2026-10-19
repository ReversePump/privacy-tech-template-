import React, { useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Sparkles, Play, RotateCcw, Loader2, Check, X, MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";
import { weft, sseStream, errorMessage } from "../lib/api";
import { fmtUsd, fmtPct, fmtPctSigned, fmtNum } from "../lib/format";
import { Panel, Tag, Sparkline } from "../components/bits";
import RulesView from "../components/RulesView";
import { useAuth } from "../solana/AuthContext";
import AuthModal from "../components/AuthModal";

const API = process.env.REACT_APP_BACKEND_URL;

const SUGGESTIONS = [
  "Buy $50 of ETH now",
  "If @elonmusk posts about Dogecoin, long DOGE 5x with $100",
  "Long BTC and ETH 20x with $100 each if Fear & Greed drops to 20",
  "Short SOL 3x with $50 if funding stays above 0.02% an hour",
  "If the Fear & Greed index reaches 20, open a 20x long on ETH and BTC with $100 on each",
];

export default function New() {
  const [params] = useSearchParams();
  const { signedIn, token } = useAuth();
  const [thesis, setThesis] = useState(params.get("thesis") || "");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState([]);
  const [strategy, setStrategy] = useState(null);
  const [err, setErr] = useState(null);
  const [saved, setSaved] = useState(false);
  const [bt, setBt] = useState(null);
  const [btBusy, setBtBusy] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [deployBusy, setDeployBusy] = useState("");
  const [refineText, setRefineText] = useState("");
  const [refineBusy, setRefineBusy] = useState(false);
  const started = useRef(false);
  const nav = useNavigate();

  const deploy = async (mode) => {
    if (!strategy) return;
    if (!signedIn) { setAuthOpen(true); return; }
    setDeployBusy(mode);
    try {
      const r = await fetch(`${API}/api/deployments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mode, strategy }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error === "live_needs_email_account" ? "Live mode needs an email account — sign in with email so a wallet can be generated for you" : d.error || `failed (${r.status})`);
      toast.success(
        mode === "paper" ? "Deployed — running with $10,000 practice money at real prices"
        : mode === "alerts" ? "Deployed — you'll get alerts here instead of trades"
        : "Deployed live — trades execute from your generated wallet",
        { action: { label: "View", onClick: () => nav("/account") } },
      );
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDeployBusy("");
    }
  };

  const refine = async () => {
    const t = refineText.trim();
    if (!t || !strategy || refineBusy) return;
    setRefineBusy(true);
    try {
      let got = null;
      for await (const ev of sseStream("/ai/refine/stream", { strategy, instruction: t })) {
        if ((ev.event === "result" || ev.event === "strategy") && ev.data?.strategy) got = ev.data.strategy;
        else if (ev.event === "error") throw new Error(ev.data?.error || ev.data?.message || "Refine failed");
      }
      if (got) {
        setStrategy(got);
        setBt(null);
        setSaved(false);
        setRefineText("");
        toast.success("Draft updated");
      } else {
        throw new Error("No updated draft returned");
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setRefineBusy(false);
    }
  };

  const draft = async (text) => {
    const t = (text ?? thesis).trim();
    if (!t || busy) return;
    setBusy(true);
    setStrategy(null);
    setBt(null);
    setErr(null);
    setSaved(false);
    setProgress([]);
    try {
      for await (const ev of sseStream("/ai/generate/stream", { thesis: t })) {
        if (ev.event === "progress" && ev.data?.message) {
          setProgress((p) => [...p, ev.data.message]);
        } else if (ev.event === "result" && ev.data?.strategy) {
          setStrategy(ev.data.strategy);
        } else if (ev.event === "error") {
          throw new Error(ev.data?.error || ev.data?.message || "Drafting failed");
        }
      }
    } catch (e) {
      // fall back to the non-streaming endpoint
      try {
        const d = await weft.generate(t);
        if (d.strategy) setStrategy(d.strategy);
      } catch (e2) {
        const msg = errorMessage(e2);
        setErr(msg);
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const saveStrategy = async () => {
    if (!strategy) return;
    try {
      await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/me/strategies`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ strategy }),
      }).then((r) => { if (!r.ok) throw new Error("save failed"); });
      setSaved(true);
      toast.success("Saved to your account");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  useEffect(() => {
    const t = params.get("thesis");
    if (t && !started.current) {
      started.current = true;
      setThesis(t);
      draft(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runBacktest = async () => {
    if (!strategy || btBusy) return;
    setBtBusy(true);
    setBt(null);
    try {
      const d = await weft.backtest({ strategy });
      setBt(d);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBtBusy(false);
    }
  };

  const equity = (bt?.equityCurve || []).map((p) => ({ t: p.t ?? p[0], v: p.equityUsd ?? p.v ?? p[1] }));

  return (
    <div className="mx-auto max-w-[860px] px-4 md:px-6 pt-14 md:pt-20" data-testid="new-page">
      <h1 className="serif text-4xl md:text-5xl font-light tracking-tight">New strategy</h1>
      <p className="mt-3 text-[14px] text-[#75777d]">Describe a trade in your own words. Swift Fi turns it into rules you can read before anything runs.</p>

      <Panel className="mt-8 p-5" data-testid="thesis-panel">
        <label className="mono text-[10px] uppercase tracking-[0.16em] text-[#75777d]">Your idea</label>
        <textarea
          value={thesis}
          onChange={(e) => setThesis(e.target.value)}
          rows={3}
          placeholder="If @elonmusk posts about Dogecoin, long DOGE 5x with $100. 25% stop."
          className="mt-2 w-full resize-none rounded-lg border border-[#12121414] bg-[#faf9f7] px-4 py-3 text-[14px] leading-relaxed outline-none focus:border-[#2b59ff55]"
          data-testid="thesis-input"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={() => draft()}
            disabled={busy || !thesis.trim()}
            data-testid="draft-btn"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-[#121214] px-5 text-[13px] font-medium text-white hover:bg-[#2b59ff] disabled:opacity-40 transition-colors"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {busy ? "Drafting…" : "Draft the rules"}
          </button>
          {strategy && (
            <button onClick={() => { setStrategy(null); setBt(null); setProgress([]); }} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-[#12121414] px-4 text-[13px] text-[#75777d] hover:text-[#121214]" data-testid="reset-btn">
              <RotateCcw size={13} /> Start over
            </button>
          )}
        </div>
        {!strategy && !busy && (
          <div className="mt-4 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => { setThesis(s); }} className="rounded-full border border-[#12121414] px-3.5 py-1.5 text-[11.5px] text-[#75777d] hover:border-[#2b59ff] hover:text-[#2b59ff] transition-colors" data-testid="suggestion-chip">
                {s.length > 52 ? `${s.slice(0, 52)}…` : s}
              </button>
            ))}
          </div>
        )}
      </Panel>

      {busy && (
        <Panel className="mt-6 p-5" data-testid="progress-panel">
          <div className="mono text-[10px] uppercase tracking-[0.16em] text-[#75777d] mb-3">Working</div>
          <ul className="space-y-2">
            {progress.map((m, i) => (
              <li key={i} className="flex items-center gap-2.5 text-[13px] text-[#121214] fadeup">
                <span className="flex h-4 w-4 items-center justify-center">
                  {i === progress.length - 1 ? <Loader2 size={12} className="animate-spin text-[#2b59ff]" /> : <Check size={12} className="text-[#0b9466]" />}
                </span>
                {m}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {err && (
        <Panel className="mt-6 border-[#c2343433] bg-[#c2343408] p-4 text-[13px] text-[#c23434]" data-testid="draft-error">
          {err.includes("drafted") ? "The drafting engine is at its anonymous daily limit right now — try again later, or sign in for a higher allowance." : err}
        </Panel>
      )}

      {strategy && (
        <div className="mt-6 space-y-6 fadeup" data-testid="strategy-result">
          <Panel className="p-6">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="serif text-2xl font-medium">{strategy.name}</h2>
              <Tag tone="accent">{strategy.id}</Tag>
              {signedIn && (
                <button onClick={saveStrategy} disabled={saved} data-testid="save-strategy-btn"
                  className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-full border border-[#12121414] px-4 text-[12px] hover:border-[#2b59ff] hover:text-[#2b59ff] disabled:opacity-50 transition-colors">
                  {saved ? "Saved ✓" : "Save to my account"}
                </button>
              )}
            </div>
            <div className="mt-5">
              <RulesView strategy={strategy} />
            </div>

            {/* AI refine — conversationally tune the draft */}
            <div className="mt-5 border-t border-[#12121414] pt-4" data-testid="refine-panel">
              <div className="flex items-center gap-2 mono text-[10px] uppercase tracking-[0.16em] text-[#75777d]">
                <MessageSquare size={11} /> Refine it
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  value={refineText}
                  onChange={(e) => setRefineText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && refine()}
                  placeholder='Try: "make the stop tighter" or "use 3x instead"'
                  className="h-10 flex-1 rounded-lg border border-[#12121414] bg-[#faf9f7] px-3.5 text-[13px] outline-none focus:border-[#2b59ff55]"
                  data-testid="refine-input"
                />
                <button onClick={refine} disabled={refineBusy || !refineText.trim()} data-testid="refine-btn"
                  className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#121214] px-4 text-[12.5px] font-medium text-white hover:bg-[#2b59ff] disabled:opacity-40 transition-colors">
                  {refineBusy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Refine
                </button>
              </div>
            </div>
          </Panel>

          <Panel className="p-6" data-testid="backtest-panel">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="mono text-[10px] uppercase tracking-[0.16em] text-[#75777d]">Backtest</div>
                <p className="mt-1 text-[13px] text-[#75777d]">Replay the last 30 days at real prices with $10,000 of pretend money.</p>
              </div>
              <button onClick={runBacktest} disabled={btBusy} data-testid="backtest-btn"
                className="inline-flex h-10 items-center gap-2 rounded-full bg-[#121214] px-5 text-[13px] font-medium text-white hover:bg-[#2b59ff] disabled:opacity-40 transition-colors">
                {btBusy ? <Loader2 size={14} className="animate-spin" /> : <Play size={13} />} {btBusy ? "Running…" : "Run 30-day backtest"}
              </button>
            </div>

            {bt && (
              <div className="mt-6 fadeup" data-testid="backtest-result">
                <Sparkline points={equity} height={140} />
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    ["Return", fmtPctSigned(bt.stats?.returnPct)],
                    ["Max drawdown", `−${fmtPct(Math.abs(bt.stats?.maxDrawdownPct ?? 0))}`],
                    ["Trades", fmtNum(bt.stats?.trades)],
                    ["Win rate", fmtPct(bt.stats?.winRatePct, 0)],
                    ["Fees", fmtUsd(bt.stats?.feesUsd)],
                    ["End equity", fmtUsd(bt.stats?.endEquityUsd)],
                    ["Exposure", fmtPct(bt.stats?.exposurePct, 0)],
                    ["Rejected", fmtNum(bt.stats?.rejectedOrders)],
                  ].map(([l, v]) => (
                    <div key={l}>
                      <div className="mono text-[9px] uppercase tracking-wider text-[#75777d]">{l}</div>
                      <div className="mt-0.5 text-[15px] font-medium tnum">{v}</div>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-[11px] text-[#75777d]">Backtests replay the past at real prices. They do not guarantee future results.</p>
              </div>
            )}
          </Panel>

          <Panel className="p-6" data-testid="start-panel">
            <div className="mono text-[10px] uppercase tracking-[0.16em] text-[#75777d]">Start it</div>
            <p className="mt-2 text-[13px] text-[#75777d]">
              Run it with $10,000 of pretend money at real prices, as alerts only, or live from your own account. Sign in with email — Swift Fi creates the wallet and Hyperliquid account for you.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button onClick={() => deploy("paper")} disabled={!!deployBusy} data-testid="start-practice-btn"
                className="inline-flex h-10 items-center gap-2 rounded-full bg-[#121214] px-5 text-[13px] font-medium text-white hover:bg-[#2b59ff] disabled:opacity-40 transition-colors">
                {deployBusy === "paper" ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Practice with $10,000
              </button>
              <button onClick={() => deploy("alerts")} disabled={!!deployBusy} data-testid="start-alerts-btn"
                className="inline-flex h-10 items-center gap-2 rounded-full border border-[#12121414] px-5 text-[13px] hover:border-[#12121433] disabled:opacity-40 transition-colors">
                {deployBusy === "alerts" && <Loader2 size={13} className="animate-spin" />} Alerts only
              </button>
              <button onClick={() => deploy("live")} disabled={!!deployBusy} data-testid="start-live-btn"
                className="inline-flex h-10 items-center gap-2 rounded-full border border-[#12121414] px-5 text-[13px] hover:border-[#12121433] disabled:opacity-40 transition-colors">
                {deployBusy === "live" && <Loader2 size={13} className="animate-spin" />} Go live
              </button>
            </div>
            <p className="mt-3 text-[11px] text-[#75777d]">The engine checks your rules every ~25 seconds, around the clock. Manage deployments from your account.</p>
          </Panel>
        </div>
      )}
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
