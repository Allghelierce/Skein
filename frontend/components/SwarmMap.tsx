// frontend/components/SwarmMap.tsx
// The star of the demo: drones as glowing nodes, links colored by status.
// Built on React Flow for layout/interaction; Framer Motion animates each
// drone's status transitions. Click a node or link to select it; AttackControls
// then act on the selection.
"use client";

import { useCallback, useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type EdgeMouseHandler,
  type Node,
  type NodeMouseHandler,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { motion } from "framer-motion";
import type { StateMessage, SwarmLink, SwarmNode } from "@/lib/types";
import { linkColor, nodeColor } from "@/lib/palette";
import type { Selection } from "@/lib/ws";

// Normalized (0..1) coords are scaled onto this virtual canvas; fitView frames it.
const CANVAS_W = 880;
const CANVAS_H = 560;

interface DroneData extends Record<string, unknown> {
  label: string;
  status: SwarmNode["status"];
  selected: boolean;
}
type DroneNode = Node<DroneData, "drone">;

function DroneNode({ data }: NodeProps<DroneNode>) {
  const color = nodeColor(data.status);
  const isThreat = data.status === "attacked";
  const isDefending = data.status === "defending";

  return (
    <div className="relative grid place-items-center">
      {/* Hidden center handles so edges route node-center to node-center. */}
      <Handle type="target" position={Position.Top} style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />

      {/* Expanding ring when under attack or actively defending. */}
      {(isThreat || isDefending) && (
        <span
          className="absolute h-12 w-12 rounded-full animate-skein-ring"
          style={{ border: `2px solid ${color}` }}
        />
      )}

      <motion.div
        animate={{
          backgroundColor: `${color}22`,
          borderColor: color,
          boxShadow: `0 0 0 1px ${color}, 0 0 22px ${color}${isThreat ? "aa" : "55"}`,
          scale: data.selected ? 1.18 : 1,
        }}
        transition={{ duration: 0.4 }}
        className="grid h-11 w-11 place-items-center rounded-full border-2"
        style={{ backgroundColor: `${color}22`, borderColor: color }}
      >
        <span className="text-xs font-bold" style={{ color }}>
          {data.label}
        </span>
      </motion.div>

      {data.selected && (
        <span
          className="pointer-events-none absolute h-14 w-14 rounded-full"
          style={{ border: `1.5px dashed ${color}` }}
        />
      )}

      <span
        className="absolute -bottom-5 text-[0.55rem] font-bold tracking-widest"
        style={{ color }}
      >
        {data.status === "healthy" ? "" : data.status.toUpperCase()}
      </span>
    </div>
  );
}

const HANDLE_STYLE = {
  opacity: 0,
  width: 1,
  height: 1,
  left: "50%",
  top: "50%",
  border: "none",
  background: "transparent",
  minWidth: 0,
  minHeight: 0,
} as const;

const nodeTypes = { drone: DroneNode };

interface Props {
  state: StateMessage | null;
  selected: Selection;
  onSelect: (sel: Selection) => void;
}

export function SwarmMap({ state, selected, onSelect }: Props) {
  const nodes: DroneNode[] = useMemo(() => {
    const src = state?.nodes ?? [];
    return src.map((n) => ({
      id: n.id,
      type: "drone",
      position: { x: n.x * CANVAS_W, y: n.y * CANVAS_H },
      data: {
        label: n.id,
        status: n.status,
        selected: selected?.kind === "node" && selected.id === n.id,
      },
      draggable: false,
      selectable: true,
    }));
  }, [state?.nodes, selected]);

  const edges: Edge[] = useMemo(() => {
    const src = state?.links ?? [];
    return src.map((l: SwarmLink) => {
      const color = linkColor(l.status);
      const isSel = selected?.kind === "link" && selected.id === l.id;
      const isThreat = l.status === "jammed";
      const isReroute = l.status === "rerouted";
      const width = isThreat || isReroute ? 3.5 : l.active ? 2.2 : 1.4;
      return {
        id: l.id,
        source: l.source,
        target: l.target,
        animated: isThreat || isReroute || l.active,
        selected: isSel,
        style: {
          stroke: color,
          strokeWidth: isSel ? width + 1.5 : width,
          strokeDasharray: l.status === "down" ? "2 6" : undefined,
          opacity: l.status === "healthy" && !l.active ? 0.5 : 1,
          filter: isThreat
            ? "drop-shadow(0 0 6px #ef4444)"
            : isReroute
              ? "drop-shadow(0 0 6px #3b82f6)"
              : undefined,
        },
      } satisfies Edge;
    });
  }, [state?.links, selected]);

  const onNodeClick = useCallback<NodeMouseHandler>(
    (_e, node) => onSelect({ kind: "node", id: node.id }),
    [onSelect],
  );
  const onEdgeClick = useCallback<EdgeMouseHandler>(
    (_e, edge) => onSelect({ kind: "link", id: edge.id }),
    [onSelect],
  );
  const onPaneClick = useCallback(() => onSelect(null), [onSelect]);

  return (
    <div className="panel relative min-h-0 flex-1 overflow-hidden">
      <div className="pointer-events-none absolute left-4 top-3 z-10 panel-title">
        Swarm Map
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        panOnDrag
        zoomOnScroll
        minZoom={0.4}
        maxZoom={1.6}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={26} size={1} color="#16263b" />
      </ReactFlow>
    </div>
  );
}
