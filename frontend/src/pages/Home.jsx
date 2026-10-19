import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck, Wallet, BellRing, CircleStop, Eye } from "lucide-react";
import { weft } from "../lib/api";
import LoomSignals from "../components/LoomSignals";
import { fmtUsd0, fmtUsd, fmtNum } from "../lib/format";
import { Panel, Stat, Tag, CoinIcon, Loading } from "../components/bits";
import StrategyCard from "../components/StrategyCard";

const WATCHES = [
  ["Prices", "ETH breaks $2,600", "Long ETH 5x with $50 if ETH breaks $2,600. 20% stop."],
  ["Funding", "Longs pay over 0.02% an hour", "Short SOL 5x with $50 when funding stays above 0.02% an hour. 15% stop."],
  ["Posts on X", "@elonmusk posts about Dogecoin", "If @elonmusk posts about Dogecoin, long DOGE 5x with $100. 25% stop."],
  ["Buzz on X", "$SOL mentions double in an hour", "Long SOL 3x with $50 if mentions of $SOL on X double in an hour and the mood is bullish."],
  ["Wallets", "A wallet you follow buys a token, and you buy too", null],
  ["Hyperliquid traders", "A trader you copy opens a BTC long, and so do you", null],
  ["Prediction markets", "The Spurs' title odds pass 25%, and you buy YES", "Put $1,000 on the Spurs winning the NBA title if their odds pass 25%. Sell if the odds drop below 15%."],
  ["News", "Three negative Solana headlines in an hour", "Short SOL 3x with $50 if there are 3 or more negative news headlines about Solana in an hour."],
  ["Fear & Greed", "The index falls to 20", "If the Fear & Greed index reaches 20, open a 20x long on ETH and a 20x long on BTC with $100 on each."],
  ["Rates and the economy", "The 2-year yield drops 10 bp in 5 days", "Long BTC 2x with $100 if the US 2-year yield falls 10 bp in 5 days."],
  ["Weather", "Chicago gets 5°C colder next week", "Long natural gas 2x with $100 if Chicago is forecast to be 5°C colder next week than this week. Stop at -10% on the position."],
  ["Sports results", "The Spurs win 10 of their first 15 games", "If the Spurs win at least 10 of their first 15 games and their title odds pass 25%, put $1,000 on them winning the NBA title. Sell if the odds drop below 15%."],
];

const TRADES = [
  { icons: ["BTC", "ETH", "HYPE"], title: "Perps", where: "Hyperliquid", text: "Crypto perpetuals on Hyperliquid, up to each market's own max leverage. Your stop is placed on Hyperliquid too." },
  { icons: ["BTC", "ETH"], title: "BTC and ETH at 1000×", where: "Papertrade", text: "Full-speed practice on the two majors with pretend size." },
  { icons: ["NVDA", "TSLA", "GOLD"], title: "Stocks", where: "Hyperliquid, Solana", text: "Equity perps around the clock, even when Wall Street is closed." },
  { icons: ["OUTCOME"], title: "Prediction markets", where: "Hyperliquid", text: "Sports, elections, macro prints — traded like any other market." },
  { icons: ["SOL", "USDC"], title: "Liquidity pools", where: "Meteora", text: "Provide liquidity with rules, not vibes." },
  { icons: ["PUMP", "WIF", "JUP"], title: "Solana tokens", where: "Solana, Jupiter", text: "Any SPL token, swapped from your own wallet." },
  { icons: ["ETH", "BTC"], title: "Options", where: "Coming soon", text: "Defined-risk structures on the majors." },
];

