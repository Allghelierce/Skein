// frontend/lib/audio.ts
<<<<<<< HEAD
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
=======
// Optional, mutable audio cues for the dashboard — cheap, high demo impact.
//   • a short bright blip when the detector flags a fresh attack
//   • a lower descending tone when a drone gets cut off (isolated)
//
// Synthesised with the WebAudio API (no asset files). Audio stays silent until
// the user flips it on — that click is also the gesture browsers require before
// sound can play, and it satisfies autoplay policy. Reads only state the UI
// already has; no contract change.
"use client";

import { useEffect, useRef } from "react";
import type { StateMessage } from "./types";

function ensureCtx(ref: { current: AudioContext | null }): AudioContext | null {
  if (typeof window === "undefined" || !window.AudioContext) return null;
  if (!ref.current) ref.current = new AudioContext();
  if (ref.current.state === "suspended") void ref.current.resume();
  return ref.current;
}

// One enveloped tone — quick attack, smooth decay, so there's no click.
function tone(ctx: AudioContext, freq: number, start: number, dur: number, peak: number): void {
  const t = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// detection: two quick rising blips
function blip(ctx: AudioContext | null): void {
  if (!ctx) return;
  tone(ctx, 880, 0, 0.09, 0.14);
  tone(ctx, 1320, 0.07, 0.1, 0.12);
}

// isolation: a single lower, descending tone (something was lost)
function lowTone(ctx: AudioContext | null): void {
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(320, t);
  osc.frequency.exponentialRampToValueAtTime(150, t + 0.34);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.38);
}

export function useAudioCues({
  state,
  isolatedCount,
  enabled,
}: {
  state: StateMessage | null;
  isolatedCount: number;
  enabled: boolean;
}): void {
  const ctxRef = useRef<AudioContext | null>(null);
  const lastDetect = useRef<string | null>(null);
  const lastIsolated = useRef<number>(0);

  // bright blip on a fresh detection (newest detection event changed)
  useEffect(() => {
    const ev = state?.events.find((e) => e.kind === "detection") ?? null;
    const sig = ev ? `${ev.t}|${ev.message}` : null;
    const prev = lastDetect.current;
    lastDetect.current = sig;
    if (!enabled || !sig || prev === null || sig === prev) return;
    blip(ensureCtx(ctxRef));
  }, [state?.events, enabled]);

  // low tone when the isolated count rises (a drone just got cut off)
  useEffect(() => {
    const prev = lastIsolated.current;
    lastIsolated.current = isolatedCount;
    if (!enabled || isolatedCount <= prev) return;
    lowTone(ensureCtx(ctxRef));
  }, [isolatedCount, enabled]);

  // release the audio context on unmount
  useEffect(() => {
    return () => {
      void ctxRef.current?.close();
      ctxRef.current = null;
    };
  }, []);
}
>>>>>>> interactivity
