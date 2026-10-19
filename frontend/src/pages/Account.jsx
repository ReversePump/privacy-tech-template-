import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Wallet, LogOut, Play, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { weft, errorMessage } from "../lib/api";
import { fmtUsd, fmtPctSigned, fmtAge, short } from "../lib/format";
import { Panel, Tag, Loading, Empty, Sparkline } from "../components/bits";
import { useAuth } from "../solana/AuthContext";

export default function Account() {
  const { connected, publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const { signedIn, signIn, signOut, token, wallet } = useAuth();
  const [saved, setSaved] = useState(null);
  const [rewards, setRewards] = useState(null);
  const [deployments, setDeployments] = useState(null);
  const [btMap, setBtMap] = useState({});
  const [btBusy, setBtBusy] = useState("");

  useEffect(() => {
    weft.rewards().then(setRewards).catch(() => {});
    // public deployments feed (upstream accounts are separate; shown as the public board)
    fetch(`${process.env.REACT_APP_BACKEND_URL}/api/relay/deployments`).then((r) => r.json()).then((d) => setDeployments(d.deployments || [])).catch(() => setDeployments([]));
  }, []);

  useEffect(() => {
    if (!signedIn || !token) { setSaved(null); return; }
    fetch(`${process.env.REACT_APP_BACKEND_URL}/api/me/strategies`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setSaved(d.strategies || []))
      .catch(() => setSaved([]));
  }, [signedIn, token]);

  const runBacktest = async (doc) => {
    if (btBusy) return;
    setBtBusy(doc.strategyId);
    try {
      const d = await weft.backtest({ strategy: doc.strategy });
      setBtMap((m) => ({ ...m, [doc.strategyId]: d }));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBtBusy("");
    }
  };

  if (!connected) {
    return (
      <div className="mx-auto max-w-[860px] px-4 md:px-6 pt-20 text-center" data-testid="account-page">
        <Wallet size={28} className="mx-auto text-[#75777d]" />
        <h1 className="mt-4 serif text-3xl font-light">Your account</h1>
        <p className="mt-2 text-[13px] text-[#75777d]">Connect your wallet to see your strategies, deployments and rewards.</p>
        <button onClick={() => setVisible(true)} data-testid="account-connect-btn"
          className="mt-6 h-11 rounded-full bg-[#121214] px-6 text-sm font-medium text-white hover:bg-[#2b59ff] transition-colors">
          Connect wallet
        </button>
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="mx-auto max-w-[860px] px-4 md:px-6 pt-20 text-center" data-testid="account-page">
        <h1 className="serif text-3xl font-light">One more step</h1>
        <p className="mt-2 text-[13px] text-[#75777d]">Approve a sign-in message — it proves ownership, costs nothing, moves nothing.</p>
        <button onClick={async () => { try { await signIn(); } catch (e) { toast.error(errorMessage(e)); } }} data-testid="account-signin-btn"
          className="mt-6 h-11 rounded-full bg-[#121214] px-6 text-sm font-medium text-white hover:bg-[#2b59ff] transition-colors">
          Sign in with wallet
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] px-4 md:px-6 pt-14" data-testid="account-page">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <h1 className="serif text-4xl font-light tracking-tight">Your account</h1>
          <p className="mt-1 mono text-[12px] text-[#75777d]" data-testid="account-wallet">{short(wallet, 6, 6)}</p>
        </div>
        <button onClick={signOut} data-testid="account-signout-btn"
          className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-full border border-[#12121414] px-4 text-[12px] text-[#75777d] hover:text-[#121214]">
          <LogOut size={12} /> Sign out
        </button>
      </div>

      <Panel className="mt-8 grid grid-cols-2 md:grid-cols-4 divide-x divide-[#12121414] overflow-hidden" data-testid="account-stats">
        <div className="px-5 py-4">
          <div className="mono text-[10px] uppercase tracking-[0.14em] text-[#75777d]">Saved strategies</div>
          <div className="mt-1 text-xl font-medium tnum">{saved ? saved.length : "—"}</div>
        </div>
        <div className="px-5 py-4">
          <div className="mono text-[10px] uppercase tracking-[0.14em] text-[#75777d]">Rewards</div>
          <div className="mt-1 text-xl font-medium tnum">{rewards ? (rewards.enabled ? (rewards.paused ? "Paused" : "Live") : "Off") : "—"}</div>
          <div className="mt-0.5 text-[11px] text-[#75777d]">$WEFT share of fees</div>
        </div>
        <div className="px-5 py-4">
          <div className="mono text-[10px] uppercase tracking-[0.14em] text-[#75777d]">Deployments</div>
          <div className="mt-1 text-xl font-medium tnum">{deployments ? deployments.length : "—"}</div>
          <div className="mt-0.5 text-[11px] text-[#75777d]">public board</div>
        </div>
        <div className="px-5 py-4">
          <div className="mono text-[10px] uppercase tracking-[0.14em] text-[#75777d]">Mode</div>
          <div className="mt-1 text-xl font-medium">Practice-ready</div>
          <div className="mt-0.5 text-[11px] text-[#75777d]">backtests run at real prices</div>
        </div>
      </Panel>

      <h2 className="mt-10 serif text-2xl font-light" >My strategies</h2>
      <p className="mt-1 text-[13px] text-[#75777d]">Drafted on this site, saved to your wallet.</p>
      <div className="mt-4 space-y-4" data-testid="account-strategies">
        {!saved && <Loading label="Loading your strategies" />}
        {saved && saved.length === 0 && (
          <Empty>
            Nothing saved yet. <Link to="/new" className="text-[#2b59ff]">Draft a strategy →</Link>
          </Empty>
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
                  <button onClick={() => runBacktest(doc)} disabled={btBusy === doc.strategyId} data-testid={`saved-bt-${doc.strategyId}`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#12121414] px-4 text-[12px] hover:border-[#2b59ff] hover:text-[#2b59ff] disabled:opacity-40 transition-colors">
                    {btBusy === doc.strategyId ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Backtest
                  </button>
                  <Link to={`/new?thesis=${encodeURIComponent(doc.thesis || doc.name)}`}
                    className="inline-flex h-9 items-center rounded-full bg-[#121214] px-4 text-[12px] font-medium text-white hover:bg-[#2b59ff] transition-colors">
                    Open
                  </Link>
                </div>
              </div>
              {doc.thesis && <p className="mt-3 serif italic text-[14px] text-[#121214]">“{doc.thesis}”</p>}
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

      <h2 className="mt-10 serif text-2xl font-light">Deployments</h2>
      <Panel className="mt-4 p-5" data-testid="account-deployments">
        <p className="text-[13px] text-[#75777d]">
          Live and practice deployments run on the strategy engine's own accounts (email sign-in). Draft and backtest here; the public board shows every running deployment on the <Link to="/leaderboard" className="text-[#2b59ff]">Leaderboard</Link>.
        </p>
      </Panel>
    </div>
  );
}
