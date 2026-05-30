// frontend/lib/risk.ts
// Per-node RISK SCORE derived purely from the swarm state the backend (or mock)
// already sends — no contract change, works the same live. The point: make
// danger visible BEFORE an attack fully lands. A drone glows by how attack-like
// its recent traffic trended, and the single most-threatened drone is flagged as
// the predicted next target.
//
// Two ingredients:
//   1. Local threat — the worst incident link. A jammed/attack-labelled link is
//      hot; a benign link contributes a little when the detector was unsure.
//   2. Contagion — a healthy drone sitting next to a hot zone is the likely next
//      hop, so it inherits a decayed share of its neighbours' threat.
// If the backend ever supplies a real per-node risk we can swap this out; until
// then it is honestly derived, not invented.

import type { StateMessage, SwarmLink } from "./types";

export interface RiskField {
  byNode: Map<string, number>; // node id -> 0..1 risk
  predicted: string | null; // highest-risk drone not yet attacked (next target)
}

const SPREAD = 0.55; // how much of a neighbour's threat bleeds one hop over
const PREDICT_FLOOR = 0.4; // below this, nothing is "predicted" — swarm is calm

// How threatening one link looks right now, 0..1.
function linkThreat(l: SwarmLink): number {
  if (l.status === "jammed" || l.status === "down") {
    return Math.max(0.85, l.prediction.confidence);
  }
  if (l.prediction.attack_type) return l.prediction.confidence;
  // benign: a low-confidence call leans slightly attack-like; scale it down so a
  // quiet swarm stays cool, not falsely amber.
  return Math.max(0, 1 - l.prediction.confidence) * 0.5;
}

export function computeRisk(state: StateMessage | null): RiskField {
  const byNode = new Map<string, number>();
  if (!state || state.nodes.length === 0) return { byNode, predicted: null };

  const attacked = new Set(state.nodes.filter((n) => n.status === "attacked").map((n) => n.id));

  // 1. local threat: each node's worst incident link
  const local = new Map<string, number>();
  const neighbours = new Map<string, string[]>();
  for (const n of state.nodes) {
    local.set(n.id, attacked.has(n.id) ? 1 : 0);
    neighbours.set(n.id, []);
  }
  for (const l of state.links) {
    const t = linkThreat(l);
    if (!attacked.has(l.source)) local.set(l.source, Math.max(local.get(l.source) ?? 0, t));
    if (!attacked.has(l.target)) local.set(l.target, Math.max(local.get(l.target) ?? 0, t));
    neighbours.get(l.source)?.push(l.target);
    neighbours.get(l.target)?.push(l.source);
  }

  // 2. contagion: one decayed hop from the hottest neighbour
  for (const n of state.nodes) {
    const base = local.get(n.id) ?? 0;
    let spread = 0;
    for (const nb of neighbours.get(n.id) ?? []) {
      spread = Math.max(spread, (local.get(nb) ?? 0) * SPREAD);
    }
    byNode.set(n.id, Math.min(1, Math.max(base, spread)));
  }

  // predicted next target: hottest drone that hasn't actually fallen yet
  let predicted: string | null = null;
  let best = PREDICT_FLOOR;
  for (const n of state.nodes) {
    if (attacked.has(n.id)) continue;
    const r = byNode.get(n.id) ?? 0;
    if (r > best) {
      best = r;
      predicted = n.id;
    }
  }

  return { byNode, predicted };
}
