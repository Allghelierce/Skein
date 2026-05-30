// frontend/lib/mock.ts
// A small, self-contained mesh simulator that lets the dashboard run with NO
// backend (MOCK mode). It mirrors what Task B's Python simulator does: nodes +
// links, per-tick benign traffic, attack injection on jam/hack, and REAL
// shortest-path rerouting around damaged links (BFS over the live topology).
//
// This is a demo fallback, not the ML brain — predictions here are synthetic
// stand-ins. In live mode the real backend + trained model drive everything.

import type {
  LinkStatus,
  NodeStatus,
  Prediction,
  StateMessage,
  SwarmEvent,
  SwarmLink,
  SwarmNode,
  ThreatLevel,
} from "./types";

// Deterministic-ish PRNG so the mock looks lively without Math.random surprises.
let seed = 1337;
function rnd(): number {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
function between(lo: number, hi: number): number {
  return lo + rnd() * (hi - lo);
}

// ── Fixed topology: 7 drones, redundant mesh so reroutes always have a path ──
const NODE_LAYOUT: { id: string; x: number; y: number }[] = [
  { id: "D1", x: 0.16, y: 0.26 },
  { id: "D2", x: 0.5, y: 0.12 },
  { id: "D3", x: 0.84, y: 0.26 },
  { id: "D4", x: 0.2, y: 0.74 },
  { id: "D5", x: 0.5, y: 0.9 },
  { id: "D6", x: 0.8, y: 0.74 },
  { id: "D7", x: 0.5, y: 0.5 }, // central relay hub
];

const EDGES: [string, string][] = [
  ["D1", "D2"],
  ["D2", "D3"],
  ["D3", "D6"],
  ["D5", "D6"],
  ["D4", "D5"],
  ["D1", "D4"],
  ["D1", "D7"],
  ["D3", "D7"],
  ["D5", "D7"],
];

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

  command(action: "jam" | "hack" | "reset", target: string | null): StateMessage {
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
      this.pushEvent("info", "Swarm online — 7 drones, mesh nominal.");
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
    }));
    const links: SwarmLink[] = [...this.links.values()].map((l) => ({
      id: l.id,
      source: l.source,
      target: l.target,
      status: l.status,
      active: l.status === "healthy" ? rnd() > 0.45 : true,
      prediction: this.predictions.get(l.id) ?? benignPrediction(),
    }));
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
