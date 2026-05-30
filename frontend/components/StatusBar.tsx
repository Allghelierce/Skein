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
  const level = threat === "NOMINAL" ? 1 : threat === "ELEVATED" ? 2 : 3;

  return (
    <header className="relative z-10 flex items-center justify-between gap-4 border-b border-line bg-panel px-5 py-2.5">
      {/* brand */}
      <div className="flex items-center gap-3">
        <span
          className="inline-block h-2.5 w-2.5 animate-skein-pulse"
          style={{ background: connected ? HEX.green : HEX.red }}
        />
        <span className="font-display text-base font-bold tracking-[0.42em] text-ink">
          SKEIN
        </span>
        <span className="hidden font-display text-[0.58rem] tracking-[0.3em] text-ink-faint sm:inline">
          SWARM&nbsp;DEFENSE&nbsp;//&nbsp;COMMAND
        </span>
      </div>

      {/* readouts */}
      <div className="flex items-stretch">
        <Readout label="Drones" value={state?.nodes.length ?? 0} />
        <Readout label="Links" value={state?.links.length ?? 0} />
        <Readout label="Hostiles" value={hostiles} accent={hostiles ? HEX.red : undefined} />

        {/* threat segmented gauge */}
        <div className="flex items-center gap-2.5 border-l border-line-soft pl-4">
          <div className="flex flex-col items-end leading-none">
            <span className="font-display text-sm font-bold tracking-wider" style={{ color }}>
              {threat}
            </span>
            <span className="mt-1 panel-title text-[0.52rem]">Threat</span>
          </div>
          <div className="flex h-7 items-end gap-0.5">
            {[1, 2, 3].map((s) => (
              <span
                key={s}
                className="w-1.5"
                style={{
                  height: `${s * 7 + 6}px`,
                  background: s <= level ? color : HEX.faint,
                  boxShadow: s <= level ? `0 0 7px ${color}` : "none",
                }}
              />
            ))}
          </div>
        </div>

        {/* live indicator */}
        <div className="flex items-center gap-2 border-l border-line-soft pl-4">
          <span
            className={`inline-block h-2 w-2 rounded-full ${connected ? "animate-skein-pulse" : ""}`}
            style={{ background: connected ? HEX.red : HEX.faint }}
          />
          <span
            className="font-display text-xs font-bold tracking-[0.22em]"
            style={{ color: connected ? HEX.red : HEX.dim }}
          >
            {connected ? "LIVE" : "OFFLINE"}
          </span>
          <span className="border border-line-soft px-1.5 py-0.5 font-display text-[0.55rem] tracking-[0.2em] text-ink-dim">
            {mode === "mock" ? "SIM" : "WS"}
          </span>
        </div>
      </div>
    </header>
  );
}

function Readout({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="hidden min-w-[64px] flex-col items-end border-l border-line-soft px-4 leading-none first:border-l-0 md:flex">
      <span
        className="font-display text-lg font-bold tabular-nums"
        style={accent ? { color: accent } : undefined}
      >
        {String(value).padStart(2, "0")}
      </span>
      <span className="mt-1 panel-title text-[0.52rem]">{label}</span>
    </div>
  );
}
