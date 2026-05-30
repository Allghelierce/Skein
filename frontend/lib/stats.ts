// frontend/lib/stats.ts
// Running session totals so the dashboard feels like a system that's actually
// working: flows scored, throughput, attacks caught (by type), swarm uptime.
// Accumulates across ticks from the same state stream the rest of the UI reads.
"use client";

import { useEffect, useRef, useState } from "react";
import type { StateMessage } from "./types";
import type { MeshAnalysis } from "./mesh";

export interface SwarmStats {
  flowsScored: number; // cumulative link-scores this session
  perSec: number; // flows scored on the latest tick (~per second)
  attacksCaught: number; // cumulative malicious flows detected
  byType: { DoS: number; PortScan: number; BruteForce: number };
  uptimePct: number; // mean comms-to-base across the session
}

const ZERO: SwarmStats = {
  flowsScored: 0,
  perSec: 0,
  attacksCaught: 0,
  byType: { DoS: 0, PortScan: 0, BruteForce: 0 },
  uptimePct: 100,
};

export function useSwarmStats(state: StateMessage | null, analysis: MeshAnalysis): SwarmStats {
  const [stats, setStats] = useState<SwarmStats>(ZERO);
  const lastTick = useRef(-1);
  const prevAttacks = useRef<Set<string>>(new Set());
  const commsSum = useRef(0);
  const commsCount = useRef(0);

  useEffect(() => {
    if (!state) return;
    if (state.tick === lastTick.current) return; // one accumulation per tick
    lastTick.current = state.tick;

    const scored = state.links.length;
    const nowAttacks = new Set(
      state.links.filter((l) => l.prediction.attack_type).map((l) => l.id),
    );

    let caught = 0;
    const inc = { DoS: 0, PortScan: 0, BruteForce: 0 };
    for (const l of state.links) {
      if (l.prediction.attack_type && !prevAttacks.current.has(l.id)) {
        caught += 1;
        const t = l.prediction.label as keyof typeof inc;
        if (t in inc) inc[t] += 1;
      }
    }
    prevAttacks.current = nowAttacks;

    commsSum.current += analysis.commsPct;
    commsCount.current += 1;
    const uptimePct = Math.round(commsSum.current / commsCount.current);

    setStats((s) => ({
      flowsScored: s.flowsScored + scored,
      perSec: scored,
      attacksCaught: s.attacksCaught + caught,
      byType: {
        DoS: s.byType.DoS + inc.DoS,
        PortScan: s.byType.PortScan + inc.PortScan,
        BruteForce: s.byType.BruteForce + inc.BruteForce,
      },
      uptimePct,
    }));
  }, [state, analysis]);

  return stats;
}
