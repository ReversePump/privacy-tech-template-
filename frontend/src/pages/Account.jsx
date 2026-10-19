import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Wallet, LogOut, Play, Loader2, Copy, Check, ArrowDownUp, ArrowUpRight, CircleX } from "lucide-react";
import { toast } from "sonner";
import { weft, errorMessage } from "../lib/api";
import { fmtUsd, fmtPctSigned, fmtAge, short } from "../lib/format";
import { Panel, Tag, Loading, Empty, Sparkline } from "../components/bits";
import { useAuth } from "../solana/AuthContext";
import AuthModal from "../components/AuthModal";

const API = process.env.REACT_APP_BACKEND_URL;
const WSOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const WEFT = "HqmFi85adLD8BQA7en1HfajdAfzVFps5REgQaYuw6Ax8";

const authed = (token, path, body) =>
  fetch(`${API}/api${path}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => {
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(typeof d.error === "string" ? d.error : `failed (${r.status})`);
    return d;
  });

export default function Account() {
  const { signedIn, signOut, token, wallet, user } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [saved, setSaved] = useState(null);
  const [rewards, setRewards] = useState(null);
  const [btMap, setBtMap] = useState({});
  const [btBusy, setBtBusy] = useState("");
  const [solInfo, setSolInfo] = useState(null);
  const [hlInfo, setHlInfo] = useState(null);
  const [markets, setMarkets] = useState([]);
  const [copied, setCopied] = useState("");

  const isEmail = user?.authType === "email";

  const copy = (v, k) => {
    navigator.clipboard?.writeText(v);
    setCopied(k);
    setTimeout(() => setCopied(""), 1500);
  };

  const refresh = () => {
    if (!signedIn) return;
    authed(token, "/wallet").then(setSolInfo).catch(() => {});
    if (isEmail) authed(token, "/hl/account").then(setHlInfo).catch(() => setHlInfo(null));
  };

  useEffect(() => {
    weft.rewards().then(setRewards).catch(() => {});
    authedPublic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, token]);

  const authedPublic = () => {
    if (!signedIn) return;
    fetch(`${API}/api/me/strategies`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setSaved(d.strategies || []))
      .catch(() => setSaved([]));
    refresh();
    fetch(`${API}/api/hl/markets`).then((r) => r.json()).then((d) => setMarkets(d.markets || [])).catch(() => {});
  };

  if (!signedIn) {
    return (
      <div className="mx-auto max-w-[860px] px-4 md:px-6 pt-20 text-center" data-testid="account-page">
        <Wallet size={28} className="mx-auto text-[#75777d]" />
        <h1 className="mt-4 serif text-3xl font-light">Your account</h1>
        <p className="mt-2 text-[13px] text-[#75777d]">Email and password — we generate your wallets. Or connect your own.</p>
        <button onClick={() => setAuthOpen(true)} data-testid="account-signin-btn"
          className="mt-6 h-11 rounded-full bg-[#121214] px-6 text-sm font-medium text-white hover:bg-[#2b59ff] transition-colors">
          Sign in
        </button>
        <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] px-4 md:px-6 pt-14" data-testid="account-page">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <h1 className="serif text-4xl font-light tracking-tight">Your account</h1>
          <p className="mt-1 mono text-[12px] text-[#75777d]" data-testid="account-wallet">{user?.email || short(wallet, 6, 6)}</p>
        </div>
        <button onClick={signOut} data-testid="account-signout-btn"
          className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-full border border-[#12121414] px-4 text-[12px] text-[#75777d] hover:text-[#121214]">
          <LogOut size={12} /> Sign out
        </button>
      </div>

      <Panel className="mt-8 grid grid-cols-2 md:grid-cols-4 divide-x divide-[#12121414] overflow-hidden" data-testid="account-stats">
        <div className="px-5 py-4">
          <div className="mono text-[10px] uppercase tracking-[0.14em] text-[#75777d]">Solana balance</div>
          <div className="mt-1 text-xl font-medium tnum" data-testid="acct-sol-bal">{solInfo ? `${solInfo.sol.toFixed(4)} SOL` : "—"}</div>
        </div>
        <div className="px-5 py-4">
          <div className="mono text-[10px] uppercase tracking-[0.14em] text-[#75777d]">Hyperliquid equity</div>
          <div className="mt-1 text-xl font-medium tnum" data-testid="acct-hl-eq">{hlInfo ? fmtUsd(hlInfo.equityUsd) : isEmail ? "—" : "n/a"}</div>
          <div className="mt-0.5 text-[11px] text-[#75777d]">{hlInfo ? `${hlInfo.positions.length} open` : ""}</div>
        </div>
        <div className="px-5 py-4">
          <div className="mono text-[10px] uppercase tracking-[0.14em] text-[#75777d]">Saved strategies</div>
          <div className="mt-1 text-xl font-medium tnum">{saved ? saved.length : "—"}</div>
        </div>
        <div className="px-5 py-4">
          <div className="mono text-[10px] uppercase tracking-[0.14em] text-[#75777d]">Rewards</div>
          <div className="mt-1 text-xl font-medium tnum">{rewards ? (rewards.enabled ? (rewards.paused ? "Paused" : "Live") : "Off") : "—"}</div>
          <div className="mt-0.5 text-[11px] text-[#75777d]">$SWIFT share of fees</div>
        </div>
      </Panel>

      {isEmail && (
        <>
          {/* WALLETS */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="wallets-panel">
            <Panel className="p-5">
              <div className="mono text-[10px] uppercase tracking-wider text-[#75777d]">Solana wallet · generated for you</div>
              <button onClick={() => copy(solInfo?.address || wallet, "sol")} className="mt-2 flex items-center gap-2 mono text-[12px] text-[#121214] hover:text-[#2b59ff]" data-testid="sol-address">
                {copied === "sol" ? <Check size={12} className="text-[#0b9466]" /> : <Copy size={12} />}
                {short(solInfo?.address || wallet, 10, 10)}
              </button>
              <p className="mt-2 text-[11.5px] text-[#75777d]">Deposit SOL or USDC here — then swap any Solana token below, for real.</p>
            </Panel>
            <Panel className="p-5">
              <div className="mono text-[10px] uppercase tracking-wider text-[#75777d]">Hyperliquid account · generated for you</div>
              <button onClick={() => copy(hlInfo?.address || "", "hl")} className="mt-2 flex items-center gap-2 mono text-[12px] text-[#121214] hover:text-[#2b59ff]" data-testid="hl-address">
                {copied === "hl" ? <Check size={12} className="text-[#0b9466]" /> : <Copy size={12} />}
                {short(hlInfo?.address || "", 10, 10)}
              </button>
              <p className="mt-2 text-[11.5px] text-[#75777d]">Fund it with USDC on Arbitrum to this address, or USDC from any Hyperliquid account — then trade perps below, for real.</p>
            </Panel>
          </div>

          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SolTradePanel token={token} onDone={refresh} />
            <HlTradePanel token={token} markets={markets} hlInfo={hlInfo} onDone={refresh} />
          </div>

          <WithdrawPanel token={token} hlInfo={hlInfo} onDone={refresh} />
        </>
      )}

      <h2 className="mt-10 serif text-2xl font-light">My strategies</h2>
      <div className="mt-4 space-y-4" data-testid="account-strategies">
        {!saved && <Loading label="Loading your strategies" />}
        {saved && saved.length === 0 && (
          <Empty>Nothing saved yet. <Link to="/new" className="text-[#2b59ff]">Draft a strategy →</Link></Empty>
        )}
        {saved?.map((doc) => {
          const bt = btMap[doc.strategyId];
          const equity = (bt?.equityCurve || []).map((p) => ({ t: p.t ?? p[0], v: p.equityUsd ?? p.v ?? p[1] }));
          return (
            <Panel key={doc.strategyId} className="p-5" data-testid={`saved-${doc.strategyId}`}>
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0">
                  <div className="text-[15px] font-medium">{doc.name}</div>
                  <div className="mono text-[10px] text-[#75777d]">{doc.strategyId} · saved {fmtAge(doc.savedAt)}</div>
                </div>
                <div className="ml-auto flex gap-2">
                  <button onClick={async () => {
                    if (btBusy) return;
                    setBtBusy(doc.strategyId);
                    try { setBtMap((m) => ({ ...m, [doc.strategyId]: null })); const d = await weft.backtest({ strategy: doc.strategy }); setBtMap((m) => ({ ...m, [doc.strategyId]: d })); }
                    catch (e) { toast.error(errorMessage(e)); }
                    finally { setBtBusy(""); }
                  }} disabled={btBusy === doc.strategyId} data-testid={`saved-bt-${doc.strategyId}`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#12121414] px-4 text-[12px] hover:border-[#2b59ff] hover:text-[#2b59ff] disabled:opacity-40 transition-colors">
                    {btBusy === doc.strategyId ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Backtest
                  </button>
                  <Link to={`/new?thesis=${encodeURIComponent(doc.thesis || doc.name)}`}
                    className="inline-flex h-9 items-center rounded-full bg-[#121214] px-4 text-[12px] font-medium text-white hover:bg-[#2b59ff] transition-colors">
                    Open
                  </Link>
                </div>
              </div>
              {doc.thesis && <p className="mt-3 serif italic text-[14px]">“{doc.thesis}”</p>}
              {bt && (
                <div className="mt-4 fadeup">
                  <Sparkline points={equity} height={100} />
                  <div className="mt-3 flex flex-wrap gap-x-8 gap-y-1 text-[12px]">
                    <span>Return <b className={bt.stats?.returnPct < 0 ? "text-[#c23434]" : "text-[#0b9466]"}>{fmtPctSigned(bt.stats?.returnPct)}</b></span>
                    <span>Trades <b>{bt.stats?.trades ?? "—"}</b></span>
                    <span>End equity <b>{fmtUsd(bt.stats?.endEquityUsd)}</b></span>
                  </div>
                </div>
              )}
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

function SolTradePanel({ token, onDone }) {
  const [out, setOut] = useState(WEFT);
  const [amount, setAmount] = useState(0.01);
  const [busy, setBusy] = useState(false);
  const trade = async () => {
    setBusy(true);
    try {
      const d = await authed(token, "/wallet/trade", { inputMint: WSOL, outputMint: out, amount: Math.round(amount * 1e9) });
      toast.success("Trade executed on chain", { description: `Signature ${short(d.signature, 8, 8)}` });
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally { setBusy(false); }
  };
  return (
    <Panel className="p-5" data-testid="sol-trade-panel">
      <div className="flex items-center gap-2 mono text-[10px] uppercase tracking-wider text-[#75777d]"><ArrowDownUp size={12} /> Swap on Solana · real</div>
      <div className="mt-4 space-y-3">
        <div className="flex gap-2">
          <input type="number" min={0.001} step={0.001} value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)}
            className="h-11 w-32 rounded-lg border border-[#12121414] bg-[#faf9f7] px-3 mono text-[13px] outline-none" data-testid="sol-trade-amount" />
          <span className="self-center mono text-[12px] text-[#75777d]">SOL →</span>
          <select value={out} onChange={(e) => setOut(e.target.value)} data-testid="sol-trade-out"
            className="h-11 flex-1 rounded-lg border border-[#12121414] bg-white px-3 mono text-[12px] outline-none">
            <option value={WEFT}>$SWIFT</option>
            <option value={USDC}>USDC</option>
          </select>
        </div>
        <input value={out} onChange={(e) => setOut(e.target.value)} placeholder="or any SPL mint address"
          className="h-10 w-full rounded-lg border border-[#12121414] bg-[#faf9f7] px-3 mono text-[11px] outline-none" data-testid="sol-trade-mint" />
        <button onClick={trade} disabled={busy || amount <= 0} data-testid="sol-trade-btn"
          className="h-11 w-full rounded-full bg-[#121214] text-[13px] font-medium text-white hover:bg-[#2b59ff] disabled:opacity-40 transition-colors inline-flex items-center justify-center gap-2">
          {busy && <Loader2 size={14} className="animate-spin" />} Swap for real
        </button>
      </div>
    </Panel>
  );
}

function HlTradePanel({ token, markets, hlInfo, onDone }) {
  const [symbol, setSymbol] = useState("ETH");
  const [side, setSide] = useState("long");
  const [sizeUsd, setSizeUsd] = useState(25);
  const [lev, setLev] = useState(5);
  const [busy, setBusy] = useState(false);
  const trade = async () => {
    setBusy(true);
    try {
      const d = await authed(token, "/hl/trade", { symbol, side, sizeUsd, leverage: lev });
      toast.success(`${side === "long" ? "Long" : "Short"} opened on Hyperliquid`, { description: `${symbol} · $${sizeUsd} · ${lev}×` });
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally { setBusy(false); }
  };
  const close = async (sym) => {
    try {
      await authed(token, "/hl/close", { symbol: sym });
      toast.success(`Closed ${sym}`);
      onDone();
    } catch (e) { toast.error(errorMessage(e)); }
  };
  return (
    <Panel className="p-5" data-testid="hl-trade-panel">
      <div className="flex items-center gap-2 mono text-[10px] uppercase tracking-wider text-[#75777d]"><ArrowUpRight size={12} /> Perps on Hyperliquid · real</div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <select value={symbol} onChange={(e) => setSymbol(e.target.value)} data-testid="hl-symbol"
          className="h-11 rounded-lg border border-[#12121414] bg-white px-3 mono text-[12px] outline-none">
          {markets.slice(0, 30).map((m) => <option key={m.symbol} value={m.symbol}>{m.symbol} · ${m.price < 1 ? m.price.toPrecision(3) : m.price.toLocaleString()}</option>)}
        </select>
        <div className="flex gap-1 rounded-lg border border-[#12121414] p-1">
          {[["long", "Long"], ["short", "Short"]].map(([k, l]) => (
            <button key={k} onClick={() => setSide(k)} data-testid={`hl-side-${k}`}
              className={`flex-1 rounded-md text-[12px] font-medium transition-colors ${side === k ? (k === "long" ? "bg-[#0b9466] text-white" : "bg-[#c23434] text-white") : "text-[#75777d]"}`}>
              {l}
            </button>
          ))}
        </div>
        <input type="number" min={10} value={sizeUsd} onChange={(e) => setSizeUsd(Number(e.target.value) || 0)}
          className="h-11 rounded-lg border border-[#12121414] bg-[#faf9f7] px-3 mono text-[13px] outline-none" data-testid="hl-size" />
        <select value={lev} onChange={(e) => setLev(Number(e.target.value))} data-testid="hl-lev"
          className="h-11 rounded-lg border border-[#12121414] bg-white px-3 mono text-[12px] outline-none">
          {[1, 2, 3, 5, 10, 20, 25, 40].map((l) => <option key={l} value={l}>{l}× leverage</option>)}
        </select>
      </div>
      <button onClick={trade} disabled={busy || sizeUsd < 10} data-testid="hl-trade-btn"
        className="mt-3 h-11 w-full rounded-full bg-[#121214] text-[13px] font-medium text-white hover:bg-[#2b59ff] disabled:opacity-40 transition-colors inline-flex items-center justify-center gap-2">
        {busy && <Loader2 size={14} className="animate-spin" />} Open {side} · ${sizeUsd} · {lev}×
      </button>
      {hlInfo?.positions?.length > 0 && (
        <div className="mt-4 border-t border-[#12121414] pt-3 space-y-2" data-testid="hl-positions">
          {hlInfo.positions.map((p) => (
            <div key={p.symbol} className="flex items-center gap-3 text-[12px]">
              <Tag tone={Number(p.size) < 0 ? "short" : "long"}>{p.symbol}</Tag>
              <span className="mono text-[#75777d]">{p.size} @ {Number(p.entryPx).toLocaleString()}</span>
              <span className={`mono tnum ${Number(p.unrealizedPnl) < 0 ? "text-[#c23434]" : "text-[#0b9466]"}`}>{fmtUsd(Number(p.unrealizedPnl))}</span>
              <button onClick={() => close(p.symbol)} className="ml-auto inline-flex items-center gap-1 text-[11px] text-[#c23434] hover:underline" data-testid={`hl-close-${p.symbol}`}>
                <CircleX size={11} /> Close
              </button>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function WithdrawPanel({ token, hlInfo, onDone }) {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [hlTo, setHlTo] = useState("");
  const [hlAmount, setHlAmount] = useState("");
  const [busy, setBusy] = useState("");
  const solWithdraw = async () => {
    setBusy("sol");
    try {
      const d = await authed(token, "/wallet/withdraw", { to, amountSol: Number(amount) });
      toast.success("SOL sent", { description: short(d.signature, 8, 8) });
      onDone();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(""); }
  };
  const hlWithdraw = async () => {
    setBusy("hl");
    try {
      await authed(token, "/hl/withdraw", { destination: hlTo, amountUsd: Number(hlAmount) });
      toast.success("USDC sent on Hyperliquid");
      onDone();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(""); }
  };
  return (
    <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4" data-testid="withdraw-panel">
      <Panel className="p-5">
        <div className="mono text-[10px] uppercase tracking-wider text-[#75777d]">Withdraw SOL</div>
        <div className="mt-3 space-y-2">
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Destination Solana address"
            className="h-10 w-full rounded-lg border border-[#12121414] bg-[#faf9f7] px-3 mono text-[11px] outline-none" data-testid="sol-withdraw-to" />
          <div className="flex gap-2">
            <input type="number" min={0.001} step={0.001} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount (SOL)"
              className="h-10 w-32 rounded-lg border border-[#12121414] bg-[#faf9f7] px-3 mono text-[12px] outline-none" data-testid="sol-withdraw-amount" />
            <button onClick={solWithdraw} disabled={busy === "sol" || !to || !amount} data-testid="sol-withdraw-btn"
              className="h-10 flex-1 rounded-full border border-[#12121414] text-[12.5px] hover:border-[#2b59ff] hover:text-[#2b59ff] disabled:opacity-40 transition-colors">
              {busy === "sol" ? "Sending…" : "Send SOL"}
            </button>
          </div>
        </div>
      </Panel>
      <Panel className="p-5">
        <div className="mono text-[10px] uppercase tracking-wider text-[#75777d]">Withdraw from Hyperliquid</div>
        <div className="mt-3 space-y-2">
          <input value={hlTo} onChange={(e) => setHlTo(e.target.value)} placeholder="Any Hyperliquid account address (0x…)"
            className="h-10 w-full rounded-lg border border-[#12121414] bg-[#faf9f7] px-3 mono text-[11px] outline-none" data-testid="hl-withdraw-to" />
          <div className="flex gap-2">
            <input type="number" min={1} value={hlAmount} onChange={(e) => setHlAmount(e.target.value)} placeholder={`Amount (USDC) · up to ${hlInfo ? hlInfo.withdrawableUsd.toFixed(2) : "0"}`}
              className="h-10 w-44 rounded-lg border border-[#12121414] bg-[#faf9f7] px-3 mono text-[12px] outline-none" data-testid="hl-withdraw-amount" />
            <button onClick={hlWithdraw} disabled={busy === "hl" || !hlTo || !hlAmount} data-testid="hl-withdraw-btn"
              className="h-10 flex-1 rounded-full border border-[#12121414] text-[12.5px] hover:border-[#2b59ff] hover:text-[#2b59ff] disabled:opacity-40 transition-colors">
              {busy === "hl" ? "Sending…" : "Send USDC"}
            </button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
