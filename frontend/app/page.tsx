// frontend/app/page.tsx
// Skein command center — "Gotham" layout.
//   TOP     StatusBar + MissionStatus ribbons
//   STAGE   SwarmMap full-bleed, edge to edge (the centerpiece IS the background)
//   FLOAT   glass intel rails over the map:
//             left  → Detector · Why Flagged · Report Card
//             right → Raw Data Scope · Activity feed
//           bottom dock → Live telemetry + Attack controls (judge levers)
"use client";

import { useMemo } from "react";
import { AttackControls } from "@/components/AttackControls";
import { BootScreen } from "@/components/BootScreen";
import { DetectorPanel } from "@/components/DetectorPanel";
import { EventFeed } from "@/components/EventFeed";
import { LiveStatsBar } from "@/components/LiveStatsBar";
import { MissionStatus } from "@/components/MissionStatus";
import { RawDataScope } from "@/components/RawDataScope";
import { ReportCard } from "@/components/ReportCard";
import { StatusBar } from "@/components/StatusBar";
import { SwarmMap } from "@/components/SwarmMap";
import { WhyFlagged } from "@/components/WhyFlagged";
import { analyzeMesh } from "@/lib/mesh";
import { useSwarm } from "@/lib/ws";

export default function Page() {
  const { state, send, selected, setSelected, connected, mode } = useSwarm();

  const analysis = useMemo(() => analyzeMesh(state), [state]);
  const isolated = useMemo(() => new Set(analysis.isolated), [analysis]);

  return (
    <div className="gotham-layout relative z-10 flex h-screen flex-col">
      <BootScreen />
      <StatusBar state={state} connected={connected} mode={mode} />
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

        {/* left rail — detection + reasoning + model report */}
        <aside className="gotham-rail scroll-thin absolute bottom-3 left-3 top-14 z-10 flex w-[300px] flex-col gap-3 overflow-y-auto">
          <DetectorPanel state={state} />
          <WhyFlagged state={state} />
          <ReportCard />
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

        {/* bottom dock — telemetry strip + judge levers, floating center */}
        <div className="glass-dock absolute bottom-3 left-1/2 z-20 w-[720px] max-w-[calc(100%-640px)] -translate-x-1/2 overflow-hidden">
          <LiveStatsBar state={state} analysis={analysis} />
          <AttackControls selected={selected} send={send} />
        </div>
      </main>
    </div>
  );
}
