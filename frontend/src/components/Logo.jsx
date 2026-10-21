import React from 'react';

// Cloak Privacy brand: nested-diamond line mark + serif wordmark.
export default function Logo({ size = 30, withWord = true, light = true }) {
  return (
    <div className="flex items-center gap-2.5 group" data-testid="cloak-logo">
      <img
        src={light ? '/brand/cloak-mark.png?v=1' : '/brand/cloak-mark-dark.png?v=1'}
        alt="Cloak Privacy"
        style={{ height: size, width: size }}
        className="shrink-0 object-contain transition-transform duration-700 group-hover:rotate-45"
        draggable="false"
      />
      {withWord && (
        <span className="leading-none">
          <span className={`block text-[20px] tracking-[-0.01em] ${light ? 'text-[#eef6f0]' : 'text-[#0a1410]'}`}
            style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
            Cloak
          </span>
          <span className="block font-mono text-[8.5px] uppercase tracking-[.42em] text-[#7fb894]">Privacy</span>
        </span>
      )}
    </div>
  );
}
