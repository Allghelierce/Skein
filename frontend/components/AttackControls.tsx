// frontend/components/AttackControls.tsx
// Judge levers. Select a link → Jam, select a node → Hack, or Reset. Each click
// sends a real CommandMessage; the map reacts to the result.
"use client";

import type { CommandMessage } from "@/lib/types";
import type { Selection } from "@/lib/ws";
import { HEX } from "@/lib/palette";

interface Props {
  selected: Selection;
  send: (cmd: CommandMessage) => void;
}

export function AttackControls({ selected, send }: Props) {
  const linkId = selected?.kind === "link" ? selected.id : null;
  const nodeId = selected?.kind === "node" ? selected.id : null;

  const selectionLabel =
    selected?.kind === "link"
      ? `Link ${selected.id}`
      : selected?.kind === "node"
        ? `Drone ${selected.id}`
        : "None";

  return (
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-bg px-5 py-3">
      <div className="flex items-center gap-3">
        <span className="label-xs">Selection</span>
        <span
          className="text-sm font-medium"
          style={{ color: selected ? HEX.ink : HEX.faint }}
        >
          {selectionLabel}
        </span>
        <span className="hidden text-xs text-ink-faint lg:inline">
          · pick a unit on the map, then act
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn"
          style={linkId ? { color: HEX.red, borderColor: `${HEX.red}55` } : undefined}
          disabled={!linkId}
          onClick={() => linkId && send({ type: "command", action: "jam", target: linkId })}
          title="Simulate RF jamming on the selected link"
        >
          <Dot color={HEX.red} /> Jam link
        </button>
        <button
          type="button"
          className="btn"
          style={nodeId ? { color: HEX.red, borderColor: `${HEX.red}55` } : undefined}
          disabled={!nodeId}
          onClick={() => nodeId && send({ type: "command", action: "hack", target: nodeId })}
          title="Compromise the selected drone"
        >
          <Dot color={HEX.red} /> Hack drone
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => send({ type: "command", action: "reset", target: null })}
          title="Restore the whole swarm"
        >
          <Dot color={HEX.dim} /> Reset
        </button>
      </div>
    </footer>
  );
}

function Dot({ color }: { color: string }) {
  return <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />;
}
