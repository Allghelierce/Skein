// frontend/components/SwarmMap.tsx
// The tactical plot: square drone markers on a radar field, straight links with
// traveling data packets, neon-green when healthy/healing and red when hostile.
// Selected unit gets target-lock brackets. Click a node/link to select it.
"use client";

import { useCallback, useMemo } from "react";
import {
  BaseEdge,
  Background,
  BackgroundVariant,
  getStraightPath,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type EdgeMouseHandler,
  type EdgeProps,
  type Node,
  type NodeMouseHandler,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { motion } from "framer-motion";
import type { StateMessage, SwarmLink, SwarmNode } from "@/lib/types";
import { HEX, linkColor, nodeColor } from "@/lib/palette";
import { HudFrame } from "@/components/Hud";
import type { Selection } from "@/lib/ws";

const CANVAS_W = 860;
const CANVAS_H = 560;

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

/* ── Drone marker ───────────────────────────────────────────────────────── */
interface DroneData extends Record<string, unknown> {
  label: string;
  status: SwarmNode["status"];
  selected: boolean;
}
type DroneNode = Node<DroneData, "drone">;

function CornerTicks({ color, size }: { color: string; size: number }) {
  const base = { position: "absolute" as const, width: size, height: size, borderColor: color };
  return (
    <>
      <span style={{ ...base, top: -1, left: -1, borderTop: "1.5px solid", borderLeft: "1.5px solid" }} />
      <span style={{ ...base, top: -1, right: -1, borderTop: "1.5px solid", borderRight: "1.5px solid" }} />
      <span style={{ ...base, bottom: -1, left: -1, borderBottom: "1.5px solid", borderLeft: "1.5px solid" }} />
      <span style={{ ...base, bottom: -1, right: -1, borderBottom: "1.5px solid", borderRight: "1.5px solid" }} />
    </>
  );
}

function DroneNode({ data }: NodeProps<DroneNode>) {
  const color = nodeColor(data.status);
  const threat = data.status === "attacked";
  const defending = data.status === "defending";

  return (
    <div className="relative grid place-items-center">
      <Handle type="target" position={Position.Top} style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />

      {(threat || defending) && (
        <span
          className="absolute h-11 w-11 animate-skein-ring"
          style={{ border: `1.5px solid ${color}` }}
        />
      )}

      {/* target-lock brackets when selected */}
      {data.selected && (
        <span className="animate-lock-in pointer-events-none absolute h-[52px] w-[52px]">
          <CornerTicks color={color} size={11} />
        </span>
      )}

      <motion.div
        animate={{
          borderColor: color,
          boxShadow: `0 0 0 1px ${color}, 0 0 ${threat ? 26 : 16}px ${color}${threat ? "bb" : "66"}`,
          scale: data.selected ? 1.12 : 1,
        }}
        transition={{ duration: 0.35 }}
        className="relative grid h-10 w-10 place-items-center border bg-[#04140c]"
        style={{ borderColor: color }}
      >
        <CornerTicks color={color} size={5} />
        <span className="font-display text-[0.7rem] font-bold tracking-wider" style={{ color }}>
          {data.label}
        </span>
      </motion.div>

      <span
        className="absolute -bottom-4 whitespace-nowrap font-display text-[0.5rem] font-semibold tracking-[0.22em]"
        style={{ color: data.status === "healthy" ? HEX.dim : color }}
      >
        {data.status === "healthy" ? "ONLINE" : data.status.toUpperCase()}
      </span>
    </div>
  );
}

/* ── Data-flow edge (straight + traveling packet) ───────────────────────── */
interface DataEdgeData extends Record<string, unknown> {
  status: SwarmLink["status"];
  active: boolean;
  selected: boolean;
}
type DataEdge = Edge<DataEdgeData, "data">;

function DataEdge({ sourceX, sourceY, targetX, targetY, data }: EdgeProps<DataEdge>) {
  const [path] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  const status = data?.status ?? "healthy";
  const active = data?.active ?? false;
  const selected = data?.selected ?? false;
  const color = linkColor(status);
  const jammed = status === "jammed";
  const rerouted = status === "rerouted";
  const flow = jammed || rerouted || active;
  const width = (jammed || rerouted ? 2.4 : active ? 1.6 : 1) + (selected ? 1.4 : 0);

  return (
    <>
      <BaseEdge
        path={path}
        className={jammed ? "edge-jammed" : undefined}
        style={{
          stroke: color,
          strokeWidth: width,
          opacity: status === "healthy" && !active ? 0.3 : 0.95,
          filter: jammed
            ? "drop-shadow(0 0 5px #ff2d46)"
            : rerouted
              ? "drop-shadow(0 0 6px #29ff8c)"
              : undefined,
        }}
      />
      {flow && (
        <circle r={rerouted ? 3 : 2.1} fill={color} style={{ filter: `drop-shadow(0 0 4px ${color})` }}>
          <animateMotion
            dur={jammed ? "0.7s" : rerouted ? "0.9s" : "1.6s"}
            repeatCount="indefinite"
            path={path}
          />
        </circle>
      )}
    </>
  );
}

const nodeTypes = { drone: DroneNode };
const edgeTypes = { data: DataEdge };

/* ── Radar field behind the plot ────────────────────────────────────────── */
function RadarField() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 grid place-items-center overflow-hidden">
      <div className="relative aspect-square w-[78%] max-w-[560px]">
        {/* range rings */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "repeating-radial-gradient(circle at center, transparent 0 47px, rgba(41,255,140,0.05) 47px 48px)",
          }}
        />
        {/* outer bearing ring (rotating dashed) */}
        <div
          className="animate-spin-slow absolute inset-0 rounded-full"
          style={{ border: "1px dashed rgba(41,255,140,0.14)" }}
        />
        {/* sweep */}
        <div className="absolute inset-0 rounded-full radar-sweep" />
        {/* crosshair */}
        <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-[rgba(41,255,140,0.10)]" />
        <div className="absolute top-1/2 left-0 h-px w-full -translate-y-1/2 bg-[rgba(41,255,140,0.10)]" />
        <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[rgba(41,255,140,0.4)]" />
      </div>
    </div>
  );
}

