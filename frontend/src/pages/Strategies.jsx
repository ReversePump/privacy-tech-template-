import React, { useEffect, useState } from "react";
import Seo from "../components/Seo";
import { loom } from "../lib/api";
import { Loading, Empty } from "../components/bits";
import StrategyCard from "../components/StrategyCard";

export default function Strategies() {
  const [items, setItems] = useState(null);
  const [examples, setExamples] = useState(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    loom.strategies().then((d) => setItems(d.strategies || [])).catch(() => setItems([]));
    loom.examples().then((d) => setExamples(d.strategies || [])).catch(() => setExamples([]));
  }, []);

  const all = [...(items || []), ...(examples || []).filter((e) => !(items || []).some((s) => (s.strategy?.id || s.id) === e.id))];
  const rows = all.filter((s) => {
    const st = s.strategy || s;
    const needle = q.trim().toLowerCase();
    return !needle || st.name?.toLowerCase().includes(needle) || st.thesis?.toLowerCase().includes(needle) || st.id?.toLowerCase().includes(needle);
  });

  return (
    <div className="mx-auto max-w-[1200px] px-4 md:px-6 pt-14" data-testid="strategies-page">
      <Seo title="Strategies · Loom" description="Browse public trading strategies written in plain English, each with readable rules and live backtests." path="/strategies" />
      <h1 className="serif text-4xl md:text-5xl font-light tracking-tight">Strategies</h1>
      <p className="mt-3 max-w-xl text-[14px] text-[#9aa0ae]">
        Public, with no names attached. Open one, read exactly what it does, change what you like. Examples to start from, not advice.
      </p>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search strategies…"
        className="mt-8 h-11 w-full max-w-md rounded-full border border-[#ffffff26] bg-[#17171b] px-5 text-[13px] outline-none focus:border-[#ffffff66]"
        data-testid="strategies-search"
      />
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="strategies-grid">
        {(!items || !examples) && <Loading label="Loading strategies" />}
        {rows.map((s) => <StrategyCard key={(s.strategy?.id || s.id)} entry={s} />)}
        {items && examples && rows.length === 0 && <Empty>No strategies match.</Empty>}
      </div>
    </div>
  );
}
