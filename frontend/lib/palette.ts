// frontend/lib/palette.ts
// Two-color tactical scheme: neon green = healthy / healing, neon red = hostile.
// Shared by the map, panels, and feed so everything stays consistent.

import type { LinkStatus, NodeStatus, ThreatLevel } from "./types";

export const HEX = {
  green: "#29ff8c",
  red: "#ff2d46",
  dim: "#5f7f96",
  faint: "#34505f",
} as const;

export function nodeColor(status: NodeStatus): string {
  return status === "attacked" ? HEX.red : HEX.green;
}

export function linkColor(status: LinkStatus): string {
  switch (status) {
    case "jammed":
      return HEX.red;
    case "down":
      return HEX.dim;
    default:
      // healthy + rerouted are both green (rerouted is distinguished by motion/glow)
      return HEX.green;
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
