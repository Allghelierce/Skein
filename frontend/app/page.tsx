// frontend/app/page.tsx
// Skein command center — "Gotham" layout.
//   TOP     slim SKEIN brand strip
//   STAGE   SwarmMap full-bleed, edge to edge (the centerpiece IS the background)
//   FLOAT   glass intel rails over the map:
//             left  → Detector · Why Flagged · Model Report launcher
//             right → Raw Data Scope · Activity feed
//           bottom dock   → Attack controls (judge levers)
//           bottom-right  → tray-less comms-to-base readout (mission stakes)
//   POPOUT  Model Report opens as an overlay so the rail never scrolls
"use client";

import { useEffect, useMemo, useState } from "react";
import { AttackControls } from "@/components/AttackControls";
import { BootScreen } from "@/components/BootScreen";
import { BrandBar } from "@/components/BrandBar";
import { CommsReadout } from "@/components/CommsReadout";
import { DetectorPanel } from "@/components/DetectorPanel";
import { EventFeed } from "@/components/EventFeed";
import { RawDataScope } from "@/components/RawDataScope";
import { ReportCard } from "@/components/ReportCard";
import { SwarmMap } from "@/components/SwarmMap";
import { WhyFlagged } from "@/components/WhyFlagged";
import { analyzeMesh } from "@/lib/mesh";
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

        {/* brand — centered, tray-less, floating over the top of the map */}
        <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center">
          <BrandBar />
        </div>

        {/* left rail — detection + reasoning. The ML Detector carries the Model
            Report launcher (⤢), which opens the full report popout. */}
        <aside className="gotham-rail scroll-thin absolute bottom-3 left-3 top-14 z-10 flex w-[280px] flex-col gap-3 overflow-y-auto">
          <DetectorPanel state={state} onOpenReport={() => setReportOpen(true)} />
          <WhyFlagged state={state} />
        </aside>

        {/* right rail — raw data scope + Lila (AI co-pilot). Capped well above the
            bottom-right so Lila's feed never overlaps the comms-to-base overlay. */}
        <aside className="gotham-rail absolute bottom-[168px] right-3 top-14 z-10 flex w-[280px] flex-col gap-3">
          <div className="h-[230px] shrink-0">
            <RawDataScope state={state} />
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            <EventFeed state={state} />
          </div>
        </aside>

        {/* bottom-right — tray-less comms-to-base readout (was the top ribbon) */}
        <div className="absolute bottom-3 right-4 z-20 w-[280px]">
          <CommsReadout analysis={analysis} />
        </div>

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
