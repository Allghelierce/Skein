// frontend/components/CommsReadout.tsx
// The mission stakes, relocated from the old top ribbon into a tray-less readout
// pinned to the bottom-right of the map. Comms-to-base is the hero number; the
// verdict sits above it and the compromised / cut-off tally tucks underneath.
// No panel — it floats straight over the terrain, with a text shadow for legibility.
"use client";

import { motion } from "framer-motion";
import type { MeshAnalysis } from "@/lib/mesh";
import { HEX } from "@/lib/palette";

interface Props {
  analysis: MeshAnalysis;
}

const COPY: Record<MeshAnalysis["status"], { label: string; sub: string }> = {
  nominal: { label: "SWARM NOMINAL", sub: "all units linked to base" },
  secure: { label: "SWARM SECURE", sub: "rerouted around the damage — comms held" },
  partitioned: { label: "SWARM PARTITIONED", sub: "units cut off from base" },
};

const SHADOW = "0 1px 6px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,0.95)";

export function CommsReadout({ analysis }: Props) {
  const { status, commsPct, isolated, compromised } = analysis;
  const danger = status === "partitioned";
  const color = danger ? HEX.red : HEX.ink;
  const copy = COPY[status];

  return (
    <div
      className="pointer-events-none flex flex-col items-end text-right leading-none"
      style={{ textShadow: SHADOW }}
    >
      {/* verdict */}
      <motion.div
        key={status}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="flex items-center gap-2"
      >
        <span className="text-sm font-bold tracking-wide" style={{ color }}>
          {copy.label}
        </span>
        <span
          className={`h-2 w-2 rounded-full ${danger ? "animate-skein-pulse" : ""}`}
          style={{ background: color, boxShadow: `0 0 8px ${color}` }}
        />
      </motion.div>
      <div className="mt-1 label-xs normal-case" style={{ letterSpacing: "0.04em" }}>
        {copy.sub}
      </div>

      {/* comms to base — the hero number */}
      <div className="mt-3 label-xs">comms to base</div>
      <div className="mt-1.5 flex items-center gap-3">
        <div className="h-2 w-32 overflow-hidden rounded-full" style={{ background: HEX.line }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: color, boxShadow: `0 0 8px ${color}` }}
            animate={{ width: `${commsPct}%` }}
            transition={{ type: "spring", stiffness: 90, damping: 18 }}
          />
        </div>
        <span className="text-4xl font-bold tabular-nums" style={{ color }}>
          {commsPct}
          <span className="text-xl text-ink-dim">%</span>
        </span>
      </div>

      {/* casualties — tucked snugly under the gauge */}
      {(compromised.length > 0 || isolated.length > 0) && (
        <div className="mt-2 flex items-center gap-4 text-[0.62rem]">
          {compromised.length > 0 && (
            <Tally label="compromised" ids={compromised} />
          )}
          {isolated.length > 0 && <Tally label="cut off" ids={isolated} />}
        </div>
      )}
    </div>
  );
}

function Tally({ label, ids }: { label: string; ids: string[] }) {
  const shown = ids.slice(0, 3).join(" ");
  const more = ids.length > 3 ? ` +${ids.length - 3}` : "";
  return (
    <span className="flex items-center gap-1.5" style={{ color: HEX.red }}>
      <span className="text-sm font-bold tabular-nums">{ids.length}</span>
      <span className="flex flex-col items-start leading-tight">
        <span className="label-xs" style={{ color: HEX.red }}>
          {label}
        </span>
        <span className="mono text-[0.58rem]" style={{ color: HEX.dim }}>
          {shown}
          {more}
        </span>
      </span>
    </span>
  );
}
