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
  const color = isAttack ? HEX.red : HEX.ink;
  const pctVal = Math.round(confidence * 100);

  return (
    <HudFrame
      title="ML Detector"
      right={
        <span className="flex items-center gap-1.5 text-[0.68rem] text-ink-dim">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: HEX.dim }} />
          {MODEL_NAME}
        </span>
      }
    >
      <div className="p-4">
        {/* headline verdict */}
        <div className="flex items-end justify-between">
          <div>
            <div className="label-xs">Verdict</div>
            <div className="mt-1 text-2xl font-semibold tracking-tight" style={{ color }}>
              {isAttack ? "Attack" : "Nominal"}
            </div>
          </div>
          <div className="text-right">
            <div className="text-4xl font-semibold leading-none tabular-nums" style={{ color }}>
              {pctVal}
              <span className="text-lg text-ink-dim">%</span>
            </div>
            <div className="mt-1 label-xs">Confidence</div>
          </div>
        </div>

        <div className="mt-3 h-1 overflow-hidden rounded-full bg-line">
          <motion.div
            className="h-full rounded-full"
            style={{ background: color }}
            animate={{ width: `${pctVal}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 22 }}
          />
        </div>

        <dl className="mt-4 space-y-2.5">
          <Row label="Class" value={pred?.label ?? "—"} valueColor={color} />
          <Row label="Vector" value={focus ? `${focus.source} → ${focus.target}` : "—"} mono />
        </dl>

        {/* per-class tally */}
        <div className="mt-4 border-t border-line-soft pt-3">
          <div className="label-xs mb-2">Detections by class</div>
          <div className="space-y-2">
            {(["DoS", "PortScan", "BruteForce"] as const).map((t) => {
              const count = links.filter((l) => l.prediction.label === t).length;
              const max = Math.max(1, links.length);
              return (
                <div key={t} className="flex items-center gap-3">
                  <span className="w-20 text-xs text-ink-dim">{t}</span>
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${(count / max) * 100}%`, background: count ? HEX.red : "transparent" }}
                    />
                  </div>
                  <span
                    className="w-5 text-right text-xs font-semibold tabular-nums"
                    style={{ color: count ? HEX.red : HEX.faint }}
                  >
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <p className="mt-4 text-[0.68rem] leading-relaxed text-ink-faint">
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
  mono,
}: {
  label: string;
  value: string;
  valueColor?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="label-xs">{label}</dt>
      <dd
        className={`text-sm font-medium ${mono ? "mono" : ""}`}
        style={{ color: valueColor ?? HEX.ink }}
      >
        {value}
      </dd>
    </div>
  );
}
