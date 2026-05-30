// frontend/lib/reasons.ts
// "Why did the model flag this?" support.
//
// The backend will soon add an optional `reasons` field to each link describing
// the features that drove an attack prediction. Until then (and in MOCK mode) we
// compute the same thing locally from link.features. Read defensively so the UI
// works before AND after the contract gains the field, whatever its exact shape.

import type { SwarmLink } from "./types";

export interface NormReason {
  feature: string; // e.g. "flow_packets_s"
  value: number; // the observed value
  ratio: number; // x relative to a normal baseline (1 = normal)
  text?: string; // optional pre-formatted string from the backend
}

// Rough benign baselines (midpoints of normal traffic) used to express how far
// an attack value departs from normal. Order-of-magnitude is the point here.
const BENIGN_REF: Record<string, number> = {
  flow_packets_s: 130,
  flow_bytes_s: 30000,
  total_fwd_packets: 30,
  total_bwd_packets: 30,
  flow_duration: 400000,
  flow_iat_mean: 20000,
  fwd_pkt_len_mean: 170,
  bwd_pkt_len_mean: 230,
  pkt_len_mean: 230,
  avg_pkt_size: 250,
};

function deviation(ratio: number): number {
  if (ratio <= 0) return 0;
  return Math.max(ratio, 1 / ratio);
}

// Compute the most anomalous features for an attack-classified flow.
export function computeReasons(
  features: Record<string, number> | undefined,
  label: string,
): NormReason[] {
  if (!features || !label || label === "BENIGN") return [];
  const cand: NormReason[] = Object.entries(features).map(([feature, value]) => {
    const ref = BENIGN_REF[feature] ?? value;
    const ratio = ref > 0 ? value / ref : 1;
    return { feature, value, ratio };
  });
  return cand
    .filter((r) => deviation(r.ratio) >= 1.6)
    .sort((a, b) => deviation(b.ratio) - deviation(a.ratio))
    .slice(0, 3);
}

// Defensive normaliser: accepts whatever shape the backend ends up sending —
// strings, {feature,value,ratio}, {feature,detail}, {text} — into NormReason[].
export function getReasons(link: SwarmLink): NormReason[] {
  const raw = (link as unknown as { reasons?: unknown }).reasons;
  if (!Array.isArray(raw)) return [];
  const out: NormReason[] = [];
  for (const r of raw) {
    if (typeof r === "string") {
      out.push({ feature: "", value: NaN, ratio: NaN, text: r });
    } else if (r && typeof r === "object") {
      const o = r as Record<string, unknown>;
      out.push({
        feature: typeof o.feature === "string" ? o.feature : "",
        value: typeof o.value === "number" ? o.value : NaN,
        ratio: typeof o.ratio === "number" ? o.ratio : NaN,
        text:
          typeof o.text === "string"
            ? o.text
            : typeof o.detail === "string"
              ? o.detail
              : undefined,
      });
    }
  }
  return out;
}

export function fmtFeatureValue(feature: string, value: number): string {
  if (!isFinite(value)) return "—";
  if (feature === "flow_bytes_s" || feature === "flow_duration") {
    if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  }
  return Math.round(value).toLocaleString("en-US");
}

// Human phrase for how far off normal a value is.
export function ratioPhrase(ratio: number): string {
  if (!isFinite(ratio)) return "";
  if (ratio >= 1.5) return `${Math.round(ratio).toLocaleString("en-US")}x normal`;
  if (ratio < 0.1) return "far below normal";
  if (ratio <= 0.66) return `${Math.round(ratio * 100)}% of normal`;
  return "elevated";
}
