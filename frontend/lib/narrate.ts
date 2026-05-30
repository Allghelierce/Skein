// frontend/lib/narrate.ts
// Turns the backend's terse event log + live swarm state into analyst-grade
// narration — the "AI defense co-pilot" voice. Pure frontend, no contract
// change: it reads SwarmEvent + StateMessage + MeshAnalysis the dashboard
// already has, and rewrites each event into a fuller, contextual sentence.
//
// Rule-based on purpose (no LLM): deterministic, instant, can't fail live, and
// still reads like a human analyst because the templates weave in real numbers
// (attack type, confidence, reroute path, comms %, threat level, casualties).

import type { StateMessage, SwarmEvent } from "./types";
import type { MeshAnalysis } from "./mesh";

export type NarrationSeverity = "info" | "detect" | "defend" | "recover" | "critical";

export interface NarrationLine {
  id: string;
  t: string;
  severity: NarrationSeverity;
  tag: string; // short prefix, e.g. "THREAT", "DEFENSE"
  text: string; // the rich analyst sentence
}

export interface Narration {
  headline: NarrationLine | null; // the current situation, always the latest meaningful beat
  log: NarrationLine[]; // newest-first, enriched
}

// ── small helpers ──────────────────────────────────────────────────────────
function pick(seed: string, arr: string[]): string {
  // Deterministic choice from a string seed so phrasing varies per event but is
  // stable across re-renders (no flicker, no Math.random).
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return arr[h % arr.length];
}

function firstMatch(s: string, re: RegExp): string | null {
  const m = s.match(re);
  return m ? m[1] : null;
}

const ATTACK_NAME: Record<string, string> = {
  DoS: "a denial-of-service flood",
  PortScan: "reconnaissance port-scanning",
  BruteForce: "a credential brute-force attempt",
  stealth: "a low-and-slow stealth intrusion",
};

function attackPhrase(raw: string): string {
  const key = Object.keys(ATTACK_NAME).find((k) => raw.includes(k));
  return key ? ATTACK_NAME[key] : "anomalous traffic";
}

