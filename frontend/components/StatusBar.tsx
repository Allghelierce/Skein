// frontend/components/StatusBar.tsx
"use client";

import type { StateMessage } from "@/lib/types";
import { threatColor } from "@/lib/palette";

interface Props {
  state: StateMessage | null;
  connected: boolean;
  mode: "mock" | "live";
}

export function StatusBar({ state, connected, mode }: Props) {
  const threat = state?.threat_level ?? "NOMINAL";
  const color = threatColor(threat);
  const activeAttacks =
    state?.links.filter((l) => l.status === "jammed").length ?? 0;

  return (
    <header className="relative z-10 flex items-center justify-between gap-4 px-5 py-3 panel rounded-none border-x-0 border-t-0">
      <div className="flex items-center gap-3">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full animate-skein-pulse"
          style={{ background: connected ? "#22c55e" : "#ef4444" }}
        />
        <span className="text-sm font-bold tracking-[0.32em] text-ink">
          SKEIN
        </span>
        <span className="hidden text-[0.7rem] text-ink-faint sm:inline">
          SWARM DEFENSE · COMMAND CENTER
        </span>
      </div>

      <div className="flex items-center gap-5">
        <Stat label="DRONES" value={String(state?.nodes.length ?? 0)} />
        <Stat label="LINKS" value={String(state?.links.length ?? 0)} />
        <Stat
          label="ACTIVE THREATS"
          value={String(activeAttacks)}
          accent={activeAttacks > 0 ? "#ef4444" : undefined}
        />

        <div className="flex items-center gap-2 rounded-md border border-border px-3 py-1">
          <span className="panel-title">THREAT</span>
          <span
            className="text-sm font-bold tracking-wider"
            style={{ color }}
          >
            {threat}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${connected ? "animate-skein-pulse" : ""}`}
            style={{ background: connected ? "#ef4444" : "#4a5d74" }}
          />
          <span
            className="text-xs font-bold tracking-[0.2em]"
            style={{ color: connected ? "#ef4444" : "#7e93ab" }}
          >
            {connected ? "LIVE" : "OFFLINE"}
          </span>
          <span className="rounded border border-border px-1.5 py-0.5 text-[0.6rem] tracking-widest text-ink-dim">
            {mode === "mock" ? "MOCK" : "WS"}
          </span>
        </div>
      </div>
    </header>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="hidden flex-col items-end leading-none md:flex">
      <span className="text-sm font-bold" style={accent ? { color: accent } : undefined}>
        {value}
      </span>
      <span className="panel-title">{label}</span>
    </div>
  );
}
