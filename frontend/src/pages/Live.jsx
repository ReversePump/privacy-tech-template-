import React, { useEffect, useState } from "react";
import { gh, money } from "../lib/api";

export default function Live() {
  const [breaks, setBreaks] = useState([]);

  useEffect(() => {
    const load = () => gh("/breaks").then((d) => setBreaks(d.breaks || [])).catch(() => {});
    load();
    const iv = setInterval(load, 20000);
    return () => clearInterval(iv);
  }, []);

  const live = breaks.filter((b) => (b.taken || 0) >= (b.spots || 1));
  const filling = breaks.filter((b) => (b.taken || 0) < (b.spots || 1) && (b.taken || 0) > 0);

  return (
    <div className="fadeup" data-testid="live-page">
      <div className="eyebrow">Live</div>
      <h1 className="h1">Breaks as they happen.</h1>
      <p className="mute" style={{ marginTop: 8, maxWidth: 540 }}>
        Streams and live rip stages run when a break fills. Below: what's filling right now — grab a seat and the rip starts when the table completes.
      </p>

      <div className="panel" style={{ marginTop: 22, padding: 22, textAlign: "center" }} data-testid="live-stage">
        <span className="livedot" style={{ fontSize: 12 }}>watching</span>
        <div className="h2" style={{ marginTop: 10 }}>
          {live.length ? `${live.length} break${live.length > 1 ? "s" : ""} ripping now` : "The stage is between breaks"}
        </div>
        <p className="mute" style={{ fontSize: 12.5, marginTop: 6 }}>
          {live.length
            ? "A full table means packs are being ripped — watch the hall of hits for the reveals."
            : `${filling.length} filling — the next table that completes goes live.`}
        </p>
      </div>

      <h2 className="h2" style={{ marginTop: 26 }}>Filling now</h2>
      <div style={{ marginTop: 12 }}>
        {(filling.length ? filling : breaks.slice(0, 5)).map((b) => (
          <div key={b.id} className="breakrow" style={{ gridTemplateColumns: "1fr 90px minmax(120px,.8fr)" }} data-testid={`live-${b.id}`}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{b.title}</div>
              <div className="dim" style={{ fontSize: 11 }}>{b.lineName || b.line} · {money(b.spotPrice)} a seat</div>
            </div>
            <span className="mono gold">{money(b.cost)}</span>
            <div>
              <div className="seatbar"><i style={{ width: `${Math.round(((b.taken || 0) / (b.spots || 1)) * 100)}%` }} /></div>
              <div className="dim mono" style={{ fontSize: 10.5, marginTop: 3 }}>{b.taken || 0}/{b.spots} seats</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
