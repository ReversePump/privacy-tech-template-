import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Flame } from "lucide-react";
import { makers } from "../lib/api";
import { fmtNum, fmtSol, fmtAge, short, solscanTx, lamportsToSol } from "../lib/format";
import { PageHead, Panel, Stat, StatRow, CoinAvatar, Loading, Empty, ExtLink } from "../components/bits";

export default function Burn() {
  const [data, setData] = useState(null);

  useEffect(() => {
    makers.burns().then(setData).catch(() => setData({ disabled: true }));
  }, []);

  if (!data) return <div className="mx-auto max-w-[1440px] px-4 md:px-8 pt-14"><Loading label="Loading burns" /></div>;

  const burned = Number(data.burnedQuote || 0) / 1e6;
  const supply = Number(data.supplyQuote || 0) / 1e6;
  const pct = supply > 0 ? (burned / supply) * 100 : 0;

  return (
    <div className="mx-auto max-w-[1440px] px-4 md:px-8 pt-10 md:pt-14" data-testid="burn-page">
      <PageHead
        kicker="Burn"
        title="$MAKERS"
        accent="burns."
        sub="20% of realized profit across every maker buys $MAKERS and burns it, on chain, in public. Paired coins burn their creator fees too."
        right={<Flame size={40} className="text-[#8AF5D0] opacity-60" />}
      />

      <StatRow className="mb-8">
        <Stat testId="burn-total" label="$MAKERS burned" value={fmtNum(burned, 0)} sub={`${pct.toFixed(2)}% of supply`} />
        <Stat testId="burn-supply" label="Supply" value={fmtNum(supply, 0)} />
        <Stat testId="burn-claimed" label="Fees claimed for burns" value={fmtNum(Number(data.claimedQuote || 0) / 1e6, 0)} />
        <Stat testId="burn-coins" label="Paired coins" value={fmtNum(data.pairedCoins)} sub="burn their fees in $MAKERS" />
        <Stat testId="burn-buyback" label="Buyback SOL" value={data.buybackSol ? fmtSol(data.buybackSol, 2) : "—"} sub="profit fee recycled" />
      </StatRow>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel className="overflow-hidden" data-testid="burn-list-panel">
          <div className="border-b border-white/5 px-4 py-3 text-white font-medium">Recent burns</div>
          {!data.burns?.length && <Empty>No burns yet.</Empty>}
          <div className="max-h-[480px] overflow-y-auto">
            {data.burns?.map((b, i) => (
              <div key={b.signature || i} className="flex items-center gap-3 border-b border-white/5 px-4 py-2.5 last:border-0">
                <Flame size={14} className="text-[#8AF5D0]" />
                <span className="font-mono text-xs text-white tnum">{fmtNum(Number(b.quoteAmount) / 1e6, 0)} $MAKERS</span>
                <span className={`ml-1 rounded-full px-2 py-0.5 font-mono text-[9px] uppercase ${b.state === "finalized" ? "bg-[#38c973]/10 text-[#38c973]" : "bg-white/5 text-[#8ca3b8]"}`}>{b.state}</span>
                <span className="ml-auto font-mono text-[11px] text-[#556b82]">{fmtAge(b.at)}</span>
                <ExtLink href={solscanTx(b.signature)} className="font-mono text-[10px]">{short(b.signature, 3, 3)}</ExtLink>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="overflow-hidden" data-testid="burn-coins-panel">
          <div className="border-b border-white/5 px-4 py-3 text-white font-medium">Coins burning $MAKERS</div>
          {!data.coins?.length && <Empty>No paired coins yet.</Empty>}
          <div className="max-h-[480px] overflow-y-auto">
            {data.coins?.map((c) => (
              <Link key={c.deskId} to={`/desk/${c.deskId}`} className="flex items-center gap-3 border-b border-white/5 px-4 py-2.5 last:border-0 hover:bg-white/[0.02]" data-testid={`burn-coin-${c.ticker}`}>
                <CoinAvatar url={c.imageUrl} name={c.name} size={24} />
                <div>
                  <div className="text-[13px] text-white">{c.name}</div>
                  <div className="font-mono text-[10px] text-[#556b82]">${c.ticker}</div>
                </div>
                <div className="ml-auto text-right">
                  <div className="font-mono text-xs text-[#8AF5D0] tnum">{fmtNum(Number(c.claimedQuote) / 1e6, 0)} burned</div>
                  <div className="font-mono text-[10px] text-[#556b82]">{c.payouts} payouts</div>
                </div>
              </Link>
            ))}
          </div>
        </Panel>
      </div>

      {data.buybacks?.length > 0 && (
        <Panel className="mt-6 overflow-hidden" data-testid="buybacks-panel">
          <div className="border-b border-white/5 px-4 py-3 text-white font-medium">Profit-fee buybacks</div>
          <div className="max-h-[320px] overflow-y-auto">
            {data.buybacks.map((b, i) => (
              <div key={b.signature || i} className="flex items-center gap-3 border-b border-white/5 px-4 py-2.5 last:border-0">
                <span className="font-mono text-xs text-white tnum">{lamportsToSol(b.solLamports)?.toFixed(3)} SOL</span>
                <span className="font-mono text-xs text-[#8AF5D0] tnum">→ {fmtNum(Number(b.quoteAmount) / 1e6, 0)} $MAKERS</span>
                <span className="ml-auto font-mono text-[11px] text-[#556b82]">{fmtAge(b.at)}</span>
                <ExtLink href={solscanTx(b.signature)} className="font-mono text-[10px]">{short(b.signature, 3, 3)}</ExtLink>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