// ── per-event enrichment ────────────────────────────────────────────────────
function enrich(
  e: SwarmEvent,
  idx: number,
  state: StateMessage,
  analysis: MeshAnalysis,
): NarrationLine {
  const id = `${e.t}-${e.kind}-${idx}`;
  const comms = analysis.commsPct;
  const msg = e.message;

  // DETECTION — operator action, ML flag, compromise, isolation.
  if (e.kind === "detection") {
    // Drone compromised / quarantined
    const compromised = firstMatch(msg, /Drone (\w+) COMPROMISED/);
    if (compromised) {
      const intact = analysis.reachable.size;
      return {
        id, t: e.t, severity: "critical", tag: "BREACH",
        text: pick(id, [
          `Node ${compromised} is broadcasting hostile traffic — the detector cut it from the trusted mesh and the swarm is re-forming around it. ${intact} drones still linked, comms ${comms}%.`,
          `Drone ${compromised} compromised. Quarantine engaged: its links are severed and routing is recomputing alternate paths. Network integrity holding at ${comms}%.`,
          `Hostile takeover on ${compromised} detected and contained — the node is isolated from command and traffic is being rerouted through neighbouring drones (${comms}% comms).`,
        ]),
      };
    }
    // Drone isolated (collateral)
    const isolated = firstMatch(msg, /Drone (\w+) ISOLATED/);
    if (isolated) {
      return {
        id, t: e.t, severity: "critical", tag: "CUT OFF",
        text: pick(id, [
          `Drone ${isolated} has lost every route back to the swarm — no surviving neighbour to relay through. It is dark until a link is restored.`,
          `${isolated} is stranded: all of its neighbours are down, so there is no path home. Flagged as isolated, comms now ${comms}%.`,
        ]),
      };
    }
    // ML attack on a link (the headline ML moment)
    const onLink = firstMatch(msg, /ATTACK on ([\w-]+)/);
    if (onLink) {
      const conf = firstMatch(msg, /\((\d+)%/);
      const kind = attackPhrase(msg);
      return {
        id, t: e.t, severity: "detect", tag: "THREAT",
        text: pick(id, [
          `Classifier flagged ${kind} on link ${onLink}${conf ? ` at ${conf}% confidence` : ""} — traffic on that hop no longer matches any benign profile. Marking it hostile and looking for a detour.`,
          `Link ${onLink} just lit up: the model reads ${kind}${conf ? ` (${conf}% confidence)` : ""} in the flow features. Treating the hop as compromised.`,
          `Real-time scoring caught ${kind} crossing ${onLink}${conf ? `, ${conf}% sure` : ""}. The detector pulled it out of the benign cluster instantly.`,
        ]),
      };
    }
    // Operator-launched attacks (jam / stealth)
    const jammed = firstMatch(msg, /jammed link ([\w-]+)/);
    if (jammed) {
      return {
        id, t: e.t, severity: "detect", tag: "JAMMING",
        text: pick(id, [
          `Simulated RF jamming injected on ${jammed}. Watch the detector pick the degraded flow out of the noise and reroute around it.`,
          `Electronic-warfare event on ${jammed}: the link is being flooded. The model should classify the degradation within a tick.`,
        ]),
      };
    }
    const stealth = firstMatch(msg, /STEALTH attack on link ([\w-]+)/);
    if (stealth) {
      return {
        id, t: e.t, severity: "detect", tag: "STEALTH",
        text: pick(id, [
          `Low-and-slow stealth attack on ${stealth} — engineered to look almost benign. This is the hard case: the classifier has to catch a signal most rule-based filters would miss.`,
          `Stealth intrusion seeded on ${stealth}. Its features sit close to normal traffic, so a clean detection here is the model earning its keep.`,
        ]),
      };
    }
    // generic detection
    return { id, t: e.t, severity: "detect", tag: "ALERT", text: msg };
  }

  // REROUTE — the self-heal.
  if (e.kind === "reroute") {
    const around = firstMatch(msg, /around ([\w-]+)/);
    const via = firstMatch(msg, /via (.+)$/);
    return {
      id, t: e.t, severity: "defend", tag: "DEFENSE",
      text: pick(id, [
        `Self-healing engaged${around ? ` around ${around}` : ""}${via ? ` — traffic now flows ${via}` : ""}. No operator input required; the mesh found the path on its own. Comms held at ${comms}%.`,
        `Routing recovered${around ? ` from the loss of ${around}` : ""}${via ? `, detouring ${via}` : ""}. The swarm stayed connected through the hit (${comms}% comms).`,
        `Damage bypassed${via ? `: new path ${via}` : ""}. The network reconverged in real time — exactly the resilience that keeps the swarm mission-capable under attack.`,
      ]),
    };
  }

  // RECOVERY — reset / restored.
  if (e.kind === "recovery") {
    return {
      id, t: e.t, severity: "recover", tag: "RESTORED",
      text: pick(id, [
        `All threats cleared. Every drone is back on the trusted mesh and comms are nominal at ${comms}%. Swarm fully mission-capable.`,
        `Network restored to full health — quarantines lifted, links green, ${comms}% comms across all nodes.`,
      ]),
    };
  }

  // INFO — joins, boot, host nodes.
  const joined = firstMatch(msg, /Host node (\w+) joined/);
  if (joined) {
    return {
      id, t: e.t, severity: "info", tag: "LINK UP",
      text: `Forward node ${joined} came online and joined the mesh — a real second machine now relaying traffic. Killing it will test the swarm's tolerance to losing a live node.`,
    };
  }
  const reconnected = firstMatch(msg, /Host node (\w+) reconnected/);
  if (reconnected) {
    return {
      id, t: e.t, severity: "recover", tag: "LINK UP",
      text: `Forward node ${reconnected} is back on the air and rejoining the mesh — comms recovering to ${comms}%.`,
    };
  }
  const wentDark = firstMatch(msg, /Host node (\w+) went dark/);
  if (wentDark) {
    return {
      id, t: e.t, severity: "critical", tag: "NODE LOST",
      text: `Lost heartbeat from forward node ${wentDark} — the machine is gone. Treating it as a downed drone and healing the swarm around the hole (${comms}% comms).`,
    };
  }

  return { id, t: e.t, severity: "info", tag: "SYSTEM", text: msg };
}

// ── headline (the "current situation") ──────────────────────────────────────
function headlineFor(state: StateMessage, analysis: MeshAnalysis): NarrationLine | null {
  const t = state.events[0]?.t ?? "";
  const threats = analysis.compromised.length;
  const isolated = analysis.isolated.length;
  const jammed = state.links.filter((l) => l.status === "jammed").length;
  const comms = analysis.commsPct;

  if (threats === 0 && jammed === 0 && isolated === 0) {
    return {
      id: "hl-nominal", t, severity: "info", tag: "SITUATION",
      text: `Swarm nominal — all ${state.nodes.length} drones linked, the classifier is scoring every hop in real time, no threats on the board.`,
    };
  }
  const parts: string[] = [];
  if (threats) parts.push(`${threats} drone${threats > 1 ? "s" : ""} compromised and quarantined`);
  if (jammed) parts.push(`${jammed} link${jammed > 1 ? "s" : ""} under attack`);
  if (isolated) parts.push(`${isolated} drone${isolated > 1 ? "s" : ""} cut off`);
  const sev: NarrationSeverity = isolated > 0 || comms < 60 ? "critical" : "defend";
  const verdict =
    isolated > 0
      ? `comms degraded to ${comms}% — some nodes are stranded`
      : `the mesh is routing around the damage and holding ${comms}% comms`;
  return {
    id: "hl-active", t, severity: sev, tag: "SITUATION",
    text: `Under active attack: ${parts.join(", ")}. ${verdict}.`,
  };
}

export function narrate(
  state: StateMessage | null,
  analysis: MeshAnalysis,
): Narration {
  if (!state) return { headline: null, log: [] };
  return {
    headline: headlineFor(state, analysis),
    log: state.events.map((e, i) => enrich(e, i, state, analysis)),
  };
}
