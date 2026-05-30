// frontend/lib/audio.ts
// Tiny Web Audio synth for demo cues — a short bright blip when an attack is
// detected, a low descending tone when a drone gets cut off. No assets, no
// libraries: just oscillators. Cheap, high-impact, and fully mutable.
//
// Starts MUTED on purpose: browsers block audio until a user gesture, so the
// judge clicks the speaker to opt in — that same click unlocks the AudioContext.

type Win = Window & { webkitAudioContext?: typeof AudioContext };

let ctx: AudioContext | null = null;
let muted = true;

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as Win).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

// One enveloped oscillator note, optionally pitch-sliding from→to over its life.
function note(from: number, to: number, dur: number, type: OscillatorType, peak: number): void {
  const c = ensureCtx();
  if (!c) return;
  const t0 = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

export const audio = {
  isMuted(): boolean {
    return muted;
  },
  // toggling unmute runs inside a click, so this is where the context unlocks
  setMuted(m: boolean): void {
    muted = m;
    if (!m) ensureCtx();
  },
  // detection: a quick rising blip
  detection(): void {
    if (muted) return;
    note(760, 1180, 0.12, "triangle", 0.16);
  },
  // isolation: a lower, falling tone — something just went dark
  isolation(): void {
    if (muted) return;
    note(340, 150, 0.5, "sine", 0.2);
  },
};
