import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ChevronDown, Eye, EyeOff, Info } from 'lucide-react';
import NmNav from '../components/NmNav';
import Logo from '../components/Logo';
import { DOC_GROUPS } from './docsContent';
import { SEEN, PRICES } from './landingCopy';

function FeesBox() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-[12px] border border-[#202221]/70">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} data-testid="docs-fees-toggle"
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left">
        <span className="text-[15px] font-semibold text-[#202221]">Fee breakdown <span className="font-normal text-[#202221]/60">· tap to {open ? 'hide' : 'show'}</span></span>
        <ChevronDown className={`h-5 w-5 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={`grid transition-all duration-500 ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="overflow-x-auto px-4 pb-4">
            <table className="w-full min-w-[520px] text-left text-[14px]" data-testid="docs-fees-table">
              <thead><tr className="border-b border-[#202221]/30 text-[#202221]/60"><th className="py-2.5 pr-3 font-medium">Action</th><th className="py-2.5 pr-3 font-medium">Protocol fee</th><th className="py-2.5 font-medium">Network cost</th></tr></thead>
              <tbody>{PRICES.map((f) => (
                <tr key={f[0]} className="border-b border-[#202221]/10 last:border-0"><td className="py-2.5 pr-3 font-semibold">{f[0]}</td><td className="py-2.5 pr-3">{f[1]}</td><td className="py-2.5 text-[#202221]/70">{f[2]}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function Block({ b }) {
  switch (b.k) {
    case 'p': return <p className="text-[15.5px] leading-[1.75] text-[#202221]/80">{b.t}</p>;
    case 'list': return (
      <ul className="space-y-2">{b.items.map((x) => (
        <li key={x} className="flex gap-3 text-[15px] leading-[1.6] text-[#202221]/85"><span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-[2px] bg-[#202221]" />{x}</li>
      ))}</ul>
    );
    case 'steps': return (
      <ol className="space-y-3">{b.items.map(([h, t], i) => (
        <li key={h} className="flex gap-4 rounded-[12px] border border-[#202221]/25 bg-[#e2e2e2] p-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] bg-[#202221] font-mono text-[14px] font-bold text-[#B9C1CC]">{i + 1}</span>
          <span><span className="block text-[15.5px] font-semibold text-[#202221]">{h}</span><span className="mt-1 block text-[14.5px] leading-[1.6] text-[#202221]/75">{t}</span></span>
        </li>
      ))}</ol>
    );
    case 'code': return <pre className="overflow-x-auto rounded-[12px] bg-[#202221] p-4 font-mono text-[12.5px] leading-[1.7] text-[#B9C1CC]">{b.t}</pre>;
    case 'note': return (
      <div className="flex gap-3 rounded-[12px] border-l-4 border-[#B9C1CC] bg-[#202221] p-4 text-[14.5px] leading-[1.6] text-[#D9D9D9]"><Info className="mt-0.5 h-4 w-4 shrink-0 text-[#B9C1CC]" />{b.t}</div>
    );
    case 'kv': return (
      <dl className="divide-y divide-[#202221]/15 rounded-[12px] border border-[#202221]/40">{b.rows.map(([k, v]) => (
        <div key={k} className="grid gap-1 px-4 py-3 sm:grid-cols-[180px_1fr]"><dt className="text-[13px] font-semibold uppercase tracking-[.06em] text-[#202221]/60">{k}</dt><dd className="text-[14.5px] text-[#202221]">{v}</dd></div>
      ))}</dl>
    );
    case 'table': return (
      <div className="overflow-x-auto rounded-[12px] border border-[#202221]/50">
        <table className="w-full min-w-[560px] text-left text-[14px]">
          <thead><tr className="bg-[#202221] text-[#D9D9D9]">{b.cols.map((c) => <th key={c} className="px-4 py-2.5 font-medium">{c}</th>)}</tr></thead>
          <tbody>{b.rows.map((r) => (
            <tr key={r[0]} className="border-t border-[#202221]/12"><td className="whitespace-nowrap px-4 py-2.5 font-mono text-[12.5px]">{r[0]}</td><td className="px-4 py-2.5 text-[#202221]/75">{r[1]}</td></tr>
          ))}</tbody>
        </table>
      </div>
    );
    case 'fees': return <FeesBox />;
    case 'visibility': return (
      <div className="overflow-x-auto rounded-[12px] border border-[#202221]/50" data-testid="docs-visibility">
        <table className="w-full min-w-[600px] text-left text-[14px]">
          <thead><tr className="bg-[#202221] text-[#D9D9D9]"><th className="px-4 py-2.5 font-medium">Action</th><th className="px-4 py-2.5 font-medium"><span className="inline-flex items-center gap-1.5"><Eye className="h-4 w-4" />Chain sees</span></th><th className="px-4 py-2.5 font-medium"><span className="inline-flex items-center gap-1.5 text-[#B9C1CC]"><EyeOff className="h-4 w-4" />Stays sealed</span></th></tr></thead>
          <tbody>{SEEN.map((v) => (
            <tr key={v.a} className="border-t border-[#202221]/12"><td className="px-4 py-2.5 font-semibold">{v.a}</td><td className="px-4 py-2.5 text-[#202221]/70">{v.out}</td><td className="px-4 py-2.5">{v.inn}</td></tr>
          ))}</tbody>
        </table>
      </div>
    );
    default: return null;
  }
}

export default function NcDocsPage() {
  const pages = useMemo(() => DOC_GROUPS.flatMap((g) => g.pages.map((p) => ({ ...p, group: g.title }))), []);
  const [active, setActive] = useState(pages[0].id);
  useEffect(() => {
    document.title = 'NullCash Docs';
    const els = pages.map((p) => document.getElementById(p.id)).filter(Boolean);
    const io = new IntersectionObserver((ents) => {
      const vis = ents.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (vis[0]) setActive(vis[0].target.id);
    }, { rootMargin: '-110px 0px -60% 0px' });
    els.forEach((e) => io.observe(e));
    if (window.location.hash) {
      const t = document.getElementById(window.location.hash.slice(1));
      if (t) setTimeout(() => t.scrollIntoView(), 60);
    }
    return () => io.disconnect();
  }, [pages]);
  const go = (id) => { const t = document.getElementById(id); if (t) { t.scrollIntoView({ behavior: 'smooth' }); window.history.replaceState(null, '', `#${id}`); } };
  return (
    <div className="nm-landing min-h-screen bg-[#D9D9D9] text-[#202221]" data-testid="docs-page">
      <NmNav />
      <div className="mx-auto max-w-[1180px] px-5 pb-24 pt-28">
        <header className="border-b border-[#202221]/40 pb-8">
          <div className="font-mono text-[11px] uppercase tracking-[.18em] text-[#202221]/60">NullCash · documentation</div>
          <h1 className="nm-h mt-3 text-[40px] font-semibold leading-[1.04] tracking-[-0.03em] sm:text-[60px]">The manual.</h1>
          <p className="mt-3 max-w-[620px] text-[17px] leading-[1.6] text-[#202221]/75">Everything about how NullCash seals, moves and releases money, from the first click to the circuit.</p>
          <div className="mt-6 md:hidden">
            <select value={active} onChange={(e) => go(e.target.value)} data-testid="docs-select"
              className="w-full rounded-[10px] border border-[#202221] bg-[#D9D9D9] px-3 py-3 text-[15px]">
              {DOC_GROUPS.map((g) => <optgroup key={g.id} label={g.title}>{g.pages.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</optgroup>)}
            </select>
          </div>
        </header>
        <div className="mt-10 grid gap-12 md:grid-cols-[230px_1fr]">
          <aside className="hidden md:block">
            <nav className="sticky top-28 space-y-6" data-testid="docs-sidebar">
              {DOC_GROUPS.map((g) => (
                <div key={g.id}>
                  <div className="font-mono text-[11px] uppercase tracking-[.16em] text-[#202221]/55">{g.title}</div>
                  <ul className="mt-2 space-y-0.5 border-l border-[#202221]/25">
                    {g.pages.map((p) => (
                      <li key={p.id}>
                        <button type="button" onClick={() => go(p.id)} data-testid={`docs-link-${p.id}`}
                          className={`-ml-px block w-full border-l-2 py-1.5 pl-3 text-left text-[14.5px] transition-colors ${active === p.id ? 'border-[#202221] font-semibold text-[#202221]' : 'border-transparent text-[#202221]/65 hover:text-[#202221]'}`}>{p.title}</button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <a href="/app" className="nm-lime flex h-10 items-center justify-center gap-2 rounded-[10px] text-[14px] font-semibold">Open app <ArrowRight className="h-4 w-4" /></a>
            </nav>
          </aside>
          <main className="min-w-0 space-y-16">
            {pages.map((p) => (
              <section key={p.id} id={p.id} className="scroll-mt-28" data-testid={`docs-section-${p.id}`}>
                <div className="font-mono text-[11px] uppercase tracking-[.16em] text-[#202221]/50">{p.group}</div>
                <h2 className="nm-h mt-2 text-[28px] font-semibold tracking-[-0.02em] sm:text-[34px]">{p.title}</h2>
                <p className="mt-2 text-[17px] leading-[1.6] text-[#202221]">{p.lead}</p>
                <div className="mt-6 space-y-5">{p.blocks.map((b, i) => <Block key={`${p.id}-${i}`} b={b} />)}</div>
              </section>
            ))}
          </main>
        </div>
      </div>
      <footer className="bg-[#202221] text-[#D9D9D9]/60">
        <div className="mx-auto flex max-w-[1180px] flex-col items-center justify-between gap-3 px-5 py-8 text-[13px] sm:flex-row">
          <Logo light size={24} />
          <span>© {new Date().getFullYear()} NullCash</span>
        </div>
      </footer>
    </div>
  );
}
