// frontend/components/BootScreen.tsx
// Brief militaristic bring-up: big SKEIN wordmark, a fast init log, then it fades.
// The log is NOT theater — each line states a real fact about the system (the
// trained model's own metrics from the held-out evaluation, the dataset, the
// classes, the mesh), so the bring-up reads as a genuine systems check.
"use client";

import { useEffect, useState } from "react";
import { HEX } from "@/lib/palette";
import { MODEL_REPORT as R } from "@/lib/modelReport";

// key / value init lines — values are real (from backend/ml/report.py), not props.
const LINES: { k: string; v: string }[] = [
  {
    k: "detector",
    v: `${R.best_model} · ${(R.accuracy * 100).toFixed(1)}% acc · ${R.macro_f1.toFixed(2)} macro-F1`,
  },
  { k: "dataset", v: `CIC-IDS-2017 · ${R.n_test.toLocaleString("en-US")} held-out flows` },
  { k: "classes", v: R.labels.join(" · ") },
  { k: "bake-off", v: `${R.comparison.length} classifiers benchmarked · ${R.best_model} won` },
  { k: "mesh", v: "13 drones · 28 links · dense k-NN topology" },
  { k: "transport", v: "websocket · live swarm state @ 1 Hz" },
];

const LINE_MS = 185;
const HOLD_MS = 460;
const FADE_MS = 520;

// fast character-randomization reveal: every slot flickers through random glyphs
// each frame and locks into its real letter left-to-right, chased by a bright
// green scan front. ~0.45s, fixed-width cells so it doesn't jitter.
const DECODE_GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&/<>*+=!?";

type Slot = { ch: string; locked: boolean; front: boolean };

function maskSlots(text: string): Slot[] {
  // deterministic first frame (server === client → no hydration mismatch); the
  // random churn only begins in the effect.
  return text.split("").map((c, i) => ({
    ch: c === " " ? " " : DECODE_GLYPHS[(i * 7) % DECODE_GLYPHS.length],
    locked: false,
    front: false,
  }));
}

function DecodeText({ text, durationMs = 450 }: { text: string; durationMs?: number }) {
  const [slots, setSlots] = useState<Slot[]>(() => maskSlots(text));
  const [done, setDone] = useState(false);
  const len = text.length;

  useEffect(() => {
    const solved = () => text.split("").map((ch) => ({ ch, locked: true, front: false }));
    let raf = 0;
    let start = 0;
    const rnd = () => DECODE_GLYPHS[Math.floor(Math.random() * DECODE_GLYPHS.length)];
    const step = (now: number) => {
      if (!start) start = now;
      const t = Math.min(1, (now - start) / durationMs);
      setSlots(
        text.split("").map((ch, i) => {
          if (ch === " ") return { ch: " ", locked: true, front: false };
          const lockFrac = (i + 0.85) / len; // staggered left-to-right
          const locked = t >= lockFrac;
          const front = !locked && t >= lockFrac - 0.16; // wave front, about to lock
          return { ch: locked ? ch : rnd(), locked, front };
        }),
      );
      if (t < 1) raf = requestAnimationFrame(step);
      else {
        setSlots(solved());
        setDone(true);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [text, durationMs, len]);

  // once settled, render the wordmark as plain text so it gets natural kerning —
  // the fixed-width cells (needed to stop jitter during the churn) otherwise leave
  // narrow letters like "I" with oversized gaps to their neighbours.
  if (done) return <>{text}</>;

  return (
    <>
      {slots.map((s, i) =>
        s.ch === " " ? (
          " "
        ) : (
          <span
            key={i}
            className="inline-block text-center"
            style={{
              width: "0.72em",
              color: s.locked ? HEX.ink : s.front ? HEX.green : "#54545e",
              textShadow: s.front ? `0 0 16px ${HEX.green}, 0 0 5px ${HEX.green}` : undefined,
            }}
          >
            {s.ch}
          </span>
        ),
      )}
    </>
  );
}

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
        <div className="text-center text-6xl font-bold tracking-[0.34em] text-ink tabular-nums sm:text-7xl">
          <DecodeText text="SKEIN" />
        </div>
        <div className="mt-2 text-center text-[0.62rem] uppercase tracking-[0.5em] text-ink-dim">
          mesh defense system
        </div>

        {/* loading bar — green fills the track left-to-right over the boot */}
        <div
          className="mx-auto mt-7 h-[3px] w-full overflow-hidden rounded-full"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          <div
            className="boot-bar h-full rounded-full"
            style={{
              ["--boot-dur" as string]: bootDur,
              background: `linear-gradient(90deg, ${HEX.green}80, ${HEX.green})`,
              boxShadow: `0 0 10px ${HEX.green}`,
            }}
          />
        </div>

        {/* init log — real system facts, key/value */}
        <div className="mono mt-5 space-y-1.5 text-[0.74rem]">
          {LINES.slice(0, shown).map((line, i) => (
            <div key={i} className="boot-line flex items-baseline gap-2">
              <span style={{ color: HEX.green }}>›</span>
              <span className="w-[5.5rem] shrink-0 text-ink-faint">{line.k}</span>
              <span className="text-ink-dim">{line.v}</span>
            </div>
          ))}
          {shown < LINES.length && (
            <div className="flex items-center gap-2">
              <span style={{ color: HEX.green }}>›</span>
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
