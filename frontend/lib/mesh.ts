// frontend/lib/mesh.ts
// Mission-status analysis computed purely from the swarm state the backend (or
// mock) already sends — so there's NO contract change and it works the same in
// live mode. Answers the stakes questions: can the swarm still reach base, who
// got cut off, did it survive?
//
// Model: the highest-degree drone is the relay "base". A drone has comms if a
// path of intact (non-jammed) links reaches base WITHOUT routing through a
// compromised (hacked) node — a hacked relay can't be trusted. Jamming one link
// usually reroutes (comms hold); hacking the relay partitions the swarm. The
// magnitude falls out of the graph, so hack is automatically worse than jam.

import type { StateMessage } from "./types";

export type MeshStatus = "nominal" | "secure" | "partitioned";

export interface MeshAnalysis {
  hubId: string | null;
  total: number;
  commsPct: number; // 0..100, share of drones still reaching base
  reachable: Set<string>;
  isolated: string[]; // healthy drones cut off from base (collateral)
  compromised: string[]; // hacked drones
  status: MeshStatus;
}

export function analyzeMesh(state: StateMessage | null): MeshAnalysis {
  const empty: MeshAnalysis = {
    hubId: null,
    total: 0,
    commsPct: 100,
    reachable: new Set(),
    isolated: [],
    compromised: [],
    status: "nominal",
  };
  if (!state || state.nodes.length === 0) return empty;

  const { nodes, links } = state;

  // degree over the full topology (stable) + adjacency over passable links only
  const degree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of nodes) {
    degree.set(n.id, 0);
    adj.set(n.id, []);
  }
  for (const l of links) {
    degree.set(l.source, (degree.get(l.source) ?? 0) + 1);
    degree.set(l.target, (degree.get(l.target) ?? 0) + 1);
    if (l.status === "jammed" || l.status === "down") continue; // damaged: impassable
    adj.get(l.source)?.push(l.target);
    adj.get(l.target)?.push(l.source);
  }

  // base = highest-degree drone (the relay hub)
  let hubId = nodes[0].id;
  for (const n of nodes) {
    if ((degree.get(n.id) ?? 0) > (degree.get(hubId) ?? 0)) hubId = n.id;
  }

  const compromisedSet = new Set(nodes.filter((n) => n.status === "attacked").map((n) => n.id));

  // BFS from base, never entering a compromised node
  const reachable = new Set<string>();
  if (!compromisedSet.has(hubId)) {
    const queue = [hubId];
    reachable.add(hubId);
    while (queue.length) {
      const cur = queue.shift() as string;
      for (const nb of adj.get(cur) ?? []) {
        if (reachable.has(nb) || compromisedSet.has(nb)) continue;
        reachable.add(nb);
        queue.push(nb);
      }
    }
  }

  const isolated = nodes
    .filter((n) => !reachable.has(n.id) && !compromisedSet.has(n.id))
    .map((n) => n.id);
  const compromised = nodes.filter((n) => compromisedSet.has(n.id)).map((n) => n.id);
  const commsPct = Math.round((reachable.size / nodes.length) * 100);

  const anyAttack = compromised.length > 0 || links.some((l) => l.status === "jammed");
  const status: MeshStatus =
    isolated.length > 0 || compromisedSet.has(hubId)
      ? "partitioned"
      : anyAttack
        ? "secure"
        : "nominal";

  return { hubId, total: nodes.length, commsPct, reachable, isolated, compromised, status };
}
