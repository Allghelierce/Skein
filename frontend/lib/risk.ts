// frontend/lib/risk.ts
// Per-drone risk score, derived PURELY from the swarm state the backend (or
// mock) already sends — no contract change. Answers "how attack-like is this
// drone's neighbourhood right now, and is it likely the next target?" so danger
// can glow on the map BEFORE an attack fully lands.
//
// If the backend ever supplies a real per-node risk it can override this; until
// then the frontend derives it from incident-link verdict confidences:
//   • a link the detector calls an attack contributes its confidence (strong)
//   • a benign link contributes only the detector's residual doubt (tiny)
//   • risk spreads ONE hop, decayed — a healthy drone next to a hot link lights
//     up as the predicted next target.

import type { StateMessage } from "./types";

const ATTACK_FLOOR = 0.55; // an attack link is never "low" risk
const SPREAD_DECAY = 0.55; // a neighbour inherits this fraction of the danger
const NEIGHBOUR_FLOOR = 0.25; // only meaningful danger spreads (skip benign noise)

export type RiskMap = Map<string, number>;

export function computeRisk(state: StateMessage | null): RiskMap {
  const risk: RiskMap = new Map();
  if (!state || state.nodes.length === 0) return risk;
  for (const n of state.nodes) risk.set(n.id, 0);

  // adjacency over the full topology (danger travels along any link)
  const adj = new Map<string, string[]>();
  for (const n of state.nodes) adj.set(n.id, []);

  // own risk: the worst incident link decides a drone's baseline heat
  const own = new Map<string, number>();
  for (const n of state.nodes) own.set(n.id, 0);

  for (const l of state.links) {
    adj.get(l.source)?.push(l.target);
    adj.get(l.target)?.push(l.source);

    const attack = !!l.prediction.attack_type;
    const c = clamp01(l.prediction.confidence);
    // attack links lean on their confidence; benign links only leak their doubt
    const contrib = attack ? Math.max(ATTACK_FLOOR, c) : clamp01(1 - c) * 0.4;

    own.set(l.source, Math.max(own.get(l.source) ?? 0, contrib));
    own.set(l.target, Math.max(own.get(l.target) ?? 0, contrib));
  }

  // spread danger one hop, decayed — the "predicted next target" effect
  for (const n of state.nodes) {
    let best = own.get(n.id) ?? 0;
    for (const nb of adj.get(n.id) ?? []) {
      const o = own.get(nb) ?? 0;
      if (o >= NEIGHBOUR_FLOOR) best = Math.max(best, o * SPREAD_DECAY);
    }
    risk.set(n.id, clamp01(best));
  }

  return risk;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
