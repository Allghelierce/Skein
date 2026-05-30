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
      ? `LINK ${selected.id}`
      : selected?.kind === "node"
        ? `DRONE ${selected.id}`
        : "NONE";

  return (
    <footer className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-panel px-5 py-2.5">
      <div className="flex items-center gap-3">
        <span className="panel-title">Attack Controls</span>
        <span className="flex items-center gap-2 border border-line-soft bg-bg-soft px-2.5 py-1">
          <span className="panel-title text-[0.5rem]">Target</span>
          <span
            className="font-display text-[0.72rem] font-bold tracking-wider"
            style={{ color: selected ? HEX.green : HEX.dim }}
          >
            {selectionLabel}
          </span>
        </span>
        <span className="hidden font-display text-[0.55rem] tracking-[0.18em] text-ink-faint lg:inline">
          SELECT A UNIT ON THE PLOT, THEN ACT
        </span>
      </div>

      <div className="flex items-center gap-2.5">
        <button
          type="button"
          className="tac-btn"
          style={{ color: HEX.red, borderColor: `${HEX.red}66` }}
          disabled={!linkId}
          onClick={() => linkId && send({ type: "command", action: "jam", target: linkId })}
          title="Simulate RF jamming on the selected link"
        >
          Jam Link
        </button>
        <button
          type="button"
          className="tac-btn"
          style={{ color: HEX.red, borderColor: `${HEX.red}66` }}
          disabled={!nodeId}
          onClick={() => nodeId && send({ type: "command", action: "hack", target: nodeId })}
          title="Compromise the selected drone"
        >
          Hack Drone
        </button>
        <button
          type="button"
          className="tac-btn"
          style={{ color: HEX.green, borderColor: `${HEX.green}66` }}
          onClick={() => send({ type: "command", action: "reset", target: null })}
          title="Restore the whole swarm"
        >
          Reset
        </button>
      </div>
    </footer>
  );
}
