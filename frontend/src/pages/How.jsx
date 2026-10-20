import React, { useState } from "react";
import { BASE } from "../lib/api";
import RipStage from "../components/RipStage";

const STEPS = [
  ["01", "A break opens", "Grail Break or a player picks a grand prize, a size and a style. Every pack is priced live from the market catalogue."],
  ["02", "Seats sell", "All seats cost the same: the box's sticker cost plus the fees, split evenly. Max 2 per player."],
  ["03", "Packs paid for first", "When the last seat sells, every pack is paid for before the deal, so nobody knows which slab is in which pack."],
  ["04", "The oracle deals", "On-chain randomness shuffles the packs across the seats. The proof is a public Solana transaction."],
  ["05", "Ripped live", "Cheapest first, grand prize last, owner revealed on every pull. Slabs go straight to each seat's collection."],
];

export default function How() {
  const [demo, setDemo] = useState(null);

  const watchDemo = () => {
    const promise = fetch(`${BASE}/api/demo/pull?machine=gb-poke-100`).then((r) => r.json()).then((d) => d.card || null).catch(() => null);
    setDemo({ promise });
  };

  return (
    <div className="fadeup" data-testid="how-page">
      <div className="eyebrow">How it works</div>
      <h1 className="h1">Nobody picks the winner. Not even us.</h1>
      <p className="mute" style={{ marginTop: 8, maxWidth: 560 }}>
        Every break runs the same five steps, whether Grail Break built it or a player did. Here's exactly what happens to your seat and your pack.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginTop: 22 }}>
        {[
          ["Break fee", "3.5%", "one fee on the box, split evenly across seats"],
          ["The deal", "Oracle", "on-chain randomness, a public Solana transaction"],
          ["Per player", "Max 2", "seats, so nobody buys out a break"],
          ["Grand prize", "Last", "cheapest pack first, the hit opens last"],
        ].map(([t, v, s]) => (
          <div key={t} className="panel" style={{ padding: 14 }}>
            <div className="dim" style={{ fontSize: 11 }}>{t}</div>
            <div className="disp" style={{ fontSize: 22, fontWeight: 800, color: "var(--gold)", marginTop: 3 }}>{v}</div>
            <div className="mute" style={{ fontSize: 11.5, marginTop: 3 }}>{s}</div>
          </div>
        ))}
      </div>

      <h2 className="h2" style={{ marginTop: 34 }}>Five steps, every time</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginTop: 14 }}>
        {STEPS.map(([n, t, s]) => (
          <div key={n} className="panel" style={{ padding: 16 }}>
            <div className="disp gold" style={{ fontSize: 24, fontWeight: 800 }}>{n}</div>
            <div style={{ fontWeight: 700, fontSize: 13.5, marginTop: 6 }}>{t}</div>
            <p className="mute" style={{ fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>{s}</p>
          </div>
        ))}
      </div>

      <div className="panel" style={{ marginTop: 26, padding: 22, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div className="eyebrow">See a rip</div>
          <div className="h2" style={{ marginTop: 6 }}>One pack from the machines — free demo.</div>
          <p className="mute" style={{ fontSize: 12.5, marginTop: 6 }}>A demo pull with a real card from the real odds. Nothing charged, nothing kept.</p>
        </div>
        <button className="btn btn-gold" onClick={watchDemo} data-testid="demo-rip">Watch a demo rip</button>
      </div>

      <div className="panel" style={{ marginTop: 20, padding: 22 }}>
        <div className="eyebrow">Gacha, instantly</div>
        <p className="mute" style={{ fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>
          Every machine shows its odds and its average value before you pull. The pack opens on the rip stage:
          the light climbs to your slab's true rarity — common green to epic gold — then the card flips and the price counts up.
          Keep the slab in your collection, or sell it back at the machine's posted rate.
        </p>
      </div>

      {demo && (
        <RipStage
          machine={{ price: 100, name: "Demo pack" }}
          packCode="pokemon_100"
          pullPromise={demo.promise}
          onClose={() => setDemo(null)}
        />
      )}
    </div>
  );
}
