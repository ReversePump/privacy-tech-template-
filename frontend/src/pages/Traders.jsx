import React, { useEffect, useState } from "react";
import { weft, errorMessage } from "../lib/api";
import { fmtUsd0, fmtUsdSigned, fmtPctSigned, short } from "../lib/format";
import { Panel, Tag, Loading, Empty } from "../components/bits";
import { useAuth } from "../solana/AuthContext";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

export default function Traders() {
  const [rows, setRows] = useState(null);
  const [copyTarget, setCopyTarget] = useState(null);
  const { signedIn, token } = useAuth();

  useEffect(() => {
    weft.traders().then((d) => setRows(d.traders || [])).catch(() => setRows([]));
  }, []);

  return (
    <div className="mx-auto max-w-[1200px] px-4 md:px-6 pt-14" data-testid="traders-page">
      <h1 className="serif text-4xl md:text-5xl font-light tracking-tight">Traders</h1>
      <p className="mt-3 max-w-xl text-[14px] text-[#a89ec4]">
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
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#a855f71f] mono text-[10px] text-[#a855f7]">
                          {(t.name || t.address || "?").slice(0, 2).toUpperCase()}
                        </span>
                        <div>
                          <div className="text-[13px] font-medium">{t.name || short(t.address, 6, 6)}</div>
                          <div className="mono text-[10px] text-[#a89ec4]">{short(t.address, 6, 6)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="text-right mono tnum">{fmtUsd0(t.accountValueUsd)}</td>
                    <td className={`text-right mono tnum ${t.pnl30dUsd < 0 ? "text-[#f43f5e]" : "text-[#10b981]"}`}>{fmtUsdSigned(t.pnl30dUsd)}</td>
                    <td className={`text-right mono tnum ${t.roi30dPct < 0 ? "text-[#f43f5e]" : "text-[#10b981]"}`}>{fmtPctSigned(t.roi30dPct)}</td>
                    <td className={`text-right mono tnum ${t.pnl7dUsd < 0 ? "text-[#f43f5e]" : "text-[#10b981]"}`}>{fmtUsdSigned(t.pnl7dUsd)}</td>
                    <td className="text-right mono tnum">{fmtUsd0(t.pnlAllTimeUsd)}</td>
                    <td className="text-right">
                      <div className="inline-flex items-center gap-3">
                        <a className="inline-flex items-center gap-1 text-[12px] text-[#a89ec4] hover:text-[#f3f0fd]"
                          href={`/new?thesis=${encodeURIComponent(`Copy ${t.name || t.address} on Hyperliquid with $100 per trade. 15% stop.`)}`}
                          data-testid={`copy-trader-${short(t.address, 4, 4)}`}>
                          Draft →
                        </a>
                        <button onClick={() => setCopyTarget(t)} data-testid={`autocopy-trader-${short(t.address, 4, 4)}`}
                          className="inline-flex items-center gap-1 text-[12px] text-[#a855f7] hover:underline">
                          Auto-copy →
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <p className="mt-4 text-[11px] text-[#a89ec4]">Past performance is not a promise. Fading works too: “fade {rows?.[0]?.name || "a trader"}, longs only”.</p>
      {copyTarget && (
        <CopyModal trader={copyTarget} signedIn={signedIn} token={token} onClose={() => setCopyTarget(null)} />
      )}
    </div>
  );
}

function CopyModal({ trader, signedIn, token, onClose }) {
  const [mode, setMode] = useState("paper");
  const [sizeUsd, setSizeUsd] = useState(100);
  const [busy, setBusy] = useState(false);
  const start = async () => {
    if (!signedIn) { toast.error("Sign in first — Connect in the header"); return; }
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/deployments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ kind: "copy", targetAddress: trader.address, sizeUsd, mode }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `failed (${r.status})`);
      toast.success(`Auto-copying ${trader.name || short(trader.address, 6, 4)} — every new fill gets mirrored`, {
        description: mode === "paper" ? "Practice money at real prices" : mode === "alerts" ? "Alerts only, no trades" : "Real trades from your generated wallet",
      });
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={onClose} data-testid="copy-modal">
      <div className="panel w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="serif text-2xl font-light">Auto-copy {trader.name || short(trader.address, 6, 4)}</h2>
          <button onClick={onClose} className="text-[#a89ec4] hover:text-[#f3f0fd]" data-testid="copy-modal-close"><X size={18} /></button>
        </div>
        <p className="mt-1.5 text-[12.5px] text-[#a89ec4]">The engine watches this trader's fills on Hyperliquid and mirrors each new one with your size.</p>
        <div className="mt-4 space-y-3">
          <div className="flex gap-1 rounded-full border border-[#a855f724] p-1">
            {[["paper", "Practice"], ["alerts", "Alerts only"], ["live", "Live"]].map(([k, l]) => (
              <button key={k} onClick={() => setMode(k)} data-testid={`copy-mode-${k}`}
                className={`flex-1 h-9 rounded-full text-[12.5px] transition-colors ${mode === k ? "bg-[#9333ea] text-white" : "text-[#a89ec4]"}`}>
                {l}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="mono text-[12px] text-[#a89ec4]">$</span>
            <input type="number" min={10} value={sizeUsd} onChange={(e) => setSizeUsd(Number(e.target.value) || 0)}
              className="h-11 w-32 rounded-lg border border-[#a855f724] bg-[#171428] px-3 mono text-[13px] outline-none" data-testid="copy-size" />
            <span className="text-[12px] text-[#a89ec4]">per mirrored trade</span>
          </div>
          <button onClick={start} disabled={busy || sizeUsd < 10} data-testid="copy-start-btn"
            className="h-11 w-full rounded-full bg-[#9333ea] text-[13px] font-medium text-white shadow-[0_0_20px_rgba(168,85,247,0.35)] hover:bg-[#a855f7] disabled:opacity-40 transition-colors inline-flex items-center justify-center gap-2">
            {busy && <Loader2 size={14} className="animate-spin" />} Start auto-copying
          </button>
        </div>
      </div>
    </div>
  );
}
