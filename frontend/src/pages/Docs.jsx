import React from "react";
import { Link } from "react-router-dom";
import { PageHead, Panel } from "../components/bits";

const SECTIONS = [
  {
    id: "what",
    title: "What Makers is",
    body: [
      "Makers is a market maker launchpad on Solana. Every coin launched here — or added from pump.fun — gets its own market maker: a set of public trading wallets that buy the dips and sell the rises.",
      "The maker is funded by the coin's own creator rewards, plus any SOL you fund it with at launch. It never touches your wallet after launch: the only place SOL ever leaves a maker to is your payout address, apart from the 20% profit fee that is burned for good.",
    ],
  },
  {
    id: "money",
    title: "How the money moves",
    body: [
      "One launch transaction creates the coin on pump.fun, locks its creator-reward split, and funds the maker's treasury. After that the treasury claims rewards, funds the trading wallets, and pays you your share.",
      "Rewards: every trade on a coin launched here pays creator rewards. A split locked at launch sends 80% to the treasury and 20% to Makers; nobody can change it later.",
      "Your share: you choose how much of each claim stays in the maker and how much of each profit is reinvested. The rest is payable to you.",
      "Losses: a loss stays with the maker's capital. It is never taken from what you are owed, and nothing tops it up.",
    ],
  },
  {
    id: "settings",
    title: "Settings",
    body: [
      "Pick a preset at launch — Patient, Conservative, Balanced or Aggressive — then tune every number from your dashboard. The owner wallet is the only one that can.",
      "Each change takes effect within one engine pass and is logged publicly. Buy/sell triggers, intensity, profit target, stop-loss, cooldown, wallet count, payout thresholds and more.",
    ],
  },
  {
    id: "transparency",
    title: "Transparency",
    body: [
      "Every wallet is public. Every trade, claim and payout links to its transaction on Solscan.",
      "A maker's wallets never trade against each other. The engine enforces one position per coin across its wallets.",
    ],
  },
  {
    id: "fees",
    title: "Fees",
    body: [
      "20% of realized profit across every maker is bought back and burned on the open market.",
      "Launches and desk operations carry the platform fee shown in the launch terms before you sign. Nothing is signed or spent until your wallet approves.",
    ],
  },
  {
    id: "risk",
    title: "Risk",
    body: [
      "Market making can lose money. Memecoins can go to zero and stay there.",
      "A stop-loss sells a position when it falls past your threshold — that realizes a loss. The maker's capital is at risk whenever it holds the coin.",
      "Nothing here is financial advice. Only launch with what you can lose.",
    ],
  },
];

export default function Docs() {
  return (
    <div className="mx-auto max-w-[1440px] px-4 md:px-8 pt-10 md:pt-14" data-testid="docs-page">
      <PageHead kicker="Docs" title="The" accent="manual." sub="Everything the engine does, where the money moves, and what can go wrong." />
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <nav className="lg:sticky lg:top-24 self-start" data-testid="docs-nav">
          <Panel className="p-3">
            {SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`} data-testid={`docs-nav-${s.id}`}
                className="block rounded-lg px-3 py-2 font-mono text-xs text-[#8ca3b8] hover:bg-white/5 hover:text-[#8AF5D0] transition-colors">
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
            <h2 className="text-xl font-medium text-white">Ready?</h2>
            <p className="mt-2 text-sm font-light text-[#8ca3b8]">Launch a coin with its own maker, or put one on any pump.fun coin.</p>
            <div className="mt-5 flex gap-3">
              <Link to="/launch" className="inline-flex h-10 items-center rounded-full bg-[#8AF5D0] px-5 text-sm font-medium text-[#07111f] hover:bg-[#7CFFC8]" data-testid="docs-launch-btn">Launch a coin</Link>
              <Link to="/mm" className="inline-flex h-10 items-center rounded-full border border-white/15 px-5 text-sm text-white hover:border-[#8AF5D0]/40 hover:text-[#8AF5D0]" data-testid="docs-mm-btn">Any coin</Link>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