const FAQ = [
  ["Do I need to know how to trade?", "You need an opinion, not a trading background. Loom turns it into concrete rules and shows you each one in plain English before anything runs. Practice it with pretend money first if you like, then start it with whatever amount you like."],
  ["Do I need a wallet or a Hyperliquid account?", "No. Sign in with email and Loom creates both for you. You can connect your own wallet instead if you prefer."],
  ["Is the wallet Loom makes safe?", "It is a non-custodial embedded wallet. Only you hold the keys; Loom gets a trading-only agent key."],
  ["Does Loom hold my money?", "No. Funds stay in your own Hyperliquid account or your Solana wallet. Loom can place orders and nothing else — withdrawals are blocked at the key level."],
  ["What can it watch?", "Prices, funding, posts and buzz on X, wallets, Hyperliquid traders, prediction markets, news, Fear & Greed, macro rates, weather and sports results — mixed in one sentence if you like."],
  ["Can I copy other traders?", "Yes. Pick a wallet or a Hyperliquid trader and mirror their entries with your own size and stop."],
  ["What does it cost?", "Writing strategies is free. A small fee applies only when a strategy trades: 0.10% on perps, 1% on Solana swaps."],
  ["Is there a Loom token?", "Not yet. When it launches, the contract address will be published here and on the Loom X account — nowhere else."],
  ["Can I try it without real money?", "Yes — every strategy can run on a $10,000 paper account at real prices, or as alerts only."],
  ["Can it just alert me instead?", "Yes. Any strategy can run in alert-only mode and ping you instead of trading."],
  ["What if Loom goes down?", "Your money never leaves your account. Open positions keep their on-exchange stops; you can always manage them directly."],
  ["Is this financial advice?", "No. Loom executes the rules you write. You are responsible for your own trades."],
];

