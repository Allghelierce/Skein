// frontend/components/DetectorPanel.tsx
"use client";

import { motion } from "framer-motion";
import type { StateMessage, SwarmLink } from "@/lib/types";
import { HEX } from "@/lib/palette";
import { HudFrame } from "@/components/Hud";

const MODEL_NAME = "RandomForest"; // replaced by real best-model name in live mode

interface Props {
  state: StateMessage | null;
}

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
  const color = isAttack ? HEX.red : HEX.green;
  const pctVal = Math.round(confidence * 100);

  return (
    <HudFrame
      title="ML Detector"
      right={
        <span className="flex items-center gap-1.5 font-display text-[0.58rem] tracking-[0.18em] text-ink-dim">
          <span className="h-1.5 w-1.5" style={{ background: HEX.green }} />
          {MODEL_NAME}
        </span>
      }
    >
      <div className="flex flex-col gap-3 p-3.5 pt-3">
        {/* verdict */}
        <div className="border border-line-soft bg-bg-soft p-3">
          <div className="flex items-end justify-between">
            <span className="font-display text-2xl font-bold tracking-wide" style={{ color }}>
              {isAttack ? "ATTACK" : "NOMINAL"}
            </span>
            <span className="font-display text-3xl font-bold leading-none tabular-nums" style={{ color }}>
              {pctVal}
              <span className="text-base text-ink-dim">%</span>
            </span>
          </div>

          <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <Row label="CLASS" value={pred?.label ?? "—"} valueColor={color} />
            <Row label="VECTOR" value={focus ? `${focus.source}-${focus.target}` : "—"} />
          </dl>

          <div className="mt-3 h-1.5 overflow-hidden bg-line-soft">
            <motion.div
              className="h-full"
              style={{ background: color, boxShadow: `0 0 8px ${color}` }}
              animate={{ width: `${pctVal}%` }}
              transition={{ type: "spring", stiffness: 120, damping: 20 }}
            />
          </div>
        </div>

        {/* per-class tally */}
        <div className="grid grid-cols-3 gap-2">
          {(["DoS", "PortScan", "BruteForce"] as const).map((t) => {
            const count = links.filter((l) => l.prediction.label === t).length;
            return (
              <div key={t} className="border border-line-soft bg-bg-soft px-2 py-2 text-center">
                <div
                  className="font-display text-lg font-bold tabular-nums"
                  style={{ color: count > 0 ? HEX.red : HEX.dim }}
                >
                  {count}
                </div>
                <div className="panel-title justify-center text-[0.5rem]">{t}</div>
              </div>
            );
          })}
        </div>

        <p className="text-[0.62rem] leading-relaxed text-ink-faint">
          Classic ML scores every link each tick from real CIC flow features.
          Jamming is simulated link degradation — the detection is genuine.
        </p>
      </div>
    </HudFrame>
  );
}

function Row({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="flex items-center justify-between border-b border-line-soft/60 pb-0.5">
      <dt className="panel-title text-[0.5rem]">{label}</dt>
      <dd className="font-display text-[0.7rem] font-semibold" style={valueColor ? { color: valueColor } : { color: HEX.dim }}>
        {value}
      </dd>
    </div>
  );
}
