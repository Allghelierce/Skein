// frontend/components/StatusBar.tsx
"use client";

import type { StateMessage } from "@/lib/types";
import { HEX, threatColor } from "@/lib/palette";

interface Props {
  state: StateMessage | null;
  connected: boolean;
  mode: "mock" | "live";
}

export function StatusBar({ state, connected, mode }: Props) {
  const threat = state?.threat_level ?? "NOMINAL";
  const color = threatColor(threat);
  const hostiles = state?.links.filter((l) => l.status === "jammed").length ?? 0;

  return (
    <header className="flex items-center justify-between gap-4 border-b border-line bg-bg px-5 py-2.5">
      {/* brand */}
      <div className="flex items-center gap-3">
        <Mark />
        <div className="leading-none">
          <div className="text-[0.95rem] font-bold tracking-[0.22em] text-ink">SKEIN</div>
          <div className="mt-1 label-xs">Swarm Defense</div>
        </div>
      </div>

      {/* metrics */}
      <div className="flex items-center gap-6">
        <Metric label="Drones" value={state?.nodes.length ?? 0} />
        <Metric label="Links" value={state?.links.length ?? 0} />
        <Metric label="Hostiles" value={hostiles} accent={hostiles ? HEX.red : undefined} />

        <div className="h-8 w-px bg-line" />

        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
          <div className="leading-none">
            <div className="text-sm font-semibold" style={{ color }}>
              {threat}
            </div>
            <div className="mt-1 label-xs">Threat level</div>
          </div>
        </div>

        <div className="h-8 w-px bg-line" />

        <div className="flex items-center gap-2">
          <span
            className={`h-1.5 w-1.5 rounded-full ${connected ? "animate-skein-pulse" : ""}`}
            style={{ background: connected ? HEX.red : HEX.faint }}
          />
          <span
            className="text-xs font-semibold tracking-wide"
            style={{ color: connected ? HEX.red : HEX.dim }}
          >
            {connected ? "LIVE" : "OFFLINE"}
          </span>
          <span className="rounded border border-line px-1.5 py-0.5 text-[0.6rem] text-ink-dim">
            {mode === "mock" ? "SIM" : "WS"}
          </span>
        </div>
      </div>
    </header>
  );
}

function Metric({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="hidden flex-col items-end leading-none md:flex">
      <span className="text-lg font-semibold tabular-nums" style={accent ? { color: accent } : undefined}>
        {value}
      </span>
      <span className="mt-1 label-xs">{label}</span>
    </div>
  );
}

function Mark() {
  // minimal angular swarm glyph
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
      <path d="M11 2 L19 7 V15 L11 20 L3 15 V7 Z" stroke={HEX.dim} strokeWidth="1.3" />
      <circle cx="11" cy="11" r="2.2" fill={HEX.ink} />
    </svg>
  );
}
