import React from "react";
import { Link } from "react-router-dom";
import Seo from "../components/Seo";

const PAGES = {
  terms: {
    title: "Terms of use",
    path: "/terms",
    body: [
      ["What Loom is", "Loom is a tool that turns trading instructions you write into automated orders on your own exchange accounts. Loom is software, not a broker, exchange, advisor, or fund."],
      ["Your responsibility", "You decide what strategies run and with how much money. You are solely responsible for your trades, your tax obligations, and complying with the laws that apply to you. Nothing on Loom is financial advice."],
      ["Your wallets", "When you sign up with email, Loom generates blockchain wallets for you. Keys are stored encrypted and are used only to execute actions you initiate or strategies you deploy. You can withdraw all funds at any time."],
      ["Risks", "Trading digital assets and derivatives can result in the loss of everything you put in. Automated strategies can malfunction, markets can gap through stops, and networks can fail. Never trade money you cannot afford to lose."],
      ["Availability", "We aim for continuous operation but do not guarantee uptime. Third-party venues (Hyperliquid, Jupiter, Solana) operate independently of Loom."],
    ],
  },
  privacy: {
    title: "Privacy",
    path: "/privacy",
    body: [
      ["What we store", "Your email address, an encrypted copy of your generated wallet keys, your saved strategies, deployments, alerts, and trade history — only what the service needs to run."],
      ["What we never do", "We never sell your data, never show your keys to anyone (they are encrypted at rest and never leave the server), and never email you anything you did not ask for."],
      ["What we use", "Session tokens stay in your browser's local storage. We use no advertising trackers."],
      ["Deletion", "Contact us on X @loomfiai to delete your account. Withdraw your funds first — deleted accounts cannot be recovered."],
    ],
  },
  risk: {
    title: "Risk disclosure",
    path: "/risk",
    body: [
      ["You can lose everything", "Perpetual futures with leverage can liquidate your full position in minutes. Spot tokens can go to zero. Past performance — including backtests — does not predict future results."],
      ["Automation risk", "A strategy does exactly what its rules say, including when the rules are wrong. Review every rule before deploying, start in practice mode, and use stop losses."],
      ["Market and venue risk", "Prices can gap through stop levels. Exchanges can halt, oracle prices can deviate, and blockchains can congest. Deposits and withdrawals depend on networks we do not control."],
      ["No advice", "Loom executes your instructions. Nothing shown — strategies, leaderboards, other traders' results — is a recommendation to trade."],
    ],
  },
};

export default function Legal({ page }) {
  const p = PAGES[page];
  return (
    <div className="mx-auto max-w-[760px] px-4 md:px-6 pt-14 pb-10" data-testid={`legal-${page}`}>
      <Seo title={`${p.title} · Loom`} description={`${p.title} — Loom, the AI trading agent.`} path={p.path} />
      <h1 className="serif text-4xl font-light tracking-tight">{p.title}</h1>
      <div className="mt-8 space-y-7">
        {p.body.map(([h, t]) => (
          <div key={h}>
            <h2 className="text-[15px] font-medium">{h}</h2>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#9aa0ae]">{t}</p>
          </div>
        ))}
      </div>
      <p className="mt-10 text-[12px] text-[#6b7280]">Questions? Reach us on <a href="https://x.com/loomfiai" target="_blank" rel="noopener noreferrer" className="text-[#f1f5f9] hover:underline">X @loomfiai</a>. <Link to="/" className="text-[#f1f5f9] hover:underline ml-2">← Home</Link></p>
    </div>
  );
}
