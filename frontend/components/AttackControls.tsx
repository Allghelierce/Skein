// frontend/components/AttackControls.tsx
// The judge's hands-on levers. Select a link then Jam it, select a node then
// Hack it, or Reset everything. Each click sends a real CommandMessage upstream
// (to the mock engine or the live backend) — the map reacts to the result.
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
      ? `link ${selected.id}`
      : selected?.kind === "node"
        ? `drone ${selected.id}`
        : "nothing selected";

  return (
    <footer className="relative z-10 flex flex-wrap items-center justify-between gap-3 panel rounded-none border-x-0 border-b-0 px-5 py-3">
      <div className="flex items-center gap-3">
        <span className="panel-title">Attack Controls</span>
        <span className="rounded border border-border bg-bg-soft px-2 py-1 text-xs text-ink-dim">
          target:{" "}
          <span className="font-bold text-ink">{selectionLabel}</span>
        </span>
        <span className="hidden text-[0.65rem] text-ink-faint lg:inline">
          click a link or drone on the map, then act
        </span>
      </div>

      <div className="flex items-center gap-2">
        <ActionButton
          color={HEX.attacked}
          disabled={!linkId}
          onClick={() => linkId && send({ type: "command", action: "jam", target: linkId })}
          title="Simulate RF jamming on the selected link"
        >
          ⚡ Jam Link
        </ActionButton>
        <ActionButton
          color={HEX.elevated}
          disabled={!nodeId}
          onClick={() => nodeId && send({ type: "command", action: "hack", target: nodeId })}
          title="Compromise the selected drone"
        >
          ⚠ Hack Drone
        </ActionButton>
        <ActionButton
          color={HEX.healthy}
          onClick={() => send({ type: "command", action: "reset", target: null })}
          title="Restore the whole swarm"
        >
          ↺ Reset
        </ActionButton>
      </div>
    </footer>
  );
}

function ActionButton({
  color,
  disabled,
  onClick,
  title,
  children,
}: {
  color: string;
  disabled?: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="rounded-md border px-4 py-2 text-sm font-bold tracking-wide transition-all hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-35"
      style={{
        color,
        borderColor: `${color}66`,
        background: `${color}14`,
      }}
    >
      {children}
    </button>
  );
}
