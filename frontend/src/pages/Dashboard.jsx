import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { toast } from "sonner";
import { makers, errorMessage } from "../lib/api";
import { fmtSol, fmtAge, short } from "../lib/format";
import { PageHead, Panel, CoinCell, Loading, Empty, StatusDot, CoinAvatar } from "../components/bits";
import { SettingsEditor } from "../components/SettingsEditor";
import { useAuth } from "../solana/AuthContext";
import { vaultPositions, vaultWithdraw, isMobileDevice } from "../lib/vault";

function VaultPositions() {
  const { publicKey, connected, signMessage } = useWallet();
  const { setVisible } = useWalletModal();
  const [positions, setPositions] = useState(null);
  const [busyMint, setBusyMint] = useState("");

  const load = () => {
    if (!publicKey) return;
    vaultPositions(publicKey.toBase58()).then((d) => setPositions(d.positions || [])).catch(() => setPositions([]));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [publicKey?.toBase58?.()]);

  if (!connected) {
    return (
      <Empty>
        <p className="mb-4">Connect your wallet to see your positions.</p>
        <button onClick={() => setVisible(true)} className="rounded-[3px] bg-[#3F9E00] px-5 py-2 text-sm font-medium text-[#131a0f]" data-testid="dash-connect-btn">Connect</button>
      </Empty>
    );
  }
  if (!positions) return <Loading label="Loading your positions" />;
  if (!positions.length) return <Empty>No vault balance on this wallet yet. <Link to="/launch" className="text-[#3F9E00]">Launch a coin →</Link></Empty>;

  const withdraw = async (mint) => {
    setBusyMint(mint);
    try {
      const res = await vaultWithdraw({ mint, publicKey, signMessage });
      toast.success("Withdrawal sent", { description: res.signature ? `Signature ${short(res.signature)}` : undefined });
      load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally { setBusyMint(""); }
  };

  return (
    <Panel className="overflow-hidden" data-testid="dash-vault-panel">
      <table className="dtable">
        <thead><tr><th>Coin</th><th className="text-right">Balance</th><th></th></tr></thead>
        <tbody>
          {positions.map((p) => (
            <tr key={p.mint}>
              <td>
                <span className="flex items-center gap-2.5 min-w-0">
                  <CoinAvatar url={p.imageUrl} name={p.name || p.mint} size={28} />
                  <span className="min-w-0">
                    <span className="block truncate text-[#131a0f] text-[13px]">{p.name || short(p.mint, 6, 6)}</span>
                    {p.ticker && <span className="block font-mono text-[10px] uppercase tracking-wider text-[#93a184]">${p.ticker}</span>}
                  </span>
                </span>
              </td>
              <td className="text-right font-mono text-[#131a0f] tnum" data-testid={`vault-balance-${p.ticker || p.mint.slice(0, 4)}`}>
                {p.balanceSol.toLocaleString("en-US", { maximumFractionDigits: 4 })} SOL
              </td>
              <td className="text-right">
                <button onClick={() => withdraw(p.mint)} disabled={busyMint === p.mint} data-testid={`vault-withdraw-${p.ticker || p.mint.slice(0, 4)}`}
                  className="h-8 rounded-[3px] border border-[#3F9E00]/40 px-4 font-mono text-[11px] uppercase text-[#3F9E00] hover:bg-[#3F9E00]/5 disabled:opacity-50">
                  {busyMint === p.mint ? "Approve…" : "Withdraw"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function MyDesks() {
  const [desks, setDesks] = useState(null);
  const { signedIn, signIn } = useAuth();
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();

  useEffect(() => {
    if (!signedIn) return;
    makers.myDesks().then((d) => setDesks(d.desks || d || [])).catch((e) => { toast.error(errorMessage(e)); setDesks([]); });
  }, [signedIn]);

  if (!connected) {
    return (
      <Empty>
        <p className="mb-4">Connect your wallet to see your makers.</p>
        <button onClick={() => setVisible(true)} className="rounded-[3px] bg-[#3F9E00] px-5 py-2 text-sm font-medium text-[#131a0f]" data-testid="dash-connect-btn">Connect</button>
      </Empty>
    );
  }
  if (isMobileDevice()) return <VaultPositions />;
  if (!signedIn) {
    return (
      <Empty>
        <p className="mb-4">Sign in with your wallet to prove ownership.</p>
        <button onClick={async () => { try { await signIn(); } catch (e) { toast.error(errorMessage(e)); } }} className="rounded-[3px] bg-[#3F9E00] px-5 py-2 text-sm font-medium text-[#131a0f]" data-testid="dash-signin-btn">Sign in</button>
      </Empty>
    );
  }
  if (!desks) return <Loading label="Loading your makers" />;
  if (!desks.length) return <Empty>No makers on this wallet yet. <Link to="/launch" className="text-[#3F9E00]">Launch one →</Link></Empty>;
  return (
    <Panel className="overflow-hidden" data-testid="mydesks-panel">
      <table className="dtable">
        <thead><tr><th>Coin</th><th>Status</th><th className="text-right">Capital</th><th className="text-right">Claimed</th><th className="text-right">Age</th><th></th></tr></thead>
        <tbody>
          {desks.map((d) => (
            <tr key={d.id}>
              <td><CoinCell imageUrl={d.imageUrl} name={d.name} ticker={d.ticker} id={d.id} /></td>
              <td><StatusDot status={d.status} /></td>
              <td className="text-right font-mono text-[#131a0f] tnum">{fmtSol(d.totals?.capitalLamports, 2)}</td>
              <td className="text-right font-mono text-[#5c6b50] tnum">{fmtSol(d.totals?.claimedLamports, 2)}</td>
              <td className="text-right font-mono text-[#5c6b50] tnum">{fmtAge(d.launchedAt || d.createdAt)}</td>
              <td className="text-right">
                <Link to={`/dashboard/${d.id}`} className="font-mono text-[11px] uppercase text-[#3F9E00] hover:underline" data-testid={`manage-${d.ticker}`}>Manage →</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function DeskDashboard({ id }) {
  const [desk, setDesk] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const { signedIn, signIn } = useAuth();

  const load = () => makers.desk(id).then((d) => { setDesk(d); setForm({ ...(d.settings || d.strategy || {}) }); }).catch((e) => toast.error(errorMessage(e)));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  if (!desk || !form) return <Loading label="Loading dashboard" />;

  const save = async () => {
    if (!signedIn) { try { await signIn(); } catch (e) { toast.error(errorMessage(e)); return; } }
    setBusy(true);
    try {
      const orig = desk.settings || desk.strategy || {};
      const change = Object.fromEntries(Object.entries(form).filter(([k, v]) => v !== orig[k] && typeof v !== "object"));
      if (!Object.keys(change).length) { toast.info("Nothing changed"); return; }
      const res = await makers.updateSettings(id, change);
      if (res?.request || res?.needsApproval || res?.pending) {
        toast.info("Change queued — approve it below to apply.");
      } else {
        toast.success("Settings updated — takes effect within one engine pass.");
      }
      load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally { setBusy(false); }
  };

  const decide = async (req, action) => {
    if (!signedIn) { try { await signIn(); } catch (e) { toast.error(errorMessage(e)); return; } }
    setBusy(true);
    try {
      const change = req.change ?? req;
      await makers.approval(id, action, change);
      toast.success(action === "approve" ? "Change approved." : "Change cancelled.");
      load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally { setBusy(false); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Panel className="lg:col-span-2 p-6" data-testid="dash-settings-panel">
        <div className="flex items-baseline justify-between">
          <span className="text-[#131a0f] font-medium">Maker controls</span>
          <span className="font-mono text-[10px] text-[#93a184]">version {desk.settingsVersion ?? 1}</span>
        </div>
        <p className="mt-1 text-[12px] font-light text-[#93a184]">Every dial is yours, every change is public, applied within one engine pass.</p>
        <div className="mt-5">
          <SettingsEditor values={form} onChange={(k, v) => setForm({ ...form, [k]: v })} />
        </div>
        <button onClick={save} disabled={busy} data-testid="dash-save-btn"
          className="mt-6 h-10 rounded-[3px] bg-[#3F9E00] px-6 text-sm font-medium text-[#131a0f] hover:bg-[#54C400] disabled:opacity-50">
          {busy ? "Saving…" : "Save changes"}
        </button>
        <p className="mt-3 text-[11px] font-light text-[#93a184]">Changes may require a wallet approval before they apply.</p>
      </Panel>

      <Panel className="p-6" data-testid="dash-info-panel">
        <span className="text-[#131a0f] font-medium">This maker</span>
        <div className="mt-4 space-y-2.5 font-mono text-xs text-[#5c6b50]">
          <div className="flex justify-between"><span>Coin</span><Link to={`/desk/${desk.id}`} className="text-[#3F9E00]">${desk.ticker}</Link></div>
          <div className="flex justify-between"><span>Status</span><StatusDot status={desk.status} /></div>
          <div className="flex justify-between"><span>Capital</span><span className="text-[#131a0f]">{fmtSol(desk.totals?.capitalLamports, 2)}</span></div>
          <div className="flex justify-between"><span>Claimed</span><span className="text-[#131a0f]">{fmtSol(desk.totals?.claimedLamports, 2)}</span></div>
          <div className="flex justify-between"><span>Treasury</span><span className="text-[#131a0f]">{short(desk.treasury, 4, 4)}</span></div>
        </div>

        {desk.requests?.length > 0 && (
          <div className="mt-6 border-t border-black/5 pt-4" data-testid="dash-requests">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#a8780f]">Pending approvals</div>
            <div className="mt-3 space-y-2.5">
              {desk.requests.map((r, i) => (
                <div key={r.id || i} className="rounded-[3px] border border-[#a8780f]/20 bg-[#a8780f]/5 p-3">
                  <div className="font-mono text-[11px] text-[#3a4a33]">{r.summary || r.kind || JSON.stringify(r.change || r).slice(0, 80)}</div>
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => decide(r, "approve")} disabled={busy} data-testid={`req-approve-${i}`}
                      className="h-7 rounded-[3px] bg-[#3F9E00] px-3 font-mono text-[10px] uppercase text-white hover:bg-[#54C400] disabled:opacity-50">Approve</button>
                    <button onClick={() => decide(r, "cancel")} disabled={busy} data-testid={`req-cancel-${i}`}
                      className="h-7 rounded-[3px] border border-black/15 px-3 font-mono text-[10px] uppercase text-[#5c6b50] hover:border-[#d43d3d]/40 hover:text-[#d43d3d] disabled:opacity-50">Cancel</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

export default function Dashboard() {
  const { id } = useParams();
  return (
    <div className="mx-auto max-w-[1440px] px-4 md:px-8 pt-10 md:pt-14" data-testid="dashboard-page">
      <PageHead kicker="Dashboard" title={id ? "Maker" : "Command"} accent={id ? "controls." : "room."}
        sub={id ? "Retune the temperament. The owner wallet is the only one that can." : "Every market maker your wallet controls, in one room."} />
      {id ? <DeskDashboard id={id} /> : <MyDesks />}
    </div>
  );
}
