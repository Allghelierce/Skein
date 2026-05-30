// frontend/lib/types.ts — SHARED CONTRACT.
// The backend (app.py) MUST emit `state` messages in exactly this shape, and
// accept `command` messages in exactly this shape. Do not redefine these types
// elsewhere; import from here.

export type NodeStatus = "healthy" | "attacked" | "defending";
export type LinkStatus = "healthy" | "jammed" | "rerouted" | "down";
export type ThreatLevel = "NOMINAL" | "ELEVATED" | "CRITICAL";

export interface Prediction {
  label: string; // "BENIGN" | "DoS" | "PortScan" | "BruteForce"
  attack_type: string | null;
  confidence: number; // 0..1
}

export interface SwarmNode {
  id: string; // e.g. "D1"
  x: number; // 0..1 layout coords
  y: number;
  status: NodeStatus;
}

export interface SwarmLink {
  id: string; // "D1-D2"
  source: string;
  target: string;
  status: LinkStatus;
  active: boolean; // currently carrying traffic
  prediction: Prediction;
}

export interface SwarmEvent {
  t: string; // "10:42:01"
  kind: "detection" | "reroute" | "recovery" | "info";
  message: string;
}

export interface StateMessage {
  type: "state";
  tick: number;
  threat_level: ThreatLevel;
  nodes: SwarmNode[];
  links: SwarmLink[];
  events: SwarmEvent[]; // newest-first, last ~20
}

export type CommandAction = "jam" | "hack" | "reset";

export interface CommandMessage {
  type: "command";
  action: CommandAction;
  target: string | null; // link id for "jam", node id for "hack", null for "reset"
}
