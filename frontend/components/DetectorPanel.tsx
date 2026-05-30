// frontend/components/DetectorPanel.tsx
"use client";

import { motion } from "framer-motion";
import type { StateMessage, SwarmLink } from "@/lib/types";
import { HEX } from "@/lib/palette";

const MODEL_NAME = "RandomForest"; // replaced by real best-model name in live mode

interface Props {
  state: StateMessage | null;
}

// Pick the most interesting thing the detector is "seeing" right now: the
// highest-confidence attack link if any, else the freshest benign sample.
function focusLink(links: SwarmLink[]): SwarmLink | null {
  if (links.length === 0) return null;
  const attacks = links.filter((l) => l.prediction.attack_type);
  const pool = attacks.length > 0 ? attacks : links;
  return pool.reduce((best, l) =>
    l.prediction.confidence > best.prediction.confidence ? l : best,
  );
}

export function DetectorPanel({ state }: Props) {
  const links = state?.links ?? [];
  const focus = focusLink(links);
  const pred = focus?.prediction;
  const isAttack = !!pred?.attack_type;
  const confidence = pred?.confidence ?? 0;
  const color = isAttack ? HEX.attacked : HEX.healthy;
  const label = pred?.label ?? "—";

  return (
    <section className="panel flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <span className="panel-title">ML Detector</span>
        <span className="flex items-center gap-1.5 text-[0.65rem] text-ink-dim">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-rerouted" />
          {MODEL_NAME}
        </span>
      </div>

      {/* Verdict */}
      <div className="rounded-lg border border-border bg-bg-soft p-3">
        <div className="flex items-baseline justify-between">
          <span
            className="text-2xl font-bold tracking-wide"
            style={{ color }}
          >
            {isAttack ? "ATTACK" : "NOMINAL"}
          </span>
          <span className="text-right text-3xl font-bold tabular-nums" style={{ color }}>
            {Math.round(confidence * 100)}
            <span className="text-base text-ink-dim">%</span>
          </span>
        </div>

        <div className="mt-1 flex items-center justify-between text-xs text-ink-dim">
          <span>
            class:{" "}
            <span className="font-bold" style={{ color }}>
              {label}
            </span>
          </span>
          <span>
            {focus ? (
              <>
                link <span className="text-ink">{focus.source}-{focus.target}</span>
              </>
            ) : (
              "—"
            )}
          </span>
        </div>

        {/* Confidence bar */}
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-border/40">
          <motion.div
            className="h-full rounded-full"
            style={{ background: color }}
            animate={{ width: `${Math.round(confidence * 100)}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
          />
        </div>
      </div>

      {/* Per-attack-type tally so judges see the classifier discriminating. */}
      <div className="grid grid-cols-3 gap-2 text-center">
        {(["DoS", "PortScan", "BruteForce"] as const).map((t) => {
          const count = links.filter((l) => l.prediction.label === t).length;
          return (
            <div
              key={t}
              className="rounded-md border border-border bg-bg-soft px-2 py-2"
            >
              <div
                className="text-lg font-bold tabular-nums"
                style={{ color: count > 0 ? HEX.attacked : HEX.dim }}
              >
                {count}
              </div>
              <div className="panel-title text-[0.6rem]">{t}</div>
            </div>
          );
        })}
      </div>

      <p className="text-[0.65rem] leading-relaxed text-ink-faint">
        Classic ML scores every link each tick from real CIC flow features —
        jamming is simulated as link degradation, the detection is genuine.
      </p>
    </section>
  );
}
