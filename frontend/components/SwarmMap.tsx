// frontend/components/SwarmMap.tsx
// The plot. A hex swarm formation on a framed dark field. Calm and neutral by
// default; color enters only with state — red when jammed/hacked, green along
// the healed reroute. Click to select; a detail card shows the live ML readout.
"use client";

import { useCallback, useMemo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  ReactFlow,
  getStraightPath,
  Handle,
  Position,
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

const CANVAS_W = 840;
const CANVAS_H = 580;

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

function DroneGlyph({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
      <line x1="7" y1="7" x2="17" y2="17" />
      <line x1="17" y1="7" x2="7" y2="17" />
      <circle cx="6" cy="6" r="2.2" />
      <circle cx="18" cy="6" r="2.2" />
      <circle cx="6" cy="18" r="2.2" />
      <circle cx="18" cy="18" r="2.2" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" fill={color} stroke="none" />
    </svg>
  );
}

/* ── Drone marker ───────────────────────────────────────────────────────── */
interface DroneData extends Record<string, unknown> {
  label: string;
  status: SwarmNode["status"];
  selected: boolean;
  isolated: boolean;
}
type DroneNode = Node<DroneData, "drone">;

function DroneNode({ data }: NodeProps<DroneNode>) {
  const threat = data.status === "attacked";
  // a cut-off (isolated) drone reads as offline: dark, dashed, no glow
  const offline = data.isolated && !threat;
  const color = offline ? HEX.faint : nodeColor(data.status);
  const colored = !offline && data.status !== "healthy";
  const ringColor = offline ? HEX.faint : colored ? color : HEX.node;

  return (
    <div className="relative grid place-items-center" style={{ opacity: offline ? 0.7 : 1 }}>
      <Handle type="target" position={Position.Top} style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />

      {threat && (
        <span className="absolute h-11 w-11 rounded-full animate-skein-ring" style={{ border: `1px solid ${color}` }} />
      )}
      {data.selected && (
        <span
          className="pointer-events-none absolute h-[46px] w-[46px] rounded-full"
          style={{ border: `1px solid ${colored ? color : HEX.ink}`, opacity: 0.55 }}
        />
      )}

      <motion.div
        animate={{
          borderColor: ringColor,
          boxShadow: colored ? `0 0 16px ${color}55` : "0 0 14px rgba(0,0,0,0.6)",
          scale: data.selected ? 1.1 : 1,
        }}
        transition={{ duration: 0.35 }}
        className="grid h-[34px] w-[34px] place-items-center rounded-full bg-[#0b0b0e]"
        style={{ border: `1px ${offline ? "dashed" : "solid"} ${ringColor}` }}
      >
        <DroneGlyph color={offline ? HEX.faint : colored ? color : HEX.dim} />
      </motion.div>

      <span
        className="absolute -bottom-[19px] whitespace-nowrap text-[0.62rem] font-medium tracking-tight"
        style={{ color: offline ? HEX.faint : colored ? color : HEX.dim }}
      >
        {offline ? `${data.label} · OFFLINE` : data.label}
      </span>
    </div>
  );
}

/* ── Link with optional traveling packet ────────────────────────────────── */
interface DataEdgeData extends Record<string, unknown> {
  status: SwarmLink["status"];
  active: boolean;
  selected: boolean;
  confidence: number;
  attack: boolean;
  dead: boolean;
}
type DataEdge = Edge<DataEdgeData, "data">;

function DataEdge({ sourceX, sourceY, targetX, targetY, data }: EdgeProps<DataEdge>) {
  const [path, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  const status = data?.status ?? "healthy";
  const active = data?.active ?? false;
  const selected = data?.selected ?? false;
  const confidence = data?.confidence ?? 0;
  const attack = data?.attack ?? false;
  const dead = data?.dead ?? false; // link to a cut-off drone: no traffic crosses
  const color = linkColor(status);
  const jammed = status === "jammed";
  const rerouted = status === "rerouted";

  // a dead link (leads to an isolated drone) is drawn faint + static, no packet
  if (dead && !jammed) {
    return (
      <BaseEdge
        path={path}
        style={{ stroke: "#26262c", strokeWidth: 1, opacity: 0.5, strokeDasharray: "2 5" }}
      />
    );
  }

  const width = (jammed ? 1.8 : rerouted ? 2.8 : 1.1) + (selected ? 1 : 0);
  const opacity = jammed || rerouted ? 1 : active ? 0.6 : 0.42;

  // always-on traffic: every link carries a packet so the swarm reads "alive".
  const packetColor = jammed ? HEX.red : rerouted ? HEX.green : active ? HEX.dim : "#52525b";
  const packetOpacity = jammed || rerouted ? 1 : active ? 0.6 : 0.32;
  const dur = jammed ? "0.8s" : rerouted ? "0.7s" : active ? "2s" : "3s";

  // per-link confidence label, shown for every link every tick
  const labelColor = jammed ? HEX.red : rerouted ? HEX.green : HEX.faint;

  return (
    <>
      <BaseEdge
        path={path}
        className={jammed ? "edge-jammed" : rerouted ? "edge-reroute" : undefined}
        style={{
          stroke: jammed || rerouted ? color : "#3a3a44",
          strokeWidth: width,
          opacity,
          filter: jammed
            ? "drop-shadow(0 0 4px #ff3b5c)"
            : rerouted
              ? "drop-shadow(0 0 8px #2ee27a)"
              : undefined,
        }}
      />
      <circle r={rerouted ? 3 : 1.7} fill={packetColor} opacity={packetOpacity}>
        <animateMotion dur={dur} repeatCount="indefinite" path={path} />
      </circle>
      <EdgeLabelRenderer>
        <div
          className="mono pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 tabular-nums"
          style={{
            left: labelX,
            top: labelY,
            fontSize: "0.55rem",
            color: labelColor,
            fontWeight: attack ? 700 : 400,
            opacity: jammed || rerouted ? 1 : 0.7,
            textShadow: "0 0 4px #000, 0 0 4px #000",
          }}
        >
          {Math.round(confidence * 100)}%
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const nodeTypes = { drone: DroneNode };
const edgeTypes = { data: DataEdge };

/* Topographic terrain field: procedural elevation tint + contour lines (SVG
   turbulence), drifting slowly so the swarm reads as flying over the ground. */
function MapField() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {/* terrain (oversized + slowly drifting) */}
      <svg
        className="terrain-drift absolute"
        style={{ left: "-15%", top: "-15%", width: "130%", height: "130%", opacity: 0.7 }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* soft elevation mass for depth */}
          <filter id="terrain-mass" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.0055"
              numOctaves={4}
              seed={27}
              stitchTiles="stitch"
              result="n"
            />
            <feColorMatrix
              in="n"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.6 0 0 0 -0.18"
              result="a"
            />
            <feFlood floodColor="#0a130e" result="c" />
            <feComposite in="c" in2="a" operator="in" />
          </filter>
          {/* thin iso-contour lines: step the height into elevation bands, then
              edge-detect the band boundaries so lines stay uniformly thin. */}
          <filter id="terrain-lines" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.0055"
              numOctaves={4}
              seed={27}
              stitchTiles="stitch"
              result="n"
            />
            <feColorMatrix
              in="n"
              type="matrix"
              values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0 1"
              result="gray"
            />
            <feComponentTransfer in="gray" result="stepped">
              <feFuncR type="discrete" tableValues="0 .1 .2 .3 .4 .5 .6 .7 .8 .9 1" />
              <feFuncG type="discrete" tableValues="0 .1 .2 .3 .4 .5 .6 .7 .8 .9 1" />
              <feFuncB type="discrete" tableValues="0 .1 .2 .3 .4 .5 .6 .7 .8 .9 1" />
            </feComponentTransfer>
            <feConvolveMatrix
              in="stepped"
              order="3"
              preserveAlpha="true"
              kernelMatrix="0 -1 0 -1 4 -1 0 -1 0"
              result="edges"
            />
            <feColorMatrix
              in="edges"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 1 1 0 0"
              result="lineAlpha"
            />
            <feFlood floodColor="#2ee27a" result="line" />
            <feComposite in="line" in2="lineAlpha" operator="in" />
          </filter>
        </defs>
        <rect width="100%" height="100%" filter="url(#terrain-mass)" opacity={0.5} />
        <rect width="100%" height="100%" filter="url(#terrain-lines)" opacity={0.4} />
      </svg>

      {/* vignette to focus the swarm */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(125% 125% at 50% 47%, transparent 36%, rgba(3,7,11,0.92) 100%)",
        }}
      />
    </div>
  );
}

/* ── Selection detail card ──────────────────────────────────────────────── */
function DetailCard({ state, selected }: { state: StateMessage | null; selected: Selection }) {
  if (!selected || !state) return null;

  if (selected.kind === "link") {
    const link = state.links.find((l) => l.id === selected.id);
    if (!link) return null;
    const attack = !!link.prediction.attack_type;
    const color = link.status === "jammed" ? HEX.red : link.status === "rerouted" ? HEX.green : HEX.ink;
    return (
      <Card title={`Link ${link.id}`} color={color} status={link.status}>
        <Stat label="Class" value={link.prediction.label} color={attack ? HEX.red : HEX.green} />
        <Stat label="Confidence" value={`${Math.round(link.prediction.confidence * 100)}%`} />
        <Stat label="Path" value={`${link.source} → ${link.target}`} />
      </Card>
    );
  }

  const node = state.nodes.find((n) => n.id === selected.id);
  if (!node) return null;
  const incident = state.links.filter((l) => l.source === node.id || l.target === node.id);
  const jammed = incident.filter((l) => l.status === "jammed").length;
  const color = node.status === "attacked" ? HEX.red : node.status === "defending" ? HEX.green : HEX.ink;
  return (
    <Card title={`Drone ${node.id}`} color={color} status={node.status}>
      <Stat label="Links" value={String(incident.length)} />
      <Stat label="Compromised" value={String(jammed)} color={jammed ? HEX.red : undefined} />
    </Card>
  );
}

function Card({
  title,
  color,
  status,
  children,
}: {
  title: string;
  color: string;
  status: string;
  children: React.ReactNode;
}) {
  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-20 w-56 rounded-lg border border-line bg-panel/95 p-3 backdrop-blur">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-ink">{title}</span>
        <span
          className="rounded px-1.5 py-0.5 text-[0.6rem] font-medium capitalize"
          style={{ color, border: `1px solid ${color}44` }}
        >
          {status}
        </span>
      </div>
      <div className="mt-2.5 space-y-1.5">{children}</div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="label-xs">{label}</span>
      <span className="text-xs font-medium" style={{ color: color ?? HEX.ink }}>
        {value}
      </span>
    </div>
  );
}

