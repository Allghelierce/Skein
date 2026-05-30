// frontend/app/page.tsx
// Skein command center. Layout per badIDEA §6:
//   TOP    StatusBar (LIVE + threat level)
//   CENTER SwarmMap (the swarm)        RIGHT  DetectorPanel (top) + EventFeed (bottom)
//   BOTTOM AttackControls (judge levers)
"use client";

import { AttackControls } from "@/components/AttackControls";
import { DetectorPanel } from "@/components/DetectorPanel";
import { EventFeed } from "@/components/EventFeed";
import { StatusBar } from "@/components/StatusBar";
import { SwarmMap } from "@/components/SwarmMap";
import { useSwarm } from "@/lib/ws";

export default function Page() {
  const { state, send, selected, setSelected, connected, mode } = useSwarm();

  return (
    <div className="relative z-10 flex h-screen flex-col">
      <StatusBar state={state} connected={connected} mode={mode} />

      <main className="flex min-h-0 flex-1 gap-3 p-3">
        <div className="flex min-h-0 flex-1 flex-col">
          <SwarmMap state={state} selected={selected} onSelect={setSelected} />
        </div>

        <aside className="flex w-[340px] min-w-[300px] flex-col gap-3">
          <DetectorPanel state={state} />
          <EventFeed state={state} />
        </aside>
      </main>

      <AttackControls selected={selected} send={send} />
    </div>
  );
}
