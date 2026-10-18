import { useEffect, useState, useMemo } from "react";
import { makers } from "./api";

// Coins that must never surface on MakeMarkets (upstream's own token and brand-evoking copycats)
const BLOCKED_TICKER_PARTS = ["MAKER"];
const BLOCKED_ORIGINS = new Set(["native"]);
const BLOCKED_MINTS = new Set(["3XEqNHe3jHTRWAZCTHbb1UwpSfNbJL9oU1ErsM86pump"]);
const BLOCKED_NAMES = new Set(["makers.fun", "makers"]);

const tickerBlocked = (t) => BLOCKED_TICKER_PARTS.some((p) => (t || "").toUpperCase().includes(p));

// The upstream's own token is rebranded as the platform's $MARKETS in feeds.
export const PLATFORM_MINT = "3XEqNHe3jHTRWAZCTHbb1UwpSfNbJL9oU1ErsM86pump";

const isBlocked = (d) =>
  !d ||
  BLOCKED_ORIGINS.has(d.origin) ||
  tickerBlocked(d.ticker) ||
  BLOCKED_MINTS.has(d.mint) ||
  BLOCKED_NAMES.has((d.name || "").toLowerCase());

export const feedItemBlocked = (it) => {
  if (!it) return true;
  if (it.mint === PLATFORM_MINT) return false; // shown rebranded as $MARKETS
  return (
    tickerBlocked(it?.ticker) ||
    BLOCKED_MINTS.has(it?.mint) ||
    BLOCKED_NAMES.has((it?.name || "").toLowerCase())
  );
};

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