export default function Home() {
  const [stats, setStats] = useState(null);
  const [strategies, setStrategies] = useState(null);
  const [open, setOpen] = useState(0);

  useEffect(() => {
    weft.stats().then(setStats).catch(() => {});
    weft.strategies().then((d) => setStrategies((d.strategies || []).slice(0, 3))).catch(() => setStrategies([]));
    // scroll reveal for sections below the hero
    const els = document.querySelectorAll("[data-testid='home-page'] section:not(:first-of-type)");
    els.forEach((el) => el.classList.add("loom-reveal"));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => e.isIntersecting && e.target.classList.add("loom-in"));
    }, { threshold: 0.12 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div data-testid="home-page">
      {/* HERO */}
      <section className="relative overflow-hidden border-b border-[#ffffff26]">
        <div className="absolute inset-0 z-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 70% 60% at 62% 42%, rgba(226,232,255,0.12), transparent 65%)" }} />
        <div className="relative z-10 mx-auto max-w-[1200px] px-4 md:px-6 pt-16 md:pt-20 pb-14">
          <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-12 items-center">
            <div>
              <div className="mono text-[10px] uppercase tracking-[0.34em] text-[#cbd5e1] fadeup" data-testid="hero-eyebrow">Analyze · Monitor · Trade</div>
              <h1 className="serif mt-4 text-5xl md:text-6xl font-light tracking-tight leading-[1.04]" data-testid="hero-title">
                Your strategy.<br />
                <span className="italic bg-gradient-to-r from-[#f1f5f9] via-[#cbd5e1] to-[#e2e8f0] bg-clip-text text-transparent">Automatically executed.</span>
              </h1>
              <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-[#9aa0ae]">
                From “buy $50 of ETH” to “if funding stays low and price holds, go long.”
                Loom turns your words into rules you can read and trades them from your own wallet — day and night.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/new" data-testid="hero-start-btn" className="inline-flex h-11 items-center gap-2 rounded-full bg-gradient-to-r from-[#f8fafc] to-[#cbd5e1] px-6 text-sm font-medium text-black shadow-[0_0_24px_rgba(226,232,255,0.45)] hover:from-white hover:to-[#e5e7eb] hover:-translate-y-0.5 transition-all">
                  Start trading <ArrowRight size={15} />
                </Link>
                <a href="#demo" data-testid="hero-demo-btn" className="inline-flex h-11 items-center rounded-full border border-[#ffffff40] bg-[#17171b99] px-6 text-sm text-[#f4f4f5] hover:border-[#ffffff66] backdrop-blur-sm transition-colors">
                  See it work
                </a>
              </div>
              <p className="mt-4 mono text-[11px] text-[#9aa0ae]">No wallet or Hyperliquid account needed: sign in with email and Loom makes them for you.</p>
            </div>
            <LoomSignals className="fadeup" />
          </div>

          {/* live stat strip */}
          <Panel className="mt-8 grid grid-cols-2 md:grid-cols-4 divide-x divide-[#ffffff26] overflow-hidden" data-testid="home-stats">
            <Stat label="Strategies" value={stats ? fmtNum(stats.strategies) : "—"} testId="stat-strategies" />
            <Stat label="Deployments" value={stats ? fmtNum(stats.deployments) : "—"} sub={stats ? `${fmtNum(stats.running)} running now` : ""} testId="stat-deployments" />
            <Stat label="Volume traded" value={stats ? fmtUsd0(stats.volumeUsd) : "—"} testId="stat-volume" />
            <Stat label="Fills" value={stats ? fmtNum(stats.fills) : "—"} testId="stat-fills" />
          </Panel>
        </div>
      </section>

      {/* RULES DEMO */}
      <section id="demo" className="mx-auto max-w-[1200px] px-4 md:px-6 py-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
          <div>
            <h2 className="serif text-3xl md:text-4xl font-light tracking-tight">Say it once. <span className="italic">Loom watches the market for you.</span></h2>
            <p className="mt-4 text-[14px] leading-relaxed text-[#9aa0ae]">
              Type the trade the way you'd say it, with one condition or five: a price, a post on X, a wallet, the mood of the market.
              Each part becomes a rule. Loom checks them every 15 to 30 seconds, day and night, and places the order once all of them hold.
            </p>
            <Link to="/new" className="mt-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-[#f1f5f9] hover:underline">
              Write your own <ArrowRight size={13} />
            </Link>
          </div>
          <Panel className="p-6 fadeup" data-testid="demo-card">
            <div className="mono text-[10px] uppercase tracking-[0.16em] text-[#9aa0ae]">New strategy · your idea</div>
            <p className="mt-3 serif text-lg italic">“Long ETH at 20× with $50 — when price is above $2,600 and funding is under 0.01% an hour.”</p>
            <div className="mt-5 space-y-2 text-[13px]">
              <div className="flex items-center gap-2"><Tag tone="accent">when</Tag> ETH price above $2,600</div>
              <div className="flex items-center gap-2"><Tag tone="accent">when</Tag> funding under 0.01% / h</div>
              <div className="flex items-center gap-2"><Tag tone="long">do</Tag> Long ETH 20× · $50 · stop −20%</div>
            </div>
            <div className="mt-5 border-t border-[#ffffff26] pt-4 flex items-center gap-2 mono text-[10px] text-[#9aa0ae]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#10b981] pulse-dot" /> checks every 15 s · Hyperliquid
            </div>
          </Panel>
        </div>
      </section>

      {/* WHAT IT TRADES */}
      <section className="border-t border-[#ffffff26] bg-[#17171b]">
        <div className="mx-auto max-w-[1200px] px-4 md:px-6 py-20">
          <h2 className="serif text-3xl md:text-4xl font-light tracking-tight">What it can trade</h2>
          <p className="mt-3 text-[14px] text-[#9aa0ae]">You name the market. Loom knows where it trades and sends the order there.</p>
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="trades-grid">
            {TRADES.map((t) => (
              <Panel key={t.title} className="p-5">
                <div className="flex items-center gap-1.5">{t.icons.map((i) => <CoinIcon key={i} symbol={i} size={24} />)}</div>
                <h3 className="mt-3 text-[15px] font-medium">{t.title}</h3>
                <div className="mono text-[10px] uppercase tracking-wider text-[#f1f5f9]">{t.where}</div>
                <p className="mt-2 text-[12.5px] leading-relaxed text-[#9aa0ae]">{t.text}</p>
              </Panel>
            ))}
          </div>
        </div>
      </section>

      {/* WHAT IT WATCHES */}
      <section className="mx-auto max-w-[1200px] px-4 md:px-6 py-20">
        <h2 className="serif text-3xl md:text-4xl font-light tracking-tight">What it watches</h2>
        <p className="mt-3 text-[14px] text-[#9aa0ae]">Any of these can be a condition, and one sentence can mix as many as you like. Pick one to try it.</p>
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="watches-grid">
          {WATCHES.map(([title, example, thesis]) => (
            thesis ? (
              <Link key={title} to={`/new?thesis=${encodeURIComponent(thesis)}`}>
                <Panel className="group h-full p-5 hover:border-[#ffffff40] transition-colors">
                  <div className="text-[14px] font-medium">{title}</div>
                  <p className="mt-1.5 text-[12.5px] text-[#9aa0ae]">“{example}”</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-[12px] text-[#f1f5f9] group-hover:underline">Try it <ArrowRight size={12} /></span>
                </Panel>
              </Link>
            ) : (
              <Link key={title} to="/new">
                <Panel className="group h-full p-5 hover:border-[#ffffff40] transition-colors">
                  <div className="text-[14px] font-medium">{title}</div>
                  <p className="mt-1.5 text-[12.5px] text-[#9aa0ae]">“{example}”</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-[12px] text-[#f1f5f9] group-hover:underline">Try it <ArrowRight size={12} /></span>
                </Panel>
              </Link>
            )
          ))}
        </div>
      </section>

      {/* SECURITY */}
      <section className="border-t border-[#ffffff26] bg-[#17171b]">
        <div className="mx-auto max-w-[1200px] px-4 md:px-6 py-20 grid grid-cols-1 lg:grid-cols-2 gap-10">
          <div>
            <h2 className="serif text-3xl md:text-4xl font-light tracking-tight">It can trade. <span className="italic">It can't withdraw.</span></h2>
            <p className="mt-4 text-[14px] leading-relaxed text-[#9aa0ae]">
              Your money stays in your own account, on Hyperliquid and on Solana. Loom gets a key that can trade for you, and nothing else.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Panel className="p-5">
              <ShieldCheck size={18} className="text-[#10b981]" />
              <div className="mt-2 text-[13px] font-medium">The agent can</div>
              <ul className="mt-2 space-y-1 text-[12.5px] text-[#9aa0ae]">
                <li>Place and cancel orders</li>
                <li>Set stops and targets</li>
                <li>Swap tokens inside your own wallet</li>
              </ul>
            </Panel>
            <Panel className="p-5">
              <Wallet size={18} className="text-[#f43f5e]" />
              <div className="mt-2 text-[13px] font-medium">The agent can't</div>
              <ul className="mt-2 space-y-1 text-[12.5px] text-[#9aa0ae]">
                <li>Withdraw your money</li>
                <li>Send it to another address</li>
                <li>Trade a strategy you haven't started</li>
              </ul>
            </Panel>
            <Panel className="p-5 sm:col-span-2 flex items-start gap-3">
              <Eye size={18} className="text-[#f1f5f9] mt-0.5" />
              <div className="text-[12.5px] leading-relaxed text-[#9aa0ae]">
                <span className="text-[#f4f4f5] font-medium">Practice first.</span> Run any strategy with $10,000 of pretend money at real prices, or as alerts only. No money moves until you start it for real. Your amount, your stop. Hold the stop button and everything closes right away.
              </div>
            </Panel>
          </div>
        </div>
      </section>

      {/* STRATEGIES PREVIEW */}
      <section className="mx-auto max-w-[1200px] px-4 md:px-6 py-20">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="serif text-3xl md:text-4xl font-light tracking-tight">Start from someone else's strategy</h2>
            <p className="mt-3 max-w-lg text-[14px] text-[#9aa0ae]">Saved strategies are public, with no names attached. Open one, read exactly what it does and change what you like.</p>
          </div>
          <Link to="/strategies" className="hidden sm:inline-flex items-center gap-1.5 text-[13px] font-medium text-[#f1f5f9] hover:underline" data-testid="home-browse-strategies">
            Browse all strategies <ArrowRight size={13} />
          </Link>
        </div>
        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="home-strategies">
          {!strategies && <Loading label="Loading strategies" />}
          {strategies?.map((s) => <StrategyCard key={s.strategy?.id || s.id} entry={s} />)}
        </div>
      </section>

      {/* TOKEN */}
      <TokenSection />

      {/* FAQ */}
      <section className="border-t border-[#ffffff26]">
        <div className="mx-auto max-w-[760px] px-4 md:px-6 py-20">
          <h2 className="serif text-3xl md:text-4xl font-light tracking-tight">Questions</h2>
          <div className="mt-8 divide-y divide-[#ffffff26]" data-testid="faq">
            {FAQ.map(([q, a], i) => (
              <div key={q}>
                <button onClick={() => setOpen(open === i ? -1 : i)} className="flex w-full items-center justify-between py-4 text-left" data-testid={`faq-${i}`}>
                  <span className="text-[14px] font-medium">{q}</span>
                  <span className="mono text-[#9aa0ae]">{open === i ? "−" : "+"}</span>
                </button>
                {open === i && <p className="pb-5 text-[13px] leading-relaxed text-[#9aa0ae]">{a}</p>}
              </div>
            ))}
          </div>
          <p className="mt-6 text-[13px] text-[#9aa0ae]">Anything else? Ask us on <a href="https://x.com/loomfiai" target="_blank" rel="noopener noreferrer" className="text-[#f1f5f9] hover:underline">X</a>.</p>
        </div>
      </section>

      {/* BOTTOM CTA */}
      <section className="border-t border-[#ffffff26] bg-[#17171b]">
        <div className="mx-auto max-w-[1200px] px-4 md:px-6 py-20 text-center">
          <h2 className="serif text-4xl md:text-5xl font-light tracking-tight">What's your <span className="italic text-[#f1f5f9]">thesis?</span></h2>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {["Buy $50 of ETH now", "If @elonmusk posts about Dogecoin, long DOGE 5x with $100", "Long BTC and ETH 20x with $100 each if Fear & Greed drops to 20"].map((t) => (
              <Link key={t} to={`/new?thesis=${encodeURIComponent(t)}`} className="rounded-full border border-[#ffffff26] bg-[#17171b] px-4 py-2 text-[12.5px] hover:border-[#f1f5f9] hover:text-[#cbd5e1] transition-colors">
                {t}
              </Link>
            ))}
          </div>
          <p className="mt-6 mono text-[11px] text-[#9aa0ae]">Free to write. A small fee only when it trades.</p>
        </div>
      </section>
    </div>
  );
}

function TokenSection() {
  return (
    <section className="border-t border-[#ffffff26] bg-[#17171b]" id="token">
      <div className="mx-auto max-w-[1200px] px-4 md:px-6 py-20">
        <div className="mono text-[10px] uppercase tracking-[0.16em] text-[#9aa0ae]">The Loom token</div>
        <h2 className="mt-3 serif text-3xl md:text-4xl font-light tracking-tight max-w-2xl">
          Not launched yet. <span className="italic text-[#f1f5f9]">Announced here first.</span>
        </h2>
        <Panel className="mt-8 p-6 max-w-2xl" data-testid="loom-token-note">
          <p className="text-[14px] leading-relaxed text-[#9aa0ae]">
            There is no official Loom token today. When it launches, the contract address will be published on this page
            and on <a href="https://x.com/loomfiai" target="_blank" rel="noopener noreferrer" className="text-[#f1f5f9] hover:underline">X @loomfiai</a> — and nowhere else.
            Anything trading before that is fake.
          </p>
          <p className="mt-4 mono text-[11px] text-[#6b7280]">Follow along — every platform fee is public on the <Link to="/revenue" className="text-[#f1f5f9] hover:underline">Revenue page</Link>.</p>
        </Panel>
      </div>
    </section>
  );
}
