import React, { useEffect, useRef, useState } from "react";
import Seo from "../components/Seo";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Sparkles, Play, RotateCcw, Loader2, Check, X, MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";
import { loom, sseStream, errorMessage } from "../lib/api";
import { fmtUsd, fmtPct, fmtPctSigned, fmtNum } from "../lib/format";
import { Panel, Tag, Sparkline } from "../components/bits";
import RulesView from "../components/RulesView";
import { useAuth } from "../solana/AuthContext";
import AuthModal from "../components/AuthModal";

const API = process.env.REACT_APP_BACKEND_URL;

const SUGGESTIONS = [
  "Buy $50 of ETH now",
  "Long BTC 5x with $100 if price holds above $80,000 and funding stays under 0.01%",
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
  const [practice, setPractice] = useState(null);
  const [valid, setValid] = useState(null); // null=unknown, true=validated, string=issue
  const [sizeOverride, setSizeOverride] = useState("");

  const validateDraft = (s) => {
    setValid(null);
    loom.validate(s)
      .then((d) => setValid(d.ok === false ? (d.errors?.[0]?.message || "validation failed") : true))
      .catch(() => setValid(null));
  };
  const started = useRef(false);
  const nav = useNavigate();

  useEffect(() => {
    loom.practice().then(setPractice).catch(() => {});
  }, []);

  const deploy = async (mode) => {
    if (!strategy) return;
    if (!signedIn) { setAuthOpen(true); return; }
    setDeployBusy(mode);
    try {
      const r = await fetch(`${API}/api/deployments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mode, strategy, ...(Number(sizeOverride) > 0 ? { sizeUsd: Number(sizeOverride) } : {}) }),
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
        validateDraft(got);
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
          validateDraft(ev.data.strategy);
        } else if (ev.event === "error") {
          throw new Error(ev.data?.error || ev.data?.message || "Drafting failed");
        }
      }
    } catch (e) {
      // fall back to the non-streaming endpoint
      try {
        const d = await loom.generate(t);
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
      const d = await loom.backtest({ strategy });
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
      <Seo title="New strategy · Loom" description="Describe a trade in your own words — Loom turns it into readable rules you can backtest, then run as practice, alerts or live." path="/new" />
      <h1 className="serif text-4xl md:text-5xl font-light tracking-tight">New strategy</h1>
      <p className="mt-3 text-[14px] text-[#9aa0ae]">Describe a trade in your own words. Loom turns it into rules you can read before anything runs.</p>

      <Panel className="mt-8 p-5" data-testid="thesis-panel">
        <label className="mono text-[10px] uppercase tracking-[0.16em] text-[#9aa0ae]">Your idea</label>
        <textarea
          value={thesis}
          onChange={(e) => setThesis(e.target.value)}
          rows={3}
          placeholder="Long BTC 5x with $100 if funding stays under 0.01% and price holds $80,000. 25% stop."
          className="mt-2 w-full resize-none rounded-lg border border-[#ffffff26] bg-[#17171b] px-4 py-3 text-[14px] leading-relaxed outline-none focus:border-[#ffffff66]"
          data-testid="thesis-input"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={() => draft()}
            disabled={busy || !thesis.trim()}
            data-testid="draft-btn"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-[#e5e7eb] px-5 text-[13px] font-medium text-black shadow-[0_0_20px_rgba(226,232,255,0.35)] hover:bg-[#f1f5f9] disabled:opacity-40 transition-colors"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {busy ? "Drafting…" : "Draft the rules"}
          </button>
          {strategy && (
            <button onClick={() => { setStrategy(null); setBt(null); setProgress([]); }} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-[#ffffff26] px-4 text-[13px] text-[#9aa0ae] hover:text-[#f4f4f5]" data-testid="reset-btn">
              <RotateCcw size={13} /> Start over
            </button>
          )}
        </div>
        {!strategy && !busy && (
          <div className="mt-4 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => { setThesis(s); }} className="rounded-full border border-[#ffffff26] px-3.5 py-1.5 text-[11.5px] text-[#9aa0ae] hover:border-[#f1f5f9] hover:text-[#cbd5e1] transition-colors" data-testid="suggestion-chip">
                {s.length > 52 ? `${s.slice(0, 52)}…` : s}
              </button>
            ))}
          </div>
        )}
      </Panel>

      {busy && (
        <Panel className="mt-6 p-5" data-testid="progress-panel">
          <div className="mono text-[10px] uppercase tracking-[0.16em] text-[#9aa0ae] mb-3">Working</div>
          <ul className="space-y-2">
            {progress.map((m, i) => (
              <li key={i} className="flex items-center gap-2.5 text-[13px] text-[#f4f4f5] fadeup">
                <span className="flex h-4 w-4 items-center justify-center">
                  {i === progress.length - 1 ? <Loader2 size={12} className="animate-spin text-[#f1f5f9]" /> : <Check size={12} className="text-[#10b981]" />}
                </span>
                {m}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {err && (
        <Panel className="mt-6 border-[#f43f5e55] bg-[#f43f5e14] p-4 text-[13px] text-[#f43f5e]" data-testid="draft-error">
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
                  className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-full border border-[#ffffff26] px-4 text-[12px] hover:border-[#f1f5f9] hover:text-[#cbd5e1] disabled:opacity-50 transition-colors">
                  {saved ? "Saved ✓" : "Save to my account"}
                </button>
              )}
            </div>
            <div className="mt-5">
              <RulesView strategy={strategy} />
            </div>

            {/* AI refine — conversationally tune the draft */}
            <div className="mt-5 border-t border-[#ffffff26] pt-4" data-testid="refine-panel">
              <div className="flex items-center gap-2 mono text-[10px] uppercase tracking-[0.16em] text-[#9aa0ae]">
                <MessageSquare size={11} /> Refine it
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  value={refineText}
                  onChange={(e) => setRefineText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && refine()}
                  placeholder='Try: "make the stop tighter" or "use 3x instead"'
                  className="h-10 flex-1 rounded-lg border border-[#ffffff26] bg-[#17171b] px-3.5 text-[13px] outline-none focus:border-[#ffffff66]"
                  data-testid="refine-input"
                />
                <button onClick={refine} disabled={refineBusy || !refineText.trim()} data-testid="refine-btn"
                  className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#e5e7eb] px-4 text-[12.5px] font-medium text-black shadow-[0_0_20px_rgba(226,232,255,0.35)] hover:bg-[#f1f5f9] disabled:opacity-40 transition-colors">
                  {refineBusy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Refine
                </button>
              </div>
            </div>
          </Panel>

          <Panel className="p-6" data-testid="backtest-panel">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="mono text-[10px] uppercase tracking-[0.16em] text-[#9aa0ae]">Backtest</div>
                <p className="mt-1 text-[13px] text-[#9aa0ae]">Replay the last 30 days at real prices with $10,000 of pretend money.</p>
              </div>
              <button onClick={runBacktest} disabled={btBusy} data-testid="backtest-btn"
                className="inline-flex h-10 items-center gap-2 rounded-full bg-[#e5e7eb] px-5 text-[13px] font-medium text-black shadow-[0_0_20px_rgba(226,232,255,0.35)] hover:bg-[#f1f5f9] disabled:opacity-40 transition-colors">
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
                      <div className="mono text-[9px] uppercase tracking-wider text-[#9aa0ae]">{l}</div>
                      <div className="mt-0.5 text-[15px] font-medium tnum">{v}</div>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-[11px] text-[#9aa0ae]">Backtests replay the past at real prices. They do not guarantee future results.</p>
              </div>
            )}
          </Panel>

          <Panel className="p-6" data-testid="start-panel">
            <div className="mono text-[10px] uppercase tracking-[0.16em] text-[#9aa0ae]">Start it</div>
            <p className="mt-2 text-[13px] text-[#9aa0ae]">
              Run it with $10,000 of pretend money at real prices, as alerts only, or live from your own account. Sign in with email — Loom creates the wallet and Hyperliquid account for you.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2" data-testid="size-override-row">
              <span className="mono text-[10px] uppercase tracking-wider text-[#9aa0ae]">Size per trade</span>
              <input type="number" min={10} max={10000} value={sizeOverride} onChange={(e) => setSizeOverride(e.target.value)}
                placeholder={`$${(strategy.actions || []).find((a) => a.type === "open" && a.size?.unit === "usd")?.size?.value || 50}`}
                data-testid="size-override-input"
                className="h-9 w-24 rounded-lg border border-[#ffffff26] bg-[#17171b] px-3 mono text-[12px] outline-none focus:border-[#ffffff59]" />
              <span className="text-[11px] text-[#9aa0ae]">every time it fires — type to change, or leave the strategy default</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button onClick={() => deploy("paper")} disabled={!!deployBusy} data-testid="start-practice-btn"
                className="inline-flex h-10 items-center gap-2 rounded-full bg-[#e5e7eb] px-5 text-[13px] font-medium text-black shadow-[0_0_20px_rgba(226,232,255,0.35)] hover:bg-[#f1f5f9] disabled:opacity-40 transition-colors">
                {deployBusy === "paper" ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Practice with $10,000
              </button>
              <button onClick={() => deploy("alerts")} disabled={!!deployBusy} data-testid="start-alerts-btn"
                className="inline-flex h-10 items-center gap-2 rounded-full border border-[#ffffff26] px-5 text-[13px] hover:border-[#ffffff59] disabled:opacity-40 transition-colors">
                {deployBusy === "alerts" && <Loader2 size={13} className="animate-spin" />} Alerts only
              </button>
              <button onClick={() => deploy("live")} disabled={!!deployBusy} data-testid="start-live-btn"
                className="inline-flex h-10 items-center gap-2 rounded-full border border-[#ffffff26] px-5 text-[13px] hover:border-[#ffffff59] disabled:opacity-40 transition-colors">
                {deployBusy === "live" && <Loader2 size={13} className="animate-spin" />} Go live
              </button>
            </div>
            <p className="mt-3 text-[11px] text-[#9aa0ae]">The engine checks your rules every ~25 seconds, around the clock. Manage deployments from your account.</p>
            {practice?.enabled && (
              <p className="mt-1.5 mono text-[10px] uppercase tracking-wider text-[#10b981]" data-testid="practice-status">
                Practice live · ${practice.budgetUsd?.toLocaleString()} budget · up to {practice.maxRuns} runs at once
              </p>
            )}
          </Panel>
        </div>
      )}
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
