import { useEffect, useState, useMemo } from "react";
import { makers } from "./api";

// Desks launched or added through THIS site (recorded by the proxy in Mongo).
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
      .then((arr) => setDetails(arr.filter(Boolean)))
      .catch(() => setDetails([]));
  }, [ourDesks]);

  const ourIds = useMemo(() => new Set((ourDesks || []).map((d) => d.deskId)), [ourDesks]);

  return { ourDesks, ours: details, ourIds, loading: ourDesks === null };
}
