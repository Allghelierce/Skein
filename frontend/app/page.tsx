// frontend/app/page.tsx
// Skein command center.
//   TOP    StatusBar + MissionStatus (comms / survival)
//   CENTER SwarmMap · LiveStatsBar · RawDataScope (the ML, working, visible)
//   RIGHT  DetectorPanel · WhyFlagged · EventFeed
//   BOTTOM AttackControls (judge levers)
"use client";

import { useMemo } from "react";
import { AttackControls } from "@/components/AttackControls";
import { BootScreen } from "@/components/BootScreen";
import { DetectorPanel } from "@/components/DetectorPanel";
import { EventFeed } from "@/components/EventFeed";
import { LiveStatsBar } from "@/components/LiveStatsBar";
import { MissionStatus } from "@/components/MissionStatus";
import { RawDataScope } from "@/components/RawDataScope";
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
    <div className="relative z-10 flex h-screen flex-col">
      <BootScreen />
      <StatusBar state={state} connected={connected} mode={mode} />
      <MissionStatus analysis={analysis} />

      <main className="flex min-h-0 flex-1 gap-3 p-3">
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex min-h-0 flex-1 flex-col">
            <SwarmMap
              state={state}
              selected={selected}
              onSelect={setSelected}
              isolated={isolated}
            />
          </div>
          <LiveStatsBar state={state} analysis={analysis} />
          <div className="h-[180px] shrink-0">
            <RawDataScope state={state} />
          </div>
        </div>

        <aside className="scroll-thin flex w-[340px] min-w-[300px] flex-col gap-3 overflow-y-auto">
          <DetectorPanel state={state} />
          <WhyFlagged state={state} />
          <EventFeed state={state} />
        </aside>
      </main>

      <AttackControls selected={selected} send={send} />
    </div>
  );
}
