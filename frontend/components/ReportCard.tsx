// frontend/components/ReportCard.tsx
// The detector's report card — the portfolio proof that the brain is not just
// live but GOOD. Every number is real, produced by backend/ml/report.py from the
// saved model scored on the held-out CIC-IDS-2017 test split (see lib/modelReport).
//
//   • headline   — winning model, accuracy, macro-F1, test-set size
//   • bake-off   — the three classifiers we trained, ranked (winner highlighted)
//   • confusion  — where it's right (diagonal) and the few places it slips
//   • importance — which CIC flow features drive the decisions
"use client";

import { HEX } from "@/lib/palette";
import { HudFrame } from "@/components/Hud";
import { MODEL_REPORT } from "@/lib/modelReport";

const R = MODEL_REPORT;

function pct1(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

// largest off-diagonal cell — the model's single most notable confusion, derived
// (not hardcoded) so the caption stays honest if the model is retrained.
function topConfusion(): { from: string; to: string; n: number } | null {
  let best = { from: "", to: "", n: 0 };
  R.confusion_matrix.forEach((row, i) =>
    row.forEach((v, j) => {
      if (i !== j && v > best.n) best = { from: R.labels[i], to: R.labels[j], n: v };
    }),
  );
  return best.n > 0 ? best : null;
}

export function ReportCard() {
  const confusion = topConfusion();
  const fiMax = Math.max(...R.feature_importance.map((f) => f.value));
  const bestAcc = Math.max(...R.comparison.map((m) => m.accuracy));

  return (
    <HudFrame
      title="Model Report"
      right={
        <span className="flex items-center gap-1.5 text-[0.66rem] text-ink-dim">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: HEX.green }} />
          {R.best_model}
        </span>
      }
    >
      <div className="p-4">
        {/* headline */}
        <div className="flex items-end justify-between">
          <div>
            <div className="label-xs">Accuracy</div>
            <div className="mt-1 text-3xl font-semibold leading-none tabular-nums" style={{ color: HEX.green }}>
              {pct1(R.accuracy)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xl font-semibold leading-none tabular-nums">{R.macro_f1.toFixed(3)}</div>
            <div className="mt-1 label-xs">macro&nbsp;F1</div>
          </div>
        </div>
        <p className="mt-2 text-[0.66rem] leading-relaxed text-ink-faint">
          {R.best_model} on {R.n_test.toLocaleString("en-US")} held-out CIC-IDS-2017 flows.
        </p>

        {/* bake-off — real 3-model comparison */}
        <Section label="Model bake-off">
          <div className="space-y-1.5">
            {R.comparison.map((m) => {
              const win = m.model === R.best_model;
              return (
                <div key={m.model} className="flex items-center gap-2">
                  <span className="w-[7.5rem] truncate text-[0.68rem]" style={{ color: win ? HEX.green : HEX.dim }}>
                    {m.model}
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full"
                      style={{
                        // scale within the top band so the gap between strong models reads
                        width: `${((m.accuracy - 0.8) / (bestAcc - 0.8 || 1)) * 100}%`,
                        background: win ? HEX.green : HEX.faint,
                      }}
                    />
                  </div>
                  <span
                    className="w-12 text-right text-[0.68rem] font-semibold tabular-nums"
                    style={{ color: win ? HEX.green : HEX.dim }}
                  >
                    {pct1(m.accuracy)}
                  </span>
                </div>
              );
            })}
          </div>
        </Section>

        {/* confusion matrix — real counts, rows=true / cols=pred */}
        <Section label="Confusion matrix">
          <ConfusionMatrix />
          <div className="mt-2 flex items-center justify-between text-[0.58rem] text-ink-faint">
            <span>rows = truth · cols = prediction</span>
            {confusion && (
              <span>
                top slip: {confusion.from}→{confusion.to} ({confusion.n})
              </span>
            )}
          </div>
        </Section>

        {/* feature importance — what drives the model */}
        <Section label="Top feature importance">
          <div className="space-y-1.5">
            {R.feature_importance.slice(0, 6).map((f) => (
              <div key={f.feature} className="flex items-center gap-2">
                <span className="mono w-[7.5rem] truncate text-[0.64rem] text-ink-dim">{f.feature}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(f.value / fiMax) * 100}%`, background: HEX.green }}
                  />
                </div>
                <span className="w-9 text-right text-[0.62rem] tabular-nums text-ink-dim">
                  {(f.value * 100).toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </HudFrame>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 border-t border-line-soft pt-3">
      <div className="label-xs mb-2">{label}</div>
      {children}
    </div>
  );
}

// Heatmap of the real confusion counts. Diagonal (correct) reads green by how
// much of each true class it captured; off-diagonal (errors) reads red where the
// model actually slips — so the few mistakes are visible, not hidden by scale.
function ConfusionMatrix() {
  const { labels, confusion_matrix: cm } = R;
  const short = (l: string) => (l === "BruteForce" ? "BF" : l === "PortScan" ? "Scan" : l === "BENIGN" ? "Ben" : l);

  return (
    <div className="mono text-[0.58rem]">
      <div
        className="grid items-center gap-1"
        style={{ gridTemplateColumns: `2.6rem repeat(${labels.length}, 1fr)` }}
      >
        <span />
        {labels.map((l) => (
          <span key={l} className="text-center text-ink-faint">
            {short(l)}
          </span>
        ))}
        {cm.map((row, i) => {
          const rowSum = row.reduce((a, b) => a + b, 0) || 1;
          return (
            <FragmentRow key={labels[i]}>
              <span className="text-right text-ink-faint">{short(labels[i])}</span>
              {row.map((v, j) => {
                const frac = v / rowSum;
                const correct = i === j;
                // diagonal: green by capture rate; errors: red, with a floor so any
                // real mistake is visible against the dominant diagonal
                const bg = correct
                  ? `rgba(46,226,122,${0.1 + frac * 0.5})`
                  : v > 0
                    ? `rgba(255,59,92,${0.18 + Math.min(0.55, frac * 6)})`
                    : "transparent";
                const color = correct ? HEX.green : v > 0 ? HEX.red : HEX.faint;
                return (
                  <span
                    key={`${i}-${j}`}
                    className="grid h-6 place-items-center rounded tabular-nums"
                    style={{ background: bg, color }}
                  >
                    {v.toLocaleString("en-US")}
                  </span>
                );
              })}
            </FragmentRow>
          );
        })}
      </div>
    </div>
  );
}

// grid rows are flattened siblings — a fragment keeps each true-class row keyed
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
