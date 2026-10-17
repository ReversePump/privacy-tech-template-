import { useEffect, useState, useMemo } from "react";
import { makers } from "./api";

// Coins that must never surface on MakeMarkets (upstream's own token etc.)
const BLOCKED_TICKERS = new Set(["MAKERS"]);
const BLOCKED_ORIGINS = new Set(["native"]);

const isBlocked = (d) =>
  !d || BLOCKED_ORIGINS.has(d.origin) || BLOCKED_TICKERS.has((d.ticker || "").toUpperCase());

export const feedItemBlocked = (it) =>
  BLOCKED_TICKERS.has((it?.ticker || "").toUpperCase());

// Desks launched or added through THIS site (recorded by the relay in Mongo).
export function useOurDesks(pollMs = 30000) {
  const [ourDesks, setOurDesks] = useState(null); // recorded rows
  const [details, setDetails] = useState(null);   // enriched desk objects

  useEffect(() => {
    let live = true;
    const load = () =>
      fetch(`${process.env.REACT_APP_BACKEND_URL}/api/our/desks`)
        .then((r) => r.json())
        .then((d) => live && setOurDesks(d.desks || []))
        .catch(() => live && setOurDesks([]));
    load();
    const t = setInterval(load, pollMs);
    return () => { live = false; clearInterval(t); };
  }, [pollMs]);

  useEffect(() => {
    if (!ourDesks) return;
    if (!ourDesks.length) { setDetails([]); return; }
    Promise.all(ourDesks.map((d) => makers.desk(d.deskId).catch(() => null)))
      .then((arr) => setDetails(arr.filter((d) => d && !isBlocked(d))))
      .catch(() => setDetails([]));
  }, [ourDesks]);

  const ourIds = useMemo(
    () => new Set((details || []).map((d) => d.id)),
    [details]
  );

  return { ourDesks, ours: details, ourIds, loading: ourDesks === null };
}

