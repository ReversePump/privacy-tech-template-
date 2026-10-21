// Fresh landing copy for NullCash. Nothing here is reused from earlier pages.

export const PRODUCTS = [
  {
    key: 'shield',
    tag: 'Vault',
    title: 'Go dark on Solana',
    body: 'Seal any Solana token, then pay, trade and earn with nobody watching.',
    href: '/app#shield',
    cta: 'Start shielding',
  },
  {
    key: 'route',
    tag: 'Route',
    title: 'Hop to any chain',
    body: 'Land on any chain with one plain deposit and no wallet hookup.',
    href: '/app#private-route',
    cta: 'Find a route',
  },
  {
    key: 'intent',
    tag: 'Intent',
    title: 'Name the result, solvers race',
    body: 'Say what you want; solvers race to fill it inside a confidential shard.',
    href: '/app#privacy-swap',
    cta: 'Post an intent',
  },
];

export const JOURNEY = [
  { t: 'Walk in', tone: 'open', d: 'Your usual Solana wallet.' },
  { t: 'Seal', tone: 'open', d: 'One signature, coins become notes.' },
  { t: 'Hold', tone: 'dark', d: 'Only your keys can read them.' },
  { t: 'Move', tone: 'dark', d: 'Pay, trade, earn. Gas is on us.' },
  { t: 'Walk out', tone: 'open', d: 'Fresh address or another chain.' },
];

export const SEEN = [
  { a: 'Shielding', out: 'Your public wallet, the coin and the amount going in', inn: 'Everything that follows' },
  { a: 'Paying someone', out: 'A transfer took place, its relayer fee, how many notes were spent', inn: 'Payer, payee, amount, and the coin if fees are paid in private SOL' },
  { a: 'Trading', out: 'The pool swapped through an approved venue', inn: 'Which person and which notes' },
  { a: 'Cashing out', out: 'A one-time address received funds', inn: 'Who funded it and from which notes' },
  { a: 'Going cross-chain', out: 'A Solana deposit and a payout on the far side', inn: 'The processing itself and any link to your wallet' },
];

export const METHODS = [
  { k: 'Scrambling', line: 'Makes the data unreadable.', verdict: 'No guarantee.', zk: false },
  { k: 'Forwarding', line: 'Sends it through someone else.', verdict: 'No guarantee.', zk: false },
  { k: 'Proving', line: 'Shows it is valid, keeps the secret.', verdict: 'NullCash uses all three.', zk: true },
];

export const PIPE = ['Your secret', 'Circuit', 'Proof', 'Verifier on Solana', 'Yes / No'];

export const CLAIMS = [
  'This note is mine',
  'I hold the key that may spend it',
  'It really sits in the pool’s Merkle tree',
  'The sums balance and the fee is locked in',
];

export const PRICES = [
  ['Shield', '0.3% added', 'Your wallet pays Solana gas'],
  ['Pay privately', 'Free', 'Gas + rent per note'],
  ['Trade or earn privately', '0.3% of what you put in', 'Gas + rent'],
  ['Cash out', '0.3% of the amount', 'Gas + rent'],
  ['Route to another chain', 'Built into the quote', 'Solana gas for your deposit'],
  ['Intent swap', '0.40% partner cut, in the quote', 'Gas on each chain'],
];

export const QA = [
  ['Who holds my keys?', 'You do. Keys and proofs never leave your browser.'],
  ['Could someone lock or grab my money?', 'No. Nothing moves without your proof, and cash-outs can never be paused.'],
  ['Do I need to connect a wallet to swap cross-chain?', 'No. Place an order, then send to its deposit address from anywhere.'],
  ['Vault vs intent swap: what is the difference?', 'Vault = ZK pool on Solana. Intent = confidential cross-chain execution.'],
  ['So am I anonymous?', 'The on-chain link is gone; your timing and amounts do the rest.'],
  ['What if I lose the recovery key?', 'Then nobody can recover the funds. Keep it offline.'],
];

// Main tech, one line each: the spec and why it matters.
export const TECH = [
  ['Groth16 · BN254', 'Every move is proven, and checked on-chain in one transaction'],
  ['Poseidon tree · 26 levels', 'Room for 67M notes in one shared crowd'],
  ['Nullifiers', 'No double-spends, no trail back to you'],
  ['PBKDF2 600k + AES-GCM', 'Vault locked on your device, never on a server'],
  ['Relayer-paid gas', 'No wallet pop-ups that give you away'],
  ['Any chain', 'Exit anywhere, without a wallet link'],
];
