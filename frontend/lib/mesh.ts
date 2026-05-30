// frontend/lib/mesh.ts
// Live mesh connectivity analysis for the dashboard's "comms" gauge + isolation.
//
// Model: a resilient mesh has NO single base. Comms strength = the share of
// surviving drones that are still connected to one another in the largest intact
// cluster. Jamming a link reroutes (comms hold); quarantining a drone removes it
// but the rest stay linked; only when a drone's whole neighbourhood is gone does
// it fall out of the cluster (isolated). This is what makes losing the core drone
// a survivable event instead of a total blackout.
//
// NOTE: nodes with status "attacked"/"isolated"/"down" are treated as off-mesh.
import type { StateMessage, SwarmNode } from "./types";

export interface MeshAnalysis {
  hubId: string | null; // largest cluster's anchor (highest-degree survivor) — display only
  total: number;
  commsPct: number; // 0..100, share of drones in the largest connected cluster
  reachable: Set<string>; // drones in that largest cluster
  isolated: string[]; // surviving drones cut off from the main cluster (collateral)
  compromised: string[];
  status: "nominal" | "degraded" | "critical";
}

export function analyzeMesh(state: StateMessage | null): MeshAnalysis {
  if (!state || state.nodes.length === 0) {
    return {
      hubId: null,
      total: 0,
      commsPct: 100,
      reachable: new Set(),
      isolated: [],
      compromised: [],
      status: "nominal",
    };
  }

  const nodes = state.nodes;
  const compromisedSet = new Set(
    nodes.filter((n) => n.status === "attacked" || n.status === "down").map((n) => n.id),
  );
  const alive = nodes.filter((n) => !compromisedSet.has(n.id));

  // Adjacency from links that can still carry traffic (healthy/rerouted),
  // restricted to surviving drones.
  const adj = new Map<string, string[]>();
  for (const n of alive) adj.set(n.id, []);
  for (const l of state.links) {
    if (l.status === "down" || l.status === "jammed") continue;
    const a = adj.get(l.source);
    const b = adj.get(l.target);
    if (a && adj.has(l.target)) a.push(l.target);
    if (b && adj.has(l.source)) b.push(l.source);
  }

  // Find every connected component among surviving drones; the swarm's comms are
  // carried by the LARGEST one. No single node's loss can zero this out.
  const seen = new Set<string>();
  let largest = new Set<string>();
  for (const n of alive) {
    if (seen.has(n.id)) continue;
    const comp = new Set<string>();
    const queue = [n.id];
    seen.add(n.id);
    comp.add(n.id);
    while (queue.length) {
      const cur = queue.shift()!;
      for (const nb of adj.get(cur) || []) {
        if (seen.has(nb)) continue;
        seen.add(nb);
        comp.add(nb);
        queue.push(nb);
      }
    }
    if (comp.size > largest.size) largest = comp;
  }

  const reachable = largest;
  // Anchor = highest-degree drone inside the main cluster (display label only).
  let hubId: string | null = null;
  let bestDeg = -1;
  for (const id of reachable) {
    const deg = (adj.get(id) || []).length;
    if (deg > bestDeg) {
      bestDeg = deg;
      hubId = id;
    }
  }

  // Surviving drones that aren't in the main cluster are isolated collateral.
  const isolated = alive.filter((n) => !reachable.has(n.id)).map((n) => n.id);

  // Comms % = surviving drones still linked together, over the whole swarm.
  const commsPct = Math.round((reachable.size / nodes.length) * 100);

  const status: MeshAnalysis["status"] =
    isolated.length > 2 || commsPct < 50
      ? "critical"
      : isolated.length > 0 || compromisedSet.size > 0
        ? "degraded"
        : "nominal";

  return {
    hubId,
    total: nodes.length,
    commsPct,
    reachable,
    isolated,
    compromised: [...compromisedSet],
    status,
  };
}
