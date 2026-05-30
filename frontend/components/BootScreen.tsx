// frontend/components/BootScreen.tsx
// Brief militaristic bring-up: big SKEIN wordmark, a fast terminal boot log,
// then it fades out. ~2.5s total. Pure presentation — no data, no blocking.
"use client";

import { useEffect, useState } from "react";
import { HEX } from "@/lib/palette";

const LINES = [
  "mesh defense kernel ............ online",
  "classic-ml detector (RandomForest) ... loaded",
  "CIC-IDS2017 feature pipeline ...... ready",
  "mesh topology ............ established",
  "threat thresholds ............ calibrated",
  "swarm ............ armed",
];

const LINE_MS = 185;
const HOLD_MS = 460;
const FADE_MS = 520;

export function BootScreen() {
  const [shown, setShown] = useState(0);
  const [fading, setFading] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    let i = 0;
    const tick = setInterval(() => {
      i += 1;
      setShown(i);
      if (i >= LINES.length) {
        clearInterval(tick);
        setTimeout(() => setFading(true), HOLD_MS);
        setTimeout(() => setGone(true), HOLD_MS + FADE_MS);
      }
    }, LINE_MS);
    return () => clearInterval(tick);
  }, []);

  if (gone) return null;

  const bootDur = `${(LINES.length * LINE_MS + HOLD_MS) / 1000}s`;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black ${fading ? "boot-out" : ""}`}
      style={{
        background:
          "radial-gradient(70% 55% at 50% 40%, rgba(46,226,122,0.05), transparent 70%), #000",
      }}
    >
      <div className="w-full max-w-xl px-8">
        <div className="boot-title text-center text-6xl font-bold tracking-[0.34em] text-ink sm:text-7xl">
          SKEIN
        </div>
        <div className="mt-2 text-center text-[0.62rem] uppercase tracking-[0.5em] text-ink-dim">
          mesh defense system
        </div>

        {/* scan bar */}
        <div className="mx-auto mt-7 h-px w-full overflow-hidden bg-line">
          <div
            className="boot-bar h-full"
            style={{ ["--boot-dur" as string]: bootDur, background: HEX.green, boxShadow: `0 0 8px ${HEX.green}` }}
          />
        </div>

        {/* boot log */}
        <div className="mono mt-5 space-y-1.5 text-[0.74rem]">
          {LINES.slice(0, shown).map((line, i) => (
            <div key={i} className="boot-line flex items-center gap-2">
              <span style={{ color: HEX.green }}>[ ok ]</span>
              <span className="text-ink-dim">{line}</span>
            </div>
          ))}
          {shown < LINES.length && (
            <div className="flex items-center gap-2">
              <span className="text-ink-faint">[ &middot;&middot; ]</span>
              <span
                className="inline-block h-3.5 w-2 animate-skein-pulse"
                style={{ background: HEX.green }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
