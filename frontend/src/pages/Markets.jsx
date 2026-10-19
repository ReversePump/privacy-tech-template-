import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Loader2, Search } from "lucide-react";
import Seo from "../components/Seo";
import { Panel, Tag, Loading, Empty, Sparkline } from "../components/bits";
import { fmtUsd0 } from "../lib/format";

const API = process.env.REACT_APP_BACKEND_URL;

const fmtPrice = (p) => (p == null ? "—" : p < 0.01 ? p.toPrecision(3) : p < 1 ? p.toFixed(4) : p.toLocaleString("en-US", { maximumFractionDigits: 2 }));
const fmtBig = (v) => (v == null ? "—" : v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${v}`);

export default function Markets() {
  const [markets, setMarkets] = useState(null);
  const [tab, setTab] = useState("perp");
  const [q, setQ] = useState("");
  const [openKey, setOpenKey] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/hl/markets`).then((r) => r.json()).then((d) => setMarkets(d.markets || [])).catch(() => setMarkets([]));
    const iv = setInterval(() => {
      fetch(`${API}/api/hl/markets`).then((r) => r.json()).then((d) => setMarkets(d.markets || [])).catch(() => {});
    }, 30000);
    return () => clearInterval(iv);
  }, []);

  const list = useMemo(() => {
    const rows = (markets || []).filter((m) => (tab === "perp" ? !m.spot : m.spot));
    const ql = q.trim().toLowerCase();
    return (ql ? rows.filter((m) => (m.label || m.symbol).toLowerCase().includes(ql)) : rows).slice(0, 60);
  }, [markets, tab, q]);

  return (
    <div className="mx-auto max-w-[1200px] px-4 md:px-6 pt-14" data-testid="markets-page">
      <Seo title="Markets · Loom" description="Every Hyperliquid market with live prices, 24h change, volume and charts — perps and spot." path="/markets" />
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="serif text-4xl md:text-5xl font-light tracking-tight">Markets</h1>
          <p className="mt-3 max-w-xl text-[14px] text-[#9aa0ae]">Every market you can trade on Loom — live prices straight from Hyperliquid, refreshed every 30 seconds.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex gap-1 rounded-full border border-[#ffffff26] p-1">
            {[["perp", "Perps"], ["spot", "Spot"]].map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} data-testid={`markets-tab-${k}`}
                className={`h-8 rounded-full px-4 text-[12px] transition-colors ${tab === k ? "bg-[#e5e7eb] text-black" : "text-[#9aa0ae]"}`}>
                {l}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b7280]" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" data-testid="markets-search"
              className="h-9 w-40 rounded-full border border-[#ffffff26] bg-[#17171b] pl-8 pr-3 text-[12.5px] outline-none focus:border-[#ffffff66]" />
          </div>
        </div>
      </div>

      <Panel className="mt-8 overflow-hidden" data-testid="markets-panel">
        {!markets && <Loading label="Loading markets" />}
        {markets && list.length === 0 && <Empty>No markets match.</Empty>}
        {markets && list.length > 0 && (
          <div className="overflow-x-auto">
            <table className="dtable" data-testid="markets-table">
              <thead>
                <tr><th>Market</th><th className="text-right">Price</th><th className="text-right">Max lev</th><th className="text-right"></th></tr>
              </thead>
              <tbody>
                {list.map((m) => (
                  <MarketRow key={m.symbol} m={m} open={openKey === m.symbol} onToggle={() => setOpenKey(openKey === m.symbol ? null : m.symbol)} tab={tab} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <p className="mt-4 text-[11px] text-[#6b7280]">Prices update live. Tap a row for chart, depth of detail and a trade shortcut.</p>
    </div>
  );
}

function MarketRow({ m, open, onToggle, tab }) {
  const [detail, setDetail] = useState(null);
  const [candles, setCandles] = useState(null);
  const [range, setRange] = useState("1D");

  useEffect(() => {
    if (!open) return;
    setDetail(null);
    const key = `hl:${tab === "perp" ? "perp" : "spot"}:${m.symbol}`;
    fetch(`${API}/api/relay/market?key=${encodeURIComponent(key)}`).then((r) => r.json()).then(setDetail).catch(() => {});
  }, [open, m.symbol, tab]);

  useEffect(() => {
    if (!open) return;
    setCandles(null);
    fetch(`${API}/api/relay/chart`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instrument: { kind: tab === "perp" ? "perp" : "spot", venue: "hyperliquid", symbol: m.symbol }, range }),
    }).then((r) => r.json()).then((d) => setCandles(d.candles || [])).catch(() => setCandles([]));
  }, [open, m.symbol, range, tab]);

  const points = (candles || []).map((c) => ({ t: c[0], v: c[4] }));
  const chg = detail?.change24hPct;

  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer" data-testid={`market-row-${m.symbol}`}>
        <td>
          <div className="text-[13px] font-medium">{m.label || m.symbol}</div>
          <div className="mono text-[10px] text-[#6b7280]">{m.spot ? "spot" : "perp"}</div>
        </td>
        <td className="text-right mono tnum">${fmtPrice(m.price)}</td>
        <td className="text-right mono text-[11px] text-[#9aa0ae]">{m.spot ? "—" : `${m.maxLeverage}×`}</td>
        <td className="text-right text-[#6b7280] text-[11px]">{open ? "▲" : "▼"}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={4} className="!p-0">
            <div className="border-t border-[#ffffff14] bg-[#0a0a0c] px-5 py-4 fadeup" data-testid={`market-detail-${m.symbol}`}>
              <div className="flex flex-wrap gap-x-8 gap-y-2 text-[12px]">
                <span>24h <b className={chg < 0 ? "text-[#f43f5e]" : "text-[#10b981]"}>{chg != null ? `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%` : "…"}</b></span>
                <span>Volume 24h <b>{fmtBig(detail?.volume24hUsd)}</b></span>
                {detail?.openInterestUsd != null && <span>Open interest <b>{fmtBig(detail.openInterestUsd)}</b></span>}
                {detail?.fundingRate != null && <span>Funding <b className="mono">{Number(detail.fundingRate).toFixed(5)}%</b></span>}
                <span className="ml-auto flex gap-1">
                  {["1H", "1D", "1W", "1M"].map((r) => (
                    <button key={r} onClick={(e) => { e.stopPropagation(); setRange(r); }} data-testid={`chart-range-${r}`}
                      className={`h-7 rounded-full px-2.5 text-[11px] mono ${range === r ? "bg-[#e5e7eb] text-black" : "border border-[#ffffff26] text-[#9aa0ae]"}`}>{r}</button>
                  ))}
                </span>
              </div>
              <div className="mt-3">
                {!candles && <Loader2 size={14} className="animate-spin text-[#6b7280]" />}
                {candles && points.length > 1 && <Sparkline points={points} height={110} />}
              </div>
              <div className="mt-3">
                <Link to="/account" onClick={(e) => e.stopPropagation()} data-testid={`market-trade-${m.symbol}`}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#e5e7eb] px-4 text-[12px] font-medium text-black hover:bg-white transition-colors">
                  Trade {m.label || m.symbol} <ArrowUpRight size={12} />
                </Link>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
