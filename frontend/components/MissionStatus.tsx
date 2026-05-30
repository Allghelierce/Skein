// frontend/components/MissionStatus.tsx
// The stakes. A slim strip that turns "a link went red" into "is the mission
// alive?" — real mesh connectivity to base, who's cut off, survive vs partition.
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

export function MissionStatus({ analysis }: Props) {
  const { status, commsPct, isolated, compromised } = analysis;
  const danger = status === "partitioned";
  const color = danger ? HEX.red : HEX.ink;
  const copy = COPY[status];

  return (
    <div
      className="flex items-center justify-between gap-4 border-b px-5 py-2"
      style={{
        borderColor: HEX.line,
        background: danger ? "rgba(255,59,92,0.06)" : "transparent",
      }}
    >
      {/* verdict */}
      <div className="flex items-center gap-3">
        <span
          className={`h-2.5 w-2.5 rounded-full ${danger ? "animate-skein-pulse" : ""}`}
          style={{ background: color, boxShadow: `0 0 8px ${color}` }}
        />
        <motion.div
          key={status}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25 }}
          className="leading-none"
        >
          <div className="text-sm font-bold tracking-wide" style={{ color }}>
            {copy.label}
          </div>
          <div className="mt-1 label-xs normal-case" style={{ letterSpacing: "0.04em" }}>
            {copy.sub}
          </div>
        </motion.div>
      </div>

      {/* comms gauge + casualties */}
      <div className="flex items-center gap-6">
        {compromised.length > 0 && (
          <Tally label="compromised" ids={compromised} color={HEX.red} />
        )}
        {isolated.length > 0 && <Tally label="cut off" ids={isolated} color={HEX.red} />}

        <div className="flex items-center gap-3">
          <span className="label-xs">comms to base</span>
          <div className="h-1.5 w-40 overflow-hidden rounded-full" style={{ background: HEX.line }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: color, boxShadow: `0 0 8px ${color}` }}
              animate={{ width: `${commsPct}%` }}
              transition={{ type: "spring", stiffness: 90, damping: 18 }}
            />
          </div>
          <span
            className="w-12 text-right text-lg font-bold tabular-nums"
            style={{ color }}
          >
            {commsPct}%
          </span>
        </div>
      </div>
    </div>
  );
}

function Tally({ label, ids, color }: { label: string; ids: string[]; color: string }) {
  const shown = ids.slice(0, 4).join(" ");
  const more = ids.length > 4 ? ` +${ids.length - 4}` : "";
  return (
    <div className="flex items-center gap-2 leading-none">
      <span className="text-sm font-bold tabular-nums" style={{ color }}>
        {ids.length}
      </span>
      <div className="leading-none">
        <div className="label-xs" style={{ color }}>
          {label}
        </div>
        <div className="mono mt-0.5 text-[0.6rem]" style={{ color: HEX.dim }}>
          {shown}
          {more}
        </div>
      </div>
    </div>
  );
}
