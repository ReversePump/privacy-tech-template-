import React from "react";
import { Link } from "react-router-dom";
import { PageHead, Panel } from "../components/bits";

const SECTIONS = [
  {
    id: "what",
    title: "What MakeMarkets does",
    body: [
      "MakeMarkets gives every coin its own market maker on Solana. Launch a fresh coin here, or onboard one that already trades on pump.fun — either way it gets a dedicated set of public trading wallets that accumulate on dips and distribute into strength.",
      "The maker feeds itself: the coin's own creator fees keep it running, topped up by whatever SOL you wire in at launch. It never reaches back into your wallet — SOL only flows out to your payout address, plus a fixed 20% profit cut that is destroyed forever.",
    ],
  },
  {
    id: "money",
    title: "Where the SOL goes",
    body: [
      "A single approval at launch mints the coin, locks its fee split and funds the maker's vault. After that the vault claims fees, tops up the trading wallets and settles with you — no further signatures needed.",
      "Fee split: every trade on a coin born here pays creator fees. A split locked at mint routes 80% to the vault and 20% to the platform. It can never be edited.",
      "Your cut: you decide how much of each claim the maker keeps and how much profit gets reinvested. The remainder is payable to you whenever you like — or automatically above a threshold.",
      "Losses: a losing trade stays with the maker's capital. It is never recovered from your pending payouts, and nothing silently tops the maker up.",
    ],
  },
  {
    id: "controls",
    title: "Maker controls",
    body: [
      "Pick a temperament at launch — Patient, Conservative, Balanced, Aggressive — then retune everything from your command room. The owner wallet is the only key that can.",
      "Dip depth, sell triggers, trade sizing, round-trip targets, bail-outs, cooldowns, wallet count, payout rules — all of it is a dial. Changes apply within one engine pass and are logged publicly.",
    ],
  },
  {
    id: "transparency",
    title: "Nothing to hide",
    body: [
      "Every wallet a maker uses is listed on its page. Every buy, sell, claim and payout links straight to its transaction on Solscan.",
      "A maker's own wallets never fill each other — one position per coin across the whole desk, enforced by the engine.",
    ],
  },
  {
    id: "fees",
    title: "What it costs",
    body: [
      "20% of realized profit is burned for good — that is the entire platform take.",
      "Launch and management costs are itemized in the terms you see before approving. Your wallet reviews everything first; nothing moves without its signature.",
    ],
  },
  {
    id: "risk",
    title: "The honest part",
    body: [
      "Market making can lose money. Memecoins can go to zero and stay there.",
      "A bail-out sells the position once it falls past your line — that locks in a loss by design. Whenever the maker holds the coin, that capital is at risk.",
      "Nothing on this site is financial advice. Only put in what you can afford to lose.",
    ],
  },
];

export default function Docs() {
  return (
    <div className="mx-auto max-w-[1440px] px-4 md:px-8 pt-10 md:pt-14" data-testid="docs-page">
      <PageHead kicker="Docs" title="How it" accent="all works." sub="What the maker does, where every SOL travels, and what can go wrong — in plain terms." />
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <nav className="lg:sticky lg:top-24 self-start" data-testid="docs-nav">
          <Panel className="p-3">
            {SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`} data-testid={`docs-nav-${s.id}`}
                className="block rounded-[3px] px-3 py-2 font-mono text-xs text-[#8ca3b8] hover:bg-white/5 hover:text-[#8AF5D0] transition-colors">
                {s.title}
              </a>
            ))}
          </Panel>
        </nav>
        <div className="lg:col-span-3 space-y-6">
          {SECTIONS.map((s) => (
            <Panel key={s.id} id={s.id} className="scroll-mt-24 p-6 md:p-8" data-testid={`docs-section-${s.id}`}>
              <h2 className="text-xl md:text-2xl font-medium tracking-tight text-white">{s.title}</h2>
              <div className="mt-4 space-y-3">
                {s.body.map((p, i) => (
                  <p key={i} className="text-sm font-light leading-relaxed text-[#8ca3b8]">{p}</p>
                ))}
              </div>
            </Panel>
          ))}
          <Panel className="p-6 md:p-8 border-[#8AF5D0]/20" data-testid="docs-cta">
            <h2 className="text-xl font-medium text-white">Ready when you are.</h2>
            <p className="mt-2 text-sm font-light text-[#8ca3b8]">Mint a coin with its market maker built in, or bring a coin you already have.</p>
            <div className="mt-5 flex gap-3">
              <Link to="/launch" className="inline-flex h-10 items-center rounded-[3px] bg-[#8AF5D0] px-5 text-sm font-medium text-[#07111f] hover:bg-[#7CFFC8]" data-testid="docs-launch-btn">Launch a coin</Link>
              <Link to="/mm" className="inline-flex h-10 items-center rounded-[3px] border border-white/15 px-5 text-sm text-white hover:border-[#8AF5D0]/40 hover:text-[#8AF5D0]" data-testid="docs-mm-btn">Onboard a coin</Link>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
