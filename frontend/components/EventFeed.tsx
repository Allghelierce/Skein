// frontend/components/EventFeed.tsx
"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { StateMessage, SwarmEvent } from "@/lib/types";
import { EVENT_COLOR, HEX } from "@/lib/palette";
import { HudFrame } from "@/components/Hud";

interface Props {
  state: StateMessage | null;
}

const KIND_LABEL: Record<SwarmEvent["kind"], string> = {
  detection: "Detection",
  reroute: "Reroute",
  recovery: "Recovery",
  info: "System",
};

export function EventFeed({ state }: Props) {
  const events = state?.events ?? [];

  return (
    <HudFrame
      title="Activity"
      className="flex min-h-0 flex-1 flex-col"
      right={<span className="text-[0.68rem] text-ink-faint tabular-nums">{events.length}</span>}
    >
      <div className="scroll-thin flex min-h-0 flex-1 flex-col overflow-y-auto">
        <AnimatePresence initial={false}>
          {events.length === 0 && (
            <p className="px-4 py-3 text-xs text-ink-faint">Awaiting telemetry…</p>
          )}
          {events.map((e, i) => {
            const color = EVENT_COLOR[e.kind] ?? EVENT_COLOR.info;
            return (
              <motion.div
                key={`${e.t}-${e.kind}-${i}-${e.message.slice(0, 12)}`}
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
                    <span className="text-xs font-medium" style={{ color }}>
                      {KIND_LABEL[e.kind]}
                    </span>
                    <span className="mono text-[0.62rem] tabular-nums text-ink-faint">{e.t}</span>
                  </div>
                  <p className="mt-0.5 text-[0.78rem] leading-snug text-ink-dim">{e.message}</p>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </HudFrame>
  );
}
