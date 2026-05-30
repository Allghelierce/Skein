// frontend/lib/palette.ts
// Restraint: neutral by default, color only where it carries meaning.
// green = healthy / healing, red = hostile.

import type { LinkStatus, NodeStatus, ThreatLevel } from "./types";

export const HEX = {
  green: "#2ee27a",
  red: "#ff3b5c",
  amber: "#ffb02e", // elevated risk — danger before it lands
  node: "#34343c", // neutral healthy unit
  ink: "#ededf0",
  dim: "#8a8a93",
  faint: "#55555e",
  line: "#1e1e22",
} as const;

// Healthy drones stay neutral (white-ish); only state changes bring color in.
export function nodeColor(status: NodeStatus): string {
  switch (status) {
    case "attacked":
      return HEX.red;
    case "defending":
      return HEX.green;
    default:
      return HEX.ink;
  }
}

export function linkColor(status: LinkStatus): string {
  switch (status) {
    case "jammed":
      return HEX.red;
    case "rerouted":
      return HEX.green;
    case "down":
      return HEX.faint;
    default:
      return HEX.node; // healthy links are quiet grey
  }
}

export function threatColor(level: ThreatLevel): string {
  return level === "NOMINAL" ? HEX.green : HEX.red;
}

export const EVENT_COLOR: Record<string, string> = {
  detection: HEX.red,
  reroute: HEX.green,
  recovery: HEX.green,
  info: HEX.dim,
};
