// frontend/components/WhyFlagged.tsx
// Shows the model's reasoning: for the most-confident flagged link, the features
// that drove the verdict, e.g. "flow_packets_s  47,000  (40x normal)". Reads the
// optional per-link `reasons` field defensively (works before/after the contract
// adds it; falls back to a local computation in MOCK mode).
"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { StateMessage, SwarmLink } from "@/lib/types";
import { fmtFeatureValue, getReasons, ratioPhrase, type NormReason } from "@/lib/reasons";
import { HEX } from "@/lib/palette";
import { HudFrame } from "@/components/Hud";

interface Props {
  state: StateMessage | null;
}

function topFlagged(links: SwarmLink[]): SwarmLink | null {
  const flagged = links.filter((l) => l.prediction.attack_type);
  if (flagged.length === 0) return null;
  return flagged.reduce((best, l) =>
    l.prediction.confidence > best.prediction.confidence ? l : best,
  );
}

export function WhyFlagged({ state }: Props) {
  const links = state?.links ?? [];
  const focus = topFlagged(links);
  const reasons: NormReason[] = focus ? getReasons(focus) : [];
  const flaggedCount = links.filter((l) => l.prediction.attack_type).length;

  return (
    <HudFrame
      title="Why It Flagged"
      right={
        flaggedCount > 0 ? (
          <span className="text-[0.66rem] font-semibold" style={{ color: HEX.red }}>
            {flaggedCount} active
          </span>
        ) : (
          <span className="text-[0.66rem] text-ink-dim">clear</span>
        )
      }
    >
      <div className="p-4">
        <AnimatePresence mode="wait">
          {!focus ? (
            <motion.div
              key="clear"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 text-xs text-ink-dim"
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: HEX.dim }} />
              No active threats — all flows within normal range.
            </motion.div>
          ) : (
            <motion.div
              key={focus.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold" style={{ color: HEX.red }}>
                  ⚠ {focus.prediction.label} on {focus.id}
                </span>
                <span className="mono text-xs" style={{ color: HEX.red }}>
                  {Math.round(focus.prediction.confidence * 100)}%
                </span>
              </div>

              <div className="mt-3 space-y-2">
                {reasons.length === 0 ? (
                  <p className="text-xs text-ink-faint">
                    Flagged on the combined feature vector (no single dominant signal).
                  </p>
                ) : (
                  reasons.map((r, i) => <ReasonRow key={`${r.feature}-${i}`} r={r} />)
                )}
              </div>

              <p className="mt-3 border-t border-line-soft pt-2 text-[0.66rem] leading-relaxed text-ink-faint">
                Feature values compared against benign baselines from the CIC training data.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </HudFrame>
  );
}

function ReasonRow({ r }: { r: NormReason }) {
  // backend may send a ready-made string; otherwise format from feature/value/ratio
  const phrase = r.text ?? ratioPhrase(r.ratio);
  const value = r.text ? "" : fmtFeatureValue(r.feature, r.value);
  return (
    <div className="flex items-center gap-2">
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0" style={{ background: HEX.red }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="mono text-xs text-ink">{r.feature || "flagged"}</span>
          {value && <span className="mono text-xs tabular-nums" style={{ color: HEX.red }}>{value}</span>}
        </div>
        {phrase && (
          <div className="mt-0.5 text-[0.66rem]" style={{ color: HEX.red }}>
            {phrase}
          </div>
        )}
      </div>
    </div>
  );
}
