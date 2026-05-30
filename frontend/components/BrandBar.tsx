// frontend/components/BrandBar.tsx
// Centered brand lockup that floats over the top of the map (no tray / bar), the
// same tray-less treatment as the bottom-right comms readout. A bigger, quieter
// echo of the boot wordmark.
"use client";

import { HEX } from "@/lib/palette";

const SHADOW = "0 1px 8px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,0.95)";

export function BrandBar() {
  return (
    <div
      className="pointer-events-none flex flex-col items-center text-center"
      style={{ textShadow: SHADOW }}
    >
      <div className="flex items-center gap-3">
        <Mark />
        {/* the trailing letter-spacing is balanced with matching left padding so
            the wordmark sits visually centred next to the mark */}
        <span
          className="text-3xl font-bold tracking-[0.34em] text-ink"
          style={{ paddingLeft: "0.34em" }}
        >
          SKEIN
        </span>
      </div>
      <div className="mt-0.5 text-[0.58rem] uppercase tracking-[0.5em] text-ink-faint">
        mesh defense system
      </div>
    </div>
  );
}

// one swallow silhouette (wings + body + streamer tails), centered ~ (50,20) in a 100x40 box
const SWALLOW = "M50 17 C37 7 19 9 5 19 C22 16 40 19 50 22 Z M50 17 C63 7 81 9 95 19 C78 16 60 19 50 22 Z M50 16 C52 16 52 21 50 26 C48 21 48 16 50 16 Z M49 22 C47 29 43 34 36 40 C41 33 46 28 49 24 Z M51 22 C53 29 57 34 64 40 C59 33 54 28 51 24 Z";

// unified "struck node" red — neon, more menacing than the app's standard hostile red
const ATTACK_RED = "#ff0a3c";

function Mark() {
  // swarm-under-attack mark: 3 swallows in a mesh triangle, one node struck red,
  // tilted and dropped out of formation so the linked edges sag toward it
  return (
    <svg
      width="48"
      height="34"
      viewBox="0 0 300 210"
      fill="none"
      aria-hidden
      style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.9))" }}
    >
      <defs>
        <filter id="skein-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* mesh links — edges to the struck node sag as it drops */}
      <g stroke={HEX.dim} strokeWidth="3.4" strokeLinecap="round" opacity="0.9">
        <line x1="150" y1="70" x2="70" y2="130" />
        <line x1="70" y1="130" x2="235" y2="155" />
        <line x1="235" y1="155" x2="150" y2="70" />
      </g>
      {/* top + left nodes */}
      <g fill={HEX.ink}>
        <path transform="translate(97.5 49) scale(1.05)" d={SWALLOW} />
        <path transform="translate(20 110)" d={SWALLOW} />
      </g>
      {/* struck node — neon red, tilted, dropped, with a menacing glow */}
      <path
        fill={ATTACK_RED}
        filter="url(#skein-glow)"
        transform="translate(185 135) rotate(35 50 20)"
        d={SWALLOW}
      />
    </svg>
  );
}
