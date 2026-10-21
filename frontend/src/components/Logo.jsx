import React from 'react';

// Camo Cash brand: concentric-ring mark + wordmark.
export default function Logo({ size = 30, withWord = true, light = false }) {
  return (
    <div className="flex items-center gap-2.5 group" data-testid="camocash-logo">
      <img
        src={light ? '/brand/camocash-mark-white.png?v=1' : '/brand/camocash-mark-black.png?v=1'}
        alt="Camo Cash"
        style={{ height: size, width: size }}
        className="shrink-0 object-contain transition-transform duration-500 group-hover:rotate-[-25deg]"
        draggable="false"
      />
      {withWord && (
        <span className={`cc-display text-[21px] font-bold tracking-[-0.04em] ${light ? 'text-white' : 'text-[#08090c]'}`}>
          Camo<span className="font-medium"> Cash</span>
        </span>
      )}
    </div>
  );
}