interface Props {
  state: StateMessage | null;
  selected: Selection;
  onSelect: (sel: Selection) => void;
}

export function SwarmMap({ state, selected, onSelect }: Props) {
  const nodes: DroneNode[] = useMemo(() => {
    return (state?.nodes ?? []).map((n) => ({
      id: n.id,
      type: "drone",
      position: { x: n.x * CANVAS_W, y: n.y * CANVAS_H },
      data: {
        label: n.id,
        status: n.status,
        selected: selected?.kind === "node" && selected.id === n.id,
      },
      draggable: false,
    }));
  }, [state?.nodes, selected]);

  const edges: DataEdge[] = useMemo(() => {
    return (state?.links ?? []).map((l) => ({
      id: l.id,
      source: l.source,
      target: l.target,
      type: "data",
      data: {
        status: l.status,
        active: l.active,
        selected: selected?.kind === "link" && selected.id === l.id,
      },
    }));
  }, [state?.links, selected]);

  const onNodeClick = useCallback<NodeMouseHandler>(
    (_e, node) => onSelect({ kind: "node", id: node.id }),
    [onSelect],
  );
  const onEdgeClick = useCallback<EdgeMouseHandler<DataEdge>>(
    (_e, edge) => onSelect({ kind: "link", id: edge.id }),
    [onSelect],
  );
  const onPaneClick = useCallback(() => onSelect(null), [onSelect]);

  const hostiles = state?.links.filter((l) => l.status === "jammed").length ?? 0;

  return (
    <HudFrame className="relative min-h-0 flex-1 overflow-hidden">
      <div className="pointer-events-none absolute left-4 top-3 z-20 panel-title">
        Swarm Map
      </div>
      <div className="pointer-events-none absolute right-4 top-3 z-20 flex items-center gap-2 font-display text-[0.6rem] tracking-[0.2em]">
        <span className="h-1.5 w-1.5 animate-skein-pulse rounded-full" style={{ background: HEX.green }} />
        <span style={{ color: hostiles ? HEX.red : HEX.dim }}>
          {hostiles ? `${hostiles} CONTACT${hostiles > 1 ? "S" : ""}` : "SCANNING"}
        </span>
      </div>

      <RadarField />

      <div className="absolute inset-0 z-10">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onPaneClick={onPaneClick}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          nodesDraggable={false}
          nodesConnectable={false}
          minZoom={0.4}
          maxZoom={1.6}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={28} size={1} color="#0f2c1d" />
        </ReactFlow>
      </div>
    </HudFrame>
  );
}
