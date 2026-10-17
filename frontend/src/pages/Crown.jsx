import React, { useEffect, useState } from "react";
import { Crown as CrownIcon, Flame } from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { VersionedTransaction } from "@solana/web3.js";
import { toast } from "sonner";
import { makers, errorMessage } from "../lib/api";
import { fmtNum, fmtAge, short, solscanTx, b64ToBytes, bytesToB64 } from "../lib/format";
import { PageHead, Panel, Stat, StatRow, CoinAvatar, Loading, Empty, ExtLink } from "../components/bits";

export default function Crown() {
  const [data, setData] = useState(null);
  const [desks, setDesks] = useState([]);
  const [mint, setMint] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const { publicKey, signTransaction, connected } = useWallet();
  const { setVisible } = useWalletModal();

  const load = () => makers.crown().then(setData).catch(() => setData({ enabled: false }));
  useEffect(() => {
    load();
    makers.desks().then((d) => setDesks(d.desks || [])).catch(() => {});
  }, []);

  const burn = async () => {
    if (!connected || !publicKey) { setVisible(true); return; }
    if (!mint || !amount) { toast.error("Pick a coin and an amount"); return; }
    setBusy(true);
    try {
      toast.info("Preparing the burn…");
      const prep = await makers.crownPrepare({ mint, tokens: Number(amount), wallet: publicKey.toBase58() });
      const txB64 = prep.transaction || prep.tx;
      if (!txB64) throw new Error("The API returned no transaction to sign.");
      const tx = VersionedTransaction.deserialize(b64ToBytes(txB64));
      toast.info("Approve the burn in your wallet.");
      const signed = await signTransaction(tx);
      const res = await makers.crownSubmit(mint, bytesToB64(signed.serialize()));
      toast.success("Burn submitted.", { description: res?.signature ? `Signature ${short(res.signature)}` : undefined });
      setAmount("");
      load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <div className="mx-auto max-w-[1440px] px-4 md:px-8 pt-14"><Loading label="Loading crown" /></div>;

  return (
    <div className="mx-auto max-w-[1440px] px-4 md:px-8 pt-10 md:pt-14" data-testid="crown-page">
      <PageHead
        kicker="Crown"
        title="King of the"
        accent="burn."
        sub={`Burn the platform token for a coin and it wears the crown for ${data.windowHours || 24}h — the biggest burn in the window wins the spotlight everywhere on the site.`}
        right={<CrownIcon size={40} className="text-[#8AF5D0] opacity-60" />}
      />

      <StatRow className="mb-8">
        <Stat testId="crown-window" label="Window" value={`${data.windowHours || 24}h`} />
        <Stat testId="crown-min" label="Min burn" value={`${fmtNum(data.minTokens)} tokens`} />
        <Stat testId="crown-24h" label="Burned 24h" value={fmtNum(Number(data.burned24hQuote || 0) / 1e6, 0)} sub={`${data.burns24h || 0} burns`} />
        <Stat testId="crown-total" label="Burned for crowns" value={fmtNum(Number(data.burnedQuote || 0) / 1e6, 0)} />
      </StatRow>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Panel className="p-6" data-testid="crown-burn-panel">
          <div className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#8AF5D0]">Take the crown</div>
          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-[#556b82]">Coin</label>
              <select data-testid="crown-coin-select" value={mint} onChange={(e) => setMint(e.target.value)}
                className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-[#8AF5D0]/40">
                <option value="" className="bg-[#0d1b2a]">Pick a coin…</option>
                {desks.map((d) => (
                  <option key={d.id} value={d.mint} className="bg-[#0d1b2a]">{d.name} · ${d.ticker}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-[#556b82]">Tokens to burn</label>
              <input data-testid="crown-amount-input" type="number" min={data.minTokens} max={data.maxTokens}
                value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`${fmtNum(data.minTokens)} – ${fmtNum(data.maxTokens)}`}
                className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 font-mono text-sm text-white outline-none focus:border-[#8AF5D0]/40" />
            </div>
            <button data-testid="crown-burn-btn" onClick={burn} disabled={busy}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#8AF5D0] text-sm font-medium text-[#07111f] hover:bg-[#7CFFC8] disabled:opacity-50 transition-all">
              <Flame size={15} /> {connected ? (busy ? "Burning…" : "Burn for the crown") : "Connect to burn"}
            </button>
            <p className="text-[11px] font-light leading-relaxed text-[#556b82]">
              The burn is a real on-chain transfer to the burn address, signed by your wallet. It cannot be undone.
            </p>
          </div>
        </Panel>

        <Panel className="lg:col-span-2 overflow-hidden" data-testid="crown-board-panel">
          <div className="border-b border-white/5 px-4 py-3 text-white font-medium">The board</div>
          {data.king && (
            <div className="flex items-center gap-4 border-b border-[#8AF5D0]/20 bg-[#8AF5D0]/5 px-4 py-4">
              <CrownIcon size={20} className="text-[#8AF5D0]" />
              <CoinAvatar url={data.king.imageUrl} name={data.king.name || data.king.ticker} size={36} />
              <div>
                <div className="text-white font-medium">{data.king.name || `$${data.king.ticker}`}</div>
                <div className="font-mono text-[11px] text-[#8AF5D0]">reigning · {fmtNum(Number(data.king.burnedQuote || 0) / 1e6, 0)} burned</div>
              </div>
            </div>
          )}
          {!data.board?.length && !data.king && <Empty>No contenders yet. First burn takes the crown.</Empty>}
          {data.board?.map((b, i) => (
            <div key={b.mint || i} className="flex items-center gap-3 border-b border-white/5 px-4 py-3 last:border-0">
              <span className="w-6 font-mono text-xs text-[#556b82]">{String(i + 1).padStart(2, "0")}</span>
              <CoinAvatar url={b.imageUrl} name={b.name || b.ticker} size={28} />
              <span className="text-[13px] text-white">{b.name || `$${b.ticker}`}</span>
              <span className="ml-auto font-mono text-xs text-[#8AF5D0] tnum">{fmtNum(Number(b.burnedQuote || 0) / 1e6, 0)} {data.ticker ? `$${data.ticker}` : "tokens"}</span>
            </div>
          ))}
          {data.recent?.length > 0 && (
            <>
              <div className="border-b border-white/5 bg-white/[0.02] px-4 py-2.5 font-mono text-[10px] uppercase tracking-wider text-[#556b82]">Recent attempts</div>
              {data.recent.map((r, i) => (
                <div key={r.signature || i} className="flex items-center gap-3 border-b border-white/5 px-4 py-2.5 last:border-0">
                  <Flame size={13} className="text-[#8AF5D0]" />
                  <span className="font-mono text-xs text-white">${r.ticker}</span>
                  <span className="font-mono text-xs text-[#8ca3b8] tnum">{fmtNum(Number(r.quoteAmount || 0) / 1e6, 0)}</span>
                  <span className="ml-auto font-mono text-[11px] text-[#556b82]">{fmtAge(r.at)}</span>
                  {r.signature && <ExtLink href={solscanTx(r.signature)} className="font-mono text-[10px]">{short(r.signature, 3, 3)}</ExtLink>}
                </div>
              ))}
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}
