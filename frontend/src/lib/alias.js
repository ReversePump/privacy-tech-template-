// Deterministic per-coin aliases — the same mint always maps to the same masked name.
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
