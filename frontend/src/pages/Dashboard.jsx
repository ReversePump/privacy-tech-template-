import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { toast } from "sonner";
import { makers, errorMessage } from "../lib/api";
import { fmtSol, fmtAge, short } from "../lib/format";
import { PageHead, Panel, CoinCell, Loading, Empty, StatusDot } from "../components/bits";
import { SettingsEditor } from "../components/SettingsEditor";
import { useAuth } from "../solana/AuthContext";

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
      await makers.updateSettings(id, change);
      toast.success("Settings updated — takes effect within one engine pass.");
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
