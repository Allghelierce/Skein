// frontend/components/EventFeed.tsx
"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { StateMessage, SwarmEvent } from "@/lib/types";
import { EVENT_COLOR } from "@/lib/palette";
import { HudFrame } from "@/components/Hud";

interface Props {
  state: StateMessage | null;
}

const KIND_LABEL: Record<SwarmEvent["kind"], string> = {
  detection: "DETECT",
  reroute: "REROUTE",
  recovery: "RESTORE",
  info: "SYS",
};

export function EventFeed({ state }: Props) {
  const events = state?.events ?? [];

  return (
    <HudFrame
      title="Event Feed"
      className="flex min-h-0 flex-1 flex-col"
      right={
        <span className="font-display text-[0.55rem] tracking-[0.18em] text-ink-faint">
          {String(events.length).padStart(2, "0")} LOGGED
        </span>
      }
    >
      <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3 pt-2.5">
        <AnimatePresence initial={false}>
          {events.length === 0 && (
            <p className="font-display text-[0.62rem] tracking-widest text-ink-faint">
              AWAITING TELEMETRY…
            </p>
          )}
          {events.map((e, i) => {
            const color = EVENT_COLOR[e.kind] ?? EVENT_COLOR.info;
            return (
              <motion.div
                key={`${e.t}-${e.kind}-${i}-${e.message.slice(0, 12)}`}
                layout
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="grid grid-cols-[auto_auto_1fr] items-start gap-2 border-l-2 bg-bg-soft px-2 py-1.5"
                style={{ borderColor: color }}
              >
                <span className="mt-px font-mono text-[0.58rem] tabular-nums text-ink-faint">
                  {e.t}
                </span>
                <span
                  className="px-1.5 font-display text-[0.5rem] font-bold tracking-[0.12em]"
                  style={{ color }}
                >
                  {KIND_LABEL[e.kind]}
                </span>
                <span className="text-[0.72rem] leading-snug text-ink">{e.message}</span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </HudFrame>
  );
}
