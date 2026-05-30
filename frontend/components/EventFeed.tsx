// frontend/components/EventFeed.tsx
"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { StateMessage, SwarmEvent } from "@/lib/types";
import { EVENT_COLOR } from "@/lib/palette";

interface Props {
  state: StateMessage | null;
}

const KIND_LABEL: Record<SwarmEvent["kind"], string> = {
  detection: "DETECT",
  reroute: "REROUTE",
  recovery: "RECOVER",
  info: "INFO",
};

export function EventFeed({ state }: Props) {
  const events = state?.events ?? [];

  return (
    <section className="panel flex min-h-0 flex-1 flex-col p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="panel-title">Event Feed</span>
        <span className="text-[0.65rem] text-ink-faint">{events.length} logged</span>
      </div>

      <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
        <AnimatePresence initial={false}>
          {events.length === 0 && (
            <p className="text-xs text-ink-faint">Awaiting telemetry…</p>
          )}
          {events.map((e, i) => {
            const color = EVENT_COLOR[e.kind] ?? EVENT_COLOR.info;
            // newest-first; key on time+message+index for stable animation.
            return (
              <motion.div
                key={`${e.t}-${e.kind}-${i}-${e.message.slice(0, 12)}`}
                layout
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="flex items-start gap-2 rounded-md border border-border-soft bg-bg-soft px-2 py-1.5"
              >
                <span className="mt-0.5 font-mono text-[0.6rem] text-ink-faint tabular-nums">
                  {e.t}
                </span>
                <span
                  className="mt-0.5 rounded px-1.5 py-0.5 text-[0.55rem] font-bold tracking-wider"
                  style={{ color, border: `1px solid ${color}55`, background: `${color}11` }}
                >
                  {KIND_LABEL[e.kind]}
                </span>
                <span className="flex-1 text-xs leading-snug text-ink">
                  {e.message}
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </section>
  );
}
