// frontend/components/EventFeed.tsx
// Lila — the AI defense co-pilot's voice. Instead of a terse machine log, she narrates
// the battle in analyst-grade English: a prominent "current situation" headline
// plus an enriched, contextual feed. All rule-based from the live swarm state
// (see lib/narrate.ts) — deterministic, instant, no LLM, can't fail on stage.
"use client";

import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { StateMessage } from "@/lib/types";
import { analyzeMesh } from "@/lib/mesh";
import { narrate, type NarrationSeverity } from "@/lib/narrate";
import { HEX } from "@/lib/palette";
import { HudFrame } from "@/components/Hud";

interface Props {
  state: StateMessage | null;
}

const SEV_COLOR: Record<NarrationSeverity, string> = {
  info: HEX.dim,
  detect: HEX.amber,
  defend: HEX.green, // healing/defense uses the data-feed green per palette
  recover: HEX.green,
  critical: HEX.red,
};

export function EventFeed({ state }: Props) {
  const analysis = useMemo(() => analyzeMesh(state), [state]);
  const { headline, log } = useMemo(() => narrate(state, analysis), [state, analysis]);

  return (
    <HudFrame
      title="Lila"
      className="flex min-h-0 flex-1 flex-col"
      right={<span className="text-[0.68rem] text-ink-faint tabular-nums">{log.length}</span>}
    >
      {/* current-situation headline */}
      {headline && (
        <motion.div
          key={headline.text}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="border-b px-4 py-2.5"
          style={{
            borderColor: HEX.line,
            background:
              headline.severity === "critical"
                ? "rgba(255,59,92,0.07)"
                : "rgba(46,226,122,0.05)",
          }}
        >
          <div
            className="label-xs mb-1 flex items-center gap-1.5"
            style={{ color: SEV_COLOR[headline.severity] }}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                headline.severity === "critical" ? "animate-skein-pulse" : ""
              }`}
              style={{ background: SEV_COLOR[headline.severity] }}
            />
            {headline.tag}
          </div>
          <p className="text-[0.82rem] font-medium leading-snug text-ink">{headline.text}</p>
        </motion.div>
      )}

      {/* narrated log */}
      <div className="scroll-thin flex min-h-0 flex-1 flex-col overflow-y-auto">
        <AnimatePresence initial={false}>
          {log.length === 0 && (
            <p className="px-4 py-3 text-xs text-ink-faint">Awaiting telemetry…</p>
          )}
          {log.map((line) => {
            const color = SEV_COLOR[line.severity];
            return (
              <motion.div
                key={line.id}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex items-start gap-3 border-b border-line-soft px-4 py-2.5 last:border-b-0"
              >
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: color }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="label-xs font-semibold" style={{ color }}>
                      {line.tag}
                    </span>
                    <span className="mono text-[0.62rem] tabular-nums text-ink-faint">
                      {line.t}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[0.78rem] leading-snug text-ink-dim">{line.text}</p>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </HudFrame>
  );
}
