import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export const CA = '31GYUbJW5vjF1o7VM5SGP9Emj5WDBHb1cdcR8BM6pump';
const SHORT = `${CA.slice(0, 4)}…${CA.slice(-4)}`;

export default function CaChip({ line = 'border-[#202221]/70' }) {
  const [ok, setOk] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(CA); }
    catch (e) {
      const t = document.createElement('textarea'); t.value = CA; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); } catch (_) { /* noop */ } t.remove();
    }
    setOk(true); setTimeout(() => setOk(false), 1600);
  };
  return (
    <button type="button" onClick={copy} title={`Copy contract address ${CA}`} aria-label={`Copy contract address ${CA}`}
      data-testid="nav-ca-chip"
      className={`group flex h-10 min-w-0 shrink-0 items-center gap-2 whitespace-nowrap rounded-[10px] border px-2.5 font-mono text-[12px] transition hover:-translate-y-0.5 sm:px-3 ${line}`}>
      <span className="rounded-[6px] bg-[#202221] px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-[#D9D9D9]">CA</span>
      <span className="hidden lg:inline" data-testid="nav-ca-full">{CA}</span>
      <span className="lg:hidden" data-testid="nav-ca-short">{SHORT}</span>
      {ok ? <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} data-testid="nav-ca-copied" /> : <Copy className="h-3.5 w-3.5 shrink-0 opacity-70 group-hover:opacity-100" strokeWidth={2} />}
    </button>
  );
}