interface Props {
  state: StateMessage | null;
  selected: Selection;
  onSelect: (sel: Selection) => void;
  isolated: Set<string>;
}

export function SwarmMap({ state, selected, onSelect, isolated }: Props) {
  const nodes: DroneNode[] = useMemo(() => {
    return (state?.nodes ?? []).map((n) => ({
      id: n.id,
      type: "drone",
      position: { x: n.x * CANVAS_W, y: n.y * CANVAS_H },
      data: {
        label: n.id,
        status: n.status,
        selected: selected?.kind === "node" && selected.id === n.id,
        isolated: isolated.has(n.id),
      },
      draggable: false,
    }));
  }, [state?.nodes, selected, isolated]);

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
        confidence: l.prediction.confidence,
        attack: !!l.prediction.attack_type,
        dead: isolated.has(l.source) || isolated.has(l.target),
      },
    }));
  }, [state?.links, selected, isolated]);

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
      <div className="pointer-events-none absolute left-4 top-3 z-20 panel-title">Swarm Map</div>
      <div className="pointer-events-none absolute right-4 top-3 z-20 flex items-center gap-2 text-[0.68rem]">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: hostiles ? HEX.red : HEX.green }} />
        <span style={{ color: hostiles ? HEX.red : HEX.dim }}>
          {hostiles ? `${hostiles} contact${hostiles > 1 ? "s" : ""}` : "All nominal"}
        </span>
      </div>

      <MapField />

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
          fitViewOptions={{ padding: 0.16 }}
          nodesDraggable={false}
          nodesConnectable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          proOptions={{ hideAttribution: true }}
        />
      </div>

      <DetailCard state={state} selected={selected} />
    </HudFrame>
  );
}
