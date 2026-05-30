// frontend/app/page.tsx
// Skein command center — "Gotham" layout.
//   TOP     slim SKEIN brand strip + MissionStatus ribbon
//   STAGE   SwarmMap full-bleed, edge to edge (the centerpiece IS the background)
//   FLOAT   glass intel rails over the map:
//             left  → Detector · Why Flagged · Model Report launcher
//             right → Raw Data Scope · Activity feed
//           bottom dock → Attack controls (judge levers)
//   POPOUT  Model Report opens as an overlay so the rail never scrolls
"use client";

import { useEffect, useMemo, useState } from "react";
import { AttackControls } from "@/components/AttackControls";
import { BootScreen } from "@/components/BootScreen";
import { BrandBar } from "@/components/BrandBar";
import { DetectorPanel } from "@/components/DetectorPanel";
import { EventFeed } from "@/components/EventFeed";
import { MissionStatus } from "@/components/MissionStatus";
import { RawDataScope } from "@/components/RawDataScope";
import { ReportCard } from "@/components/ReportCard";
import { SwarmMap } from "@/components/SwarmMap";
import { WhyFlagged } from "@/components/WhyFlagged";
import { analyzeMesh } from "@/lib/mesh";
import { MODEL_REPORT } from "@/lib/modelReport";
import { HEX } from "@/lib/palette";
import { useSwarm } from "@/lib/ws";

export default function Page() {
  const { state, send, selected, setSelected } = useSwarm();

  const analysis = useMemo(() => analyzeMesh(state), [state]);
  const isolated = useMemo(() => new Set(analysis.isolated), [analysis]);

  // Model Report lives in an overlay (opened from the left rail) so the intel
  // rail itself stays short — no scrolling to reach the detector reasoning.
  const [reportOpen, setReportOpen] = useState(false);
  useEffect(() => {
    if (!reportOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setReportOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reportOpen]);

  return (
    <div className="gotham-layout relative z-10 flex h-screen flex-col">
      <BootScreen />
      <BrandBar />
      <MissionStatus analysis={analysis} />

      {/* stage: the map fills everything; panels float on top */}
      <main className="gotham-vignette relative min-h-0 flex-1 overflow-hidden">
        {/* full-bleed swarm map background */}
        <div className="gotham-map absolute inset-0 flex flex-col">
          <SwarmMap
            state={state}
            selected={selected}
            onSelect={setSelected}
            isolated={isolated}
          />
        </div>

        {/* left rail — detection + reasoning + model report launcher */}
        <aside className="gotham-rail scroll-thin absolute bottom-3 left-3 top-14 z-10 flex w-[300px] flex-col gap-3 overflow-y-auto">
          <DetectorPanel state={state} />
          <WhyFlagged state={state} />
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            className="panel flex items-center justify-between px-4 py-3 text-left transition-colors hover:border-ink-faint"
          >
            <span className="panel-title">Model Report</span>
            <span className="flex items-center gap-2 text-[0.66rem] text-ink-dim">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: HEX.green }} />
              {MODEL_REPORT.best_model} · {(MODEL_REPORT.accuracy * 100).toFixed(1)}%
              <ExpandIcon />
            </span>
          </button>
        </aside>

        {/* right rail — live data feed + activity */}
        <aside className="gotham-rail absolute bottom-3 right-3 top-14 z-10 flex w-[300px] flex-col gap-3">
          <div className="h-[230px] shrink-0">
            <RawDataScope state={state} />
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            <EventFeed state={state} />
          </div>
        </aside>

        {/* bottom dock — judge levers, floating center */}
        <div className="glass-dock absolute bottom-3 left-1/2 z-20 w-[720px] max-w-[calc(100%-640px)] -translate-x-1/2 overflow-hidden">
          <AttackControls selected={selected} send={send} />
        </div>
      </main>

      {/* Model Report popout — rendered outside the rails so it floats over the
          whole stage and keeps the solid (non-glass) panel styling for legibility */}
      {reportOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center p-6">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setReportOpen(false)}
          />
          <div className="relative z-10 w-[460px] max-w-[92vw]">
            <button
              type="button"
              onClick={() => setReportOpen(false)}
              aria-label="Close model report"
              className="absolute -right-3 -top-3 z-20 grid h-7 w-7 place-items-center rounded-full border border-line bg-panel-2 text-ink-dim transition-colors hover:text-ink"
            >
              ✕
            </button>
            <div className="scroll-thin max-h-[86vh] overflow-y-auto rounded-lg">
              <ReportCard />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ExpandIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M21 14v7H3V3h7" />
    </svg>
  );
}
