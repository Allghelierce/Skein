// frontend/components/RawDataScope.tsx
// The "system working behind the scenes" panel: a terminal-style scope that
// prints, each tick, the raw CIC feature values the detector actually scored for
// every active link, alongside the predicted class + confidence. A judge can
// read real numbers -> real prediction. Human-readable pace (one batch/tick).
"use client";

import { useEffect, useRef, useState } from "react";
import type { StateMessage } from "@/lib/types";
import { HEX } from "@/lib/palette";
import { HudFrame } from "@/components/Hud";

interface Props {
  state: StateMessage | null;
}

interface ScopeRow {
  key: number;
  link: string;
  pkts: number; // flow_packets_s
  bytes: number; // flow_bytes_s
  cls: string;
  conf: number;
  attack: boolean;
}

const MAX_ROWS = 30;

function fmtInt(v: number): string {
  return Math.round(v).toLocaleString("en-US");
}
function fmtBytes(v: number): string {
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return Math.round(v).toString();
}

export function RawDataScope({ state }: Props) {
  const [rows, setRows] = useState<ScopeRow[]>([]);
  const lastTick = useRef<number>(-1);
  const counter = useRef<number>(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state) return;
    if (state.tick === lastTick.current) return; // one batch per tick only
    lastTick.current = state.tick;

    const active = state.links.filter((l) => l.active || l.status === "jammed");
    if (active.length === 0) return;

    const batch: ScopeRow[] = active.map((l) => ({
      key: counter.current++,
      link: l.id,
      pkts: l.features?.flow_packets_s ?? 0,
      bytes: l.features?.flow_bytes_s ?? 0,
      cls: l.prediction.label,
      conf: l.prediction.confidence,
      attack: !!l.prediction.attack_type,
    }));

    setRows((prev) => [...prev, ...batch].slice(-MAX_ROWS));
  }, [state]);

  // keep the newest line in view without yanking the page around
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [rows]);

  return (
    <HudFrame
      title="Raw Data Scope"
      right={
        <span className="flex items-center gap-1.5 text-[0.66rem] text-ink-dim">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: HEX.green }} />
          live feature stream
        </span>
      }
      className="flex h-full min-h-0 flex-col"
    >
      <div className="mono px-3 pt-2 text-[0.66rem]">
        {/* column header */}
        <div
          className="grid items-center gap-2 border-b border-line-soft pb-1.5 text-ink-faint"
          style={{ gridTemplateColumns: "3rem 1fr 1fr 5.5rem 3rem" }}
        >
          <span>LINK</span>
          <span className="text-right">flow_pkts/s</span>
          <span className="text-right">flow_bytes/s</span>
          <span>CLASS</span>
          <span className="text-right">CONF</span>
        </div>
      </div>

      <div ref={scrollRef} className="scroll-thin mono min-h-0 flex-1 overflow-y-auto px-3 pb-2 text-[0.66rem] leading-[1.5]">
        {rows.length === 0 && <div className="pt-2 text-ink-faint">scanning links…</div>}
        {rows.map((r) => {
          const color = r.attack ? HEX.red : HEX.green;
          return (
            <div
              key={r.key}
              className="grid items-center gap-2 tabular-nums"
              style={{ gridTemplateColumns: "3rem 1fr 1fr 5.5rem 3rem", color }}
            >
              <span className="flex items-center gap-1">
                {r.attack ? <span>⚠</span> : <span className="text-ink-faint">·</span>}
                {r.link}
              </span>
              <span className="text-right" style={{ color: r.attack ? HEX.red : HEX.dim }}>
                {fmtInt(r.pkts)}
              </span>
              <span className="text-right" style={{ color: r.attack ? HEX.red : HEX.dim }}>
                {fmtBytes(r.bytes)}
              </span>
              <span style={{ color }}>{r.cls}</span>
              <span className="text-right">{Math.round(r.conf * 100)}%</span>
            </div>
          );
        })}
        <div className="flex items-center gap-1 pt-0.5 text-ink-faint">
          <span>&gt;</span>
          <span className="inline-block h-3 w-1.5 animate-skein-pulse" style={{ background: HEX.green }} />
        </div>
      </div>
    </HudFrame>
  );
}
