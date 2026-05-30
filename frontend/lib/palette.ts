// frontend/lib/palette.ts
// Shared color + label mapping so the map, panels, and feed stay consistent.

import type { LinkStatus, NodeStatus, ThreatLevel } from "./types";

export const HEX = {
  healthy: "#22c55e",
  attacked: "#ef4444",
  rerouted: "#3b82f6",
  defending: "#38bdf8",
  elevated: "#f59e0b",
  dim: "#7e93ab",
} as const;

export function nodeColor(status: NodeStatus): string {
  switch (status) {
    case "attacked":
      return HEX.attacked;
    case "defending":
      return HEX.defending;
    default:
      return HEX.healthy;
  }
}

export function linkColor(status: LinkStatus): string {
  switch (status) {
    case "jammed":
      return HEX.attacked;
    case "rerouted":
      return HEX.rerouted;
    case "down":
      return HEX.dim;
    default:
      return HEX.healthy;
  }
}

export function threatColor(level: ThreatLevel): string {
  switch (level) {
    case "CRITICAL":
      return HEX.attacked;
    case "ELEVATED":
      return HEX.elevated;
    default:
      return HEX.healthy;
  }
}

export const EVENT_COLOR: Record<string, string> = {
  detection: HEX.attacked,
  reroute: HEX.rerouted,
  recovery: HEX.healthy,
  info: HEX.dim,
};
