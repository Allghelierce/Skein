// frontend/lib/mock.ts
// A small, self-contained mesh simulator that lets the dashboard run with NO
// backend (MOCK mode). It mirrors what Task B's Python simulator does: nodes +
// links, per-tick benign traffic, attack injection on jam/hack, and REAL
// shortest-path rerouting around damaged links (BFS over the live topology).
//
// This is a demo fallback, not the ML brain — predictions here are synthetic
// stand-ins. In live mode the real backend + trained model drive everything.

import type {
  LinkFeatures,
  LinkStatus,
  NodeStatus,
  Prediction,
  StateMessage,
  SwarmEvent,
  SwarmLink,
  SwarmNode,
  ThreatLevel,
} from "./types";
import { computeReasons, type NormReason } from "./reasons";

// Deterministic-ish PRNG so the mock looks lively without Math.random surprises.
let seed = 1337;
function rnd(): number {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
function between(lo: number, hi: number): number {
  return lo + rnd() * (hi - lo);
}

// ── Topology: MUST mirror the Python backend (backend/mesh/graph.py) exactly so
//    MOCK mode and LIVE mode look identical. 13 drones — core D1 + inner ring of
//    4 + outer ring of 8 — wired by symmetric k-nearest-neighbour (min degree 4),
//    a dense redundant mesh that survives losing several nodes. ──
const NODE_COORDS: Record<string, [number, number]> = {
  D1: [0.5, 0.5], // core
  D2: [0.5, 0.28], // inner ring
  D3: [0.72, 0.5],
  D4: [0.5, 0.72],
  D5: [0.28, 0.5],
  D6: [0.5, 0.1], // outer ring
  D7: [0.78, 0.22],
  D8: [0.9, 0.5],
  D9: [0.78, 0.78],
  D10: [0.5, 0.9],
  D11: [0.22, 0.78],
  D12: [0.1, 0.5],
  D13: [0.22, 0.22],
};
const MIN_DEGREE = 4;

function buildTopology() {
  const ids = Object.keys(NODE_COORDS);
  const layout = ids.map((id) => ({ id, x: NODE_COORDS[id][0], y: NODE_COORDS[id][1] }));

  // Symmetric k-nearest: an edge exists if either endpoint counts the other among
  // its MIN_DEGREE nearest. Same rule as graph.py's _build_dense_edges.
  const edgeSet = new Set<string>();
  for (const a of ids) {
    const [ax, ay] = NODE_COORDS[a];
    const nearest = ids
      .filter((b) => b !== a)
      .sort((b, c) => {
        const db = (NODE_COORDS[b][0] - ax) ** 2 + (NODE_COORDS[b][1] - ay) ** 2;
        const dc = (NODE_COORDS[c][0] - ax) ** 2 + (NODE_COORDS[c][1] - ay) ** 2;
        return db - dc;
      })
      .slice(0, MIN_DEGREE);
    for (const b of nearest) edgeSet.add([a, b].sort().join("|"));
  }
  const edges: [string, string][] = [...edgeSet]
    .sort()
    .map((k) => k.split("|") as [string, string]);

  return { layout, edges };
}

const { layout: NODE_LAYOUT, edges: EDGES } = buildTopology();

export function linkId(a: string, b: string): string {
  return [a, b].sort().join("-");
}

function nowClock(tick: number): string {
  // Demo-friendly wall-ish clock derived from the tick (Date.now is avoided).
  const base = 10 * 3600 + 42 * 60; // 10:42:00
  const s = base + tick;
  const hh = Math.floor(s / 3600) % 24;
  const mm = Math.floor(s / 60) % 60;
  const ss = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(hh)}:${p(mm)}:${p(ss)}`;
}

type AttackKind = "DoS" | "PortScan";

interface LinkModel {
  id: string;
  source: string;
  target: string;
  status: LinkStatus;
  attackType: AttackKind | null; // why it's compromised, if at all
}

function benignPrediction(): Prediction {
  return { label: "BENIGN", attack_type: null, confidence: between(0.9, 0.995) };
}
function attackPrediction(kind: AttackKind): Prediction {
  return { label: kind, attack_type: kind, confidence: between(0.88, 0.985) };
}

// Plausible raw CIC flow values per class. Mirrors how the real CIC rows look
// (DoS floods, PortScan = many tiny fwd packets, etc.) so the scope reads true.
// These are stand-ins for MOCK mode; live mode streams the real scored rows.
function featuresFor(label: string): LinkFeatures {
  if (label === "DoS") {
    const pkts = between(9000, 38000);
    return {
      flow_duration: between(2e3, 4e4),
      total_fwd_packets: between(4000, 22000),
      total_bwd_packets: between(80, 900),
      flow_bytes_s: between(1.4e6, 7.5e6),
      flow_packets_s: pkts,
      flow_iat_mean: between(20, 140),
      fwd_pkt_len_mean: between(60, 240),
      bwd_pkt_len_mean: between(0, 60),
      pkt_len_mean: between(60, 220),
      avg_pkt_size: between(70, 230),
    };
  }
  if (label === "PortScan") {
    return {
      flow_duration: between(40, 4000),
      total_fwd_packets: between(1, 6),
      total_bwd_packets: between(0, 2),
      flow_bytes_s: between(200, 6000),
      flow_packets_s: between(1800, 9000),
      flow_iat_mean: between(2, 60),
      fwd_pkt_len_mean: between(0, 40),
      bwd_pkt_len_mean: between(0, 12),
      pkt_len_mean: between(0, 40),
      avg_pkt_size: between(0, 44),
    };
  }
  if (label === "BruteForce") {
    return {
      flow_duration: between(2e5, 5e6),
      total_fwd_packets: between(8, 40),
      total_bwd_packets: between(8, 40),
      flow_bytes_s: between(2e4, 1.6e5),
      flow_packets_s: between(280, 1500),
      flow_iat_mean: between(2e3, 4e4),
      fwd_pkt_len_mean: between(20, 120),
      bwd_pkt_len_mean: between(40, 220),
      pkt_len_mean: between(30, 160),
      avg_pkt_size: between(40, 180),
    };
  }
  // BENIGN: low, steady traffic
  return {
    flow_duration: between(1e4, 1.2e6),
    total_fwd_packets: between(4, 60),
    total_bwd_packets: between(4, 60),
    flow_bytes_s: between(1.5e3, 6e4),
    flow_packets_s: between(12, 260),
    flow_iat_mean: between(5e2, 6e4),
    fwd_pkt_len_mean: between(40, 320),
    bwd_pkt_len_mean: between(40, 480),
    pkt_len_mean: between(60, 420),
    avg_pkt_size: between(70, 460),
  };
}

export class MockEngine {
  private tick = 0;
  private nodeStatus = new Map<string, NodeStatus>();
  private links = new Map<string, LinkModel>();
  private adjacency = new Map<string, Set<string>>();
  private events: SwarmEvent[] = [];
  // Stable predictions per link so the DetectorPanel doesn't flicker every tick.
  private predictions = new Map<string, Prediction>();

  constructor() {
    this.reset(false);
  }

  // ── Public API used by useSwarm() ────────────────────────────────────────
  step(): StateMessage {
    this.tick += 1;

    // Refresh benign predictions on healthy links occasionally for live feel.
    for (const link of this.links.values()) {
      if (link.status === "healthy" || link.status === "rerouted") {
        if (this.tick % 2 === 0 || !this.predictions.has(link.id)) {
          this.predictions.set(link.id, benignPrediction());
        }
      }
    }
    return this.snapshot();
  }

  command(action: "jam" | "hack" | "reset" | "stealth", target: string | null): StateMessage {
    if (action === "reset") {
      this.reset(true);
      return this.snapshot();
    }
    if (action === "jam" && target) this.jam(target);
    if (action === "hack" && target) this.hack(target);
    this.recomputeReroutes();
    return this.snapshot();
  }

  // ── Internals ─────────────────────────────────────────────────────────────
  private reset(emit: boolean): void {
    this.nodeStatus.clear();
    this.links.clear();
    this.adjacency.clear();
    this.predictions.clear();

    for (const n of NODE_LAYOUT) {
      this.nodeStatus.set(n.id, "healthy");
      this.adjacency.set(n.id, new Set());
    }
    for (const [a, b] of EDGES) {
      const id = linkId(a, b);
      this.links.set(id, {
        id,
        source: a,
        target: b,
        status: "healthy",
        attackType: null,
      });
      this.adjacency.get(a)!.add(b);
      this.adjacency.get(b)!.add(a);
      this.predictions.set(id, benignPrediction());
    }
    if (emit) {
      this.events = [];
      this.pushEvent("recovery", "All links restored — swarm nominal.");
    } else {
      this.events = [];
      this.pushEvent("info", `Swarm online — ${NODE_LAYOUT.length} drones, mesh nominal.`);
    }
  }

  private jam(target: string): void {
    const link = this.links.get(target);
    if (!link) return;
    if (link.status === "jammed") return;
    link.status = "jammed";
    link.attackType = "DoS";
    this.predictions.set(link.id, attackPrediction("DoS"));
    const pred = this.predictions.get(link.id)!;
    this.pushEvent(
      "detection",
      `ATTACK on ${link.source}-${link.target} — RF Jamming / DoS (${pct(pred.confidence)}).`,
    );
  }

  private hack(target: string): void {
    if (!this.nodeStatus.has(target)) return;
    if (this.nodeStatus.get(target) === "attacked") return;
    this.nodeStatus.set(target, "attacked");
    // Incident links read as PortScan/recon coming off the compromised node.
    let first = true;
    for (const link of this.links.values()) {
      if (link.source === target || link.target === target) {
        link.status = "jammed";
        link.attackType = "PortScan";
        this.predictions.set(link.id, attackPrediction("PortScan"));
        if (first) {
          const pred = this.predictions.get(link.id)!;
          this.pushEvent(
            "detection",
            `Node ${target} COMPROMISED — PortScan/recon detected (${pct(pred.confidence)}).`,
          );
          first = false;
        }
      }
    }
    this.pushEvent("reroute", `Quarantining ${target} — isolating unit, traffic routes around it.`);
  }

  // Real self-healing: any traffic that would cross a jammed link gets a fresh
  // BFS path around the damage; the links on that path are marked "rerouted".
  private recomputeReroutes(): void {
    // Clear any prior reroute marks back to healthy first.
    for (const link of this.links.values()) {
      if (link.status === "rerouted") {
        link.status = "healthy";
        link.attackType = null;
      }
    }
    const dead = new Set(
      [...this.links.values()].filter((l) => l.status === "jammed").map((l) => l.id),
    );
    if (dead.size === 0) return;

    const reroutedLinks = new Set<string>();
    for (const link of this.links.values()) {
      if (link.status !== "jammed") continue;
      // A hacked node is intentionally quarantined — its own links aren't
      // rerouted (that would defeat the isolation); other traffic routes around.
      if (
        this.nodeStatus.get(link.source) === "attacked" ||
        this.nodeStatus.get(link.target) === "attacked"
      ) {
        continue;
      }
      const path = this.bfs(link.source, link.target, dead);
      if (!path) {
        this.pushEvent(
          "info",
          `No alternate path for ${link.source}-${link.target} — endpoints partitioned.`,
        );
        continue;
      }
      for (let i = 0; i < path.length - 1; i++) {
        const id = linkId(path[i], path[i + 1]);
        const l = this.links.get(id)!;
        if (l.status === "healthy") {
          l.status = "rerouted";
          reroutedLinks.add(id);
        }
      }
      this.pushEvent(
        "reroute",
        `Rerouting ${link.source}→${link.target} via ${path.join("→")}.`,
      );
    }
    if (reroutedLinks.size > 0) {
      // Mark relay nodes on rerouted paths as actively defending.
      for (const id of reroutedLinks) {
        const l = this.links.get(id)!;
        for (const end of [l.source, l.target]) {
          if (this.nodeStatus.get(end) === "healthy") {
            this.nodeStatus.set(end, "defending");
          }
        }
      }
    }
  }

  private bfs(src: string, dst: string, deadLinks: Set<string>): string[] | null {
    const queue: string[] = [src];
    const prev = new Map<string, string | null>([[src, null]]);
    while (queue.length) {
      const cur = queue.shift()!;
      if (cur === dst) break;
      for (const next of this.adjacency.get(cur) ?? []) {
        if (prev.has(next)) continue;
        if (deadLinks.has(linkId(cur, next))) continue; // can't cross damaged link
        if (this.nodeStatus.get(next) === "attacked" && next !== dst) continue; // avoid hacked relays
        prev.set(next, cur);
        queue.push(next);
      }
    }
    if (!prev.has(dst)) return null;
    const path: string[] = [];
    let node: string | null = dst;
    while (node) {
      path.unshift(node);
      node = prev.get(node) ?? null;
    }
    return path.length >= 2 ? path : null;
  }

  private threatLevel(): ThreatLevel {
    const active = [...this.links.values()].filter((l) => l.status === "jammed").length;
    if (active >= 3) return "CRITICAL";
    if (active >= 1) return "ELEVATED";
    return "NOMINAL";
  }

  private pushEvent(kind: SwarmEvent["kind"], message: string): void {
    this.events.unshift({ t: nowClock(this.tick), kind, message });
    if (this.events.length > 20) this.events.length = 20;
  }

  private snapshot(): StateMessage {
    const nodes: SwarmNode[] = NODE_LAYOUT.map((n) => ({
      id: n.id,
      x: n.x,
      y: n.y,
      status: this.nodeStatus.get(n.id) ?? "healthy",
      host: false, // MOCK mode: every drone is simulated in-browser
      beat_age: null,
    }));
    // ScoredLink rides an optional `reasons` field alongside the contract shape;
    // the real backend will add it to the contract soon, the UI reads it either way.
    const links: SwarmLink[] = [...this.links.values()].map((l) => {
      const prediction = this.predictions.get(l.id) ?? benignPrediction();
      const features = featuresFor(prediction.label);
      const reasons = prediction.attack_type
        ? computeReasons(features, prediction.label)
        : [];
      const scored: SwarmLink = {
        id: l.id,
        source: l.source,
        target: l.target,
        status: l.status,
        active: l.status === "healthy" ? rnd() > 0.45 : true,
        prediction,
        features,
        // mock uses display-shaped reasons; UI reads them loosely via getReasons()
        reasons: reasons as unknown as SwarmLink["reasons"],
      };
      return scored;
    });
    return {
      type: "state",
      tick: this.tick,
      threat_level: this.threatLevel(),
      nodes,
      links,
      events: [...this.events],
    };
  }
}

function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
}
