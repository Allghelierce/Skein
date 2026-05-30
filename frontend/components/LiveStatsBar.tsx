// frontend/components/LiveStatsBar.tsx
// Running telemetry: throughput, attacks caught, type breakdown, uptime. Makes
// the ML feel like a live system doing continuous work.
"use client";

import type { StateMessage } from "@/lib/types";
import type { MeshAnalysis } from "@/lib/mesh";
import { useSwarmStats } from "@/lib/stats";
import { HEX } from "@/lib/palette";

interface Props {
  state: StateMessage | null;
  analysis: MeshAnalysis;
}

export function LiveStatsBar({ state, analysis }: Props) {
  const stats = useSwarmStats(state, analysis);
  const uptimeColor = stats.uptimePct >= 90 ? HEX.green : HEX.red;

  return (
    <div className="flex items-center gap-5 overflow-x-auto border border-line bg-panel px-4 py-2.5">
      <span className="flex items-center gap-2 whitespace-nowrap">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: HEX.green }} />
        <span className="label-xs" style={{ color: HEX.green }}>
          detector online
        </span>
      </span>

      <Divider />
      <Stat
        label="flows scored"
        value={stats.flowsScored.toLocaleString("en-US")}
        sub={`${stats.perSec}/s`}
      />
      <Divider />
      <Stat
        label="attacks caught"
        value={stats.attacksCaught.toLocaleString("en-US")}
        color={stats.attacksCaught > 0 ? HEX.red : undefined}
      />
      <Divider />

      <div className="flex items-center gap-3 whitespace-nowrap">
        <TypePill label="DoS" n={stats.byType.DoS} />
        <TypePill label="PortScan" n={stats.byType.PortScan} />
        <TypePill label="BruteForce" n={stats.byType.BruteForce} />
      </div>

      <Divider />
      <Stat label="swarm uptime" value={`${stats.uptimePct}%`} color={uptimeColor} />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="flex flex-col leading-none whitespace-nowrap">
      <div className="flex items-baseline gap-1.5">
        <span className="text-base font-bold tabular-nums" style={color ? { color } : undefined}>
          {value}
        </span>
        {sub && <span className="mono text-[0.6rem] text-ink-dim">{sub}</span>}
      </div>
      <span className="mt-1 label-xs">{label}</span>
    </div>
  );
}

function TypePill({ label, n }: { label: string; n: number }) {
  const hot = n > 0;
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="text-sm font-bold tabular-nums"
        style={{ color: hot ? HEX.red : HEX.faint }}
      >
        {n}
      </span>
      <span className="label-xs" style={hot ? { color: HEX.red } : undefined}>
        {label}
      </span>
    </div>
  );
}

function Divider() {
  return <span className="h-7 w-px shrink-0 bg-line" />;
}
