// frontend/components/BrandBar.tsx
// Slim top brand strip — a quieter echo of the boot screen's SKEIN wordmark.
// Replaces the old metric-heavy StatusBar; pure branding, no live data.
"use client";

import { HEX } from "@/lib/palette";

export function BrandBar() {
  return (
    <header className="flex items-center gap-3 border-b border-line bg-bg px-5 py-2">
      <Mark />
      <div className="leading-none">
        <div className="text-lg font-bold tracking-[0.34em] text-ink">SKEIN</div>
        <div className="mt-1 text-[0.55rem] uppercase tracking-[0.42em] text-ink-faint">
          mesh defense system
        </div>
      </div>
    </header>
  );
}

function Mark() {
  // minimal angular swarm glyph, matched to the boot/identity look
  return (
    <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden>
      <path d="M11 2 L19 7 V15 L11 20 L3 15 V7 Z" stroke={HEX.dim} strokeWidth="1.3" />
      <circle cx="11" cy="11" r="2.2" fill={HEX.ink} />
    </svg>
  );
}
