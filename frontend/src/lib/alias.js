// Deterministic per-coin aliases — the same mint always maps to the same masked name.
import { useEffect, useState } from "react";

const ADJ = [
  "Fire", "Amber", "Nova", "Ember", "Solar", "Lunar", "Neon", "Astro", "Turbo", "Hyper",
  "Iron", "Golden", "Silver", "Crimson", "Azure", "Jade", "Onyx", "Ruby", "Sonic", "Rapid",
  "Prime", "Ultra", "Mega", "Alpha", "Omega", "Delta", "Zeta", "Quantum", "Cosmic", "Stellar",
  "Blazing", "Frozen", "Electric", "Mystic", "Royal", "Wild", "Swift", "Bold", "Keen", "Brave",
  "Pixel", "Rocket", "Thunder", "Shadow", "Crystal", "Velvet", "Copper", "Ivory",
];
const NOUN = [
  "Falcon", "Tiger", "Wolf", "Dragon", "Phoenix", "Viper", "Panther", "Hawk", "Lynx", "Cobra",
  "Orbit", "Comet", "Meteor", "Nebula", "Quasar", "Pulsar", "Vertex", "Zenith", "Apex", "Summit",
  "Harbor", "Beacon", "Cipher", "Signal", "Vector", "Matrix", "Engine", "Circuit", "Reactor", "Dynamo",
  "Bison", "Rhino", "Mammoth", "Condor", "Osprey", "Raven", "Sparrow", "Badger", "Otter", "Moose",
  "Cascade", "Glacier", "Volcano", "Tempest", "Aurora", "Eclipse", "Horizon", "Mirage",
];

const hash = (s) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
};

export const aliasFor = (mint, fallback = "?") => {
  const h = hash(mint || fallback);
  const a = ADJ[h % ADJ.length];
  const n = NOUN[Math.floor(h / ADJ.length) % NOUN.length];
  return { name: `${a} ${n}`, ticker: `${a.slice(0, 3)}${n.slice(0, 2)}`.toUpperCase() };
};

export const PLATFORM_CA = "7UMdnRcC9zXp1wm9MteFCEJ785bk8xpfWPgdcAghpump";

// Live market cap of the platform token (from its own CA) — used to mask $MARKETS rows
export function useMarketsMcap() {
  const [mcap, setMcap] = useState(null);
  useEffect(() => {
    let live = true;
    const load = () =>
      fetch(`${process.env.REACT_APP_BACKEND_URL}/api/markets/prices?mint=${PLATFORM_CA}&range=1h`)
        .then((r) => r.json())
        .then((d) => live && setMcap(d.mcapUsd ?? null))
        .catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => { live = false; clearInterval(t); };
  }, []);
  return mcap;
}

export const MASK_IMG = "/coin-mask.png";

// Display identity for a desk: ours keep their real identity, the platform token is $MARKETS,
// every other upstream coin is masked.
export const maskCoin = (d, isOurs, platformMint) => {
  if (isOurs) return { name: d.name, ticker: d.ticker, imageUrl: d.imageUrl };
  if (d.mint === platformMint) return { name: "MakeMarkets", ticker: "MARKETS", imageUrl: MASK_IMG };
  const a = aliasFor(d.mint, d.ticker);
  return { name: a.name, ticker: a.ticker, imageUrl: MASK_IMG };
};
