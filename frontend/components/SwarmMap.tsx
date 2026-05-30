// frontend/components/SwarmMap.tsx
// The plot. A hex swarm formation on a framed dark field. Calm and neutral by
// default; color enters only with state — red when jammed/hacked, green along
// the healed reroute. Click to select; a detail card shows the live ML readout.
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  type OnNodesChange,
<<<<<<< HEAD
  type Viewport,
  type XYPosition,
=======
  type ReactFlowInstance,
>>>>>>> interactivity
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { motion } from "framer-motion";
import type { StateMessage, SwarmLink, SwarmNode } from "@/lib/types";
import { HEX, linkColor, nodeColor, riskGlow } from "@/lib/palette";
import { computeRisk } from "@/lib/risk";
import { audio } from "@/lib/audio";
import { HudFrame } from "@/components/Hud";
import type { Selection } from "@/lib/ws";
import { computeRisk } from "@/lib/risk";
import { useAudioCues } from "@/lib/audio";

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

function SpeakerIcon({ on }: { on: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" stroke="none" />
      {on ? (
        <>
          <path d="M16 8.5a5 5 0 0 1 0 7" />
          <path d="M18.5 6a8 8 0 0 1 0 12" />
        </>
      ) : (
        <path d="M16 9l5 6M21 9l-5 6" />
      )}
    </svg>
  );
}

/* ── Drone marker ───────────────────────────────────────────────────────── */
interface DroneData extends Record<string, unknown> {
  label: string;
  status: SwarmNode["status"];
  selected: boolean;
  isolated: boolean;
<<<<<<< HEAD
  risk: number; // 0..1 how attack-like this drone's traffic has trended
  predicted: boolean; // flagged as the likely next target
=======
  combat: boolean;
  risk: number; // 0..1 attack-likeness of this drone's neighbourhood
>>>>>>> interactivity
}
type DroneNode = Node<DroneData, "drone">;

function DroneNode({ data }: NodeProps<DroneNode>) {
  const threat = data.status === "attacked";
  // a cut-off (isolated) drone reads as offline: dark, dashed, no glow
  const offline = data.isolated && !threat;
  const color = offline ? HEX.faint : nodeColor(data.status);
  const colored = !offline && data.status !== "healthy";
  const ringColor = offline ? HEX.faint : colored ? color : HEX.node;
  // risk heatmap: a soft halo whose hue/intensity tracks rising danger. Suppressed
  // once a drone is already attacked (the threat ring takes over) or offline.
  const glow = offline || threat ? null : riskGlow(data.risk);

  // risk heat: a healthy drone whose neighbourhood is turning attack-like glows
  // amber — danger you can see BEFORE it lands. Suppressed once it's actually red.
  const risk = data.risk ?? 0;
  const showRisk = !offline && !threat && risk >= 0.18;

  return (
    <div className="relative grid place-items-center" style={{ opacity: offline ? 0.7 : 1 }}>
      <Handle type="target" position={Position.Top} style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />

<<<<<<< HEAD
      {glow && (
        <motion.span
          className="pointer-events-none absolute rounded-full"
          initial={false}
          animate={{ opacity: data.predicted ? [0.7, 1, 0.7] : 1 }}
          transition={data.predicted ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" } : { duration: 0.4 }}
          style={{
            height: 56,
            width: 56,
            background: `radial-gradient(circle, ${glow.color}${Math.round(glow.alpha * 255).toString(16).padStart(2, "0")} 0%, transparent 70%)`,
=======
      <div className={offline ? "grid place-items-center" : "drone-hover grid place-items-center"} style={hoverStyle}>
        {showRisk && (
          <>
            <span
              className="pointer-events-none absolute rounded-full"
              style={{
                width: 34 + risk * 30,
                height: 34 + risk * 30,
                background: `radial-gradient(circle, ${HEX.amber}40 0%, transparent 70%)`,
                opacity: 0.35 + risk * 0.5,
              }}
            />
            {risk >= 0.4 && (
              <span
                className="risk-pulse pointer-events-none absolute rounded-full"
                style={{ width: 44, height: 44, border: `1px solid ${HEX.amber}`, opacity: risk * 0.7 }}
              />
            )}
          </>
        )}
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
>>>>>>> interactivity
          }}
        />
      )}
      {data.predicted && !threat && (
        <span
          className="pointer-events-none absolute -top-[22px] whitespace-nowrap rounded px-1 text-[0.5rem] font-semibold uppercase tracking-wide"
          style={{ color: HEX.amber, border: `1px solid ${HEX.amber}66`, background: "#1a1206cc" }}
        >
          ◎ next target
        </span>
      )}

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

/* ── Traveling packet ───────────────────────────────────────────────────────
   A packet rides the link path. `drop` makes it stall ~60% across and die — the
   visible consequence of a jam: data that pushes toward the wall, piles up, and
   never arrives. Healthy/rerouted packets just flow clean through. */
function Packet({
  path,
  color,
  r,
  dur,
  begin,
  drop,
  opacity = 1,
}: {
  path: string;
  color: string;
  r: number;
  dur: string;
  begin?: string;
  drop?: boolean;
  opacity?: number;
}) {
  const style = { filter: `drop-shadow(0 0 3px ${color})` } as const;
  if (drop) {
    return (
      <circle r={r} fill={color} style={style}>
        <animateMotion
          dur={dur}
          begin={begin}
          repeatCount="indefinite"
          path={path}
          calcMode="linear"
          keyPoints="0;0.6;0.6"
          keyTimes="0;0.6;1"
        />
        {/* swell toward the jam, then snuff out at the wall */}
        <animate attributeName="opacity" dur={dur} begin={begin} repeatCount="indefinite" values="0;1;1;0;0" keyTimes="0;0.15;0.5;0.62;1" />
        <animate attributeName="r" dur={dur} begin={begin} repeatCount="indefinite" values={`${r};${r};0;0`} keyTimes="0;0.5;0.62;1" />
      </circle>
    );
  }
  return (
    <circle r={r} fill={color} opacity={opacity} style={style}>
      <animateMotion dur={dur} begin={begin} repeatCount="indefinite" path={path} />
    </circle>
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
  const mx = (sourceX + targetX) / 2; // break point — where jammed traffic dies
  const my = (sourceY + targetY) / 2;
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

  // jam blockade marker: a pulsing red knot ~60% along the link where packets
  // pile up and drop, so the eye sees WHERE traffic is failing.
  const wallX = sourceX + 0.6 * (targetX - sourceX);
  const wallY = sourceY + 0.6 * (targetY - sourceY);

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
<<<<<<< HEAD
      {jammed ? (
        <>
          {/* a queue of packets that push toward the jam, pile up, and drop */}
          <Packet path={path} color={HEX.red} r={2.4} dur="1.1s" begin="0s" drop />
          <Packet path={path} color={HEX.red} r={2.4} dur="1.1s" begin="-0.37s" drop />
          <Packet path={path} color={HEX.red} r={2.4} dur="1.1s" begin="-0.74s" drop />
          {/* the blockade itself */}
          <circle cx={wallX} cy={wallY} r={3} fill={HEX.red} style={{ filter: `drop-shadow(0 0 4px ${HEX.red})` }}>
            <animate attributeName="opacity" dur="0.7s" repeatCount="indefinite" values="0.4;1;0.4" />
            <animate attributeName="r" dur="0.7s" repeatCount="indefinite" values="2.5;4;2.5" />
          </circle>
        </>
      ) : rerouted ? (
        <>
          {/* healing path: bright green data flows fast through the new route */}
          <Packet path={path} color={HEX.green} r={3} dur="0.7s" begin="0s" />
          <Packet path={path} color={HEX.green} r={3} dur="0.7s" begin="-0.35s" />
        </>
      ) : (
        <Packet path={path} color="#4fae86" r={active ? 2.3 : 1.9} dur={active ? "1.5s" : "2.4s"} opacity={active ? 0.9 : 0.55} />
=======

      {/* traffic packets — healthy/rerouted links carry flow across; on a jammed
          link the packets stream toward the break and DIE there (drop), so the
          eye reads traffic failing, not just a colour change. */}
      {jammed ? (
        <>
          {!reduced &&
            [0, -0.45].map((begin, i) => (
              <circle
                key={`fail-${i}`}
                r={2}
                fill={HEX.red}
                opacity={0}
                style={{ filter: `drop-shadow(0 0 3px ${HEX.red})` }}
              >
                <animateMotion
                  dur="0.9s"
                  begin={`${begin}s`}
                  repeatCount="indefinite"
                  path={path}
                  keyPoints="0;0.5"
                  keyTimes="0;1"
                  calcMode="linear"
                />
                <animate
                  attributeName="opacity"
                  dur="0.9s"
                  begin={`${begin}s`}
                  repeatCount="indefinite"
                  values="0;0.9;0.9;0"
                  keyTimes="0;0.25;0.8;1"
                />
              </circle>
            ))}
          {/* the break itself: packets pile up and burst at the jam point */}
          <circle cx={mx} cy={my} r={2} fill={HEX.red} style={{ filter: `drop-shadow(0 0 4px ${HEX.red})` }}>
            {!reduced && <animate attributeName="r" values="1.5;3.6;1.5" dur="0.7s" repeatCount="indefinite" />}
            {!reduced && <animate attributeName="opacity" values="0.5;1;0.5" dur="0.7s" repeatCount="indefinite" />}
          </circle>
        </>
      ) : (
        <circle
          r={packetR}
          fill={packetColor}
          opacity={packetOpacity}
          style={{ filter: `drop-shadow(0 0 3px ${packetColor})`, transition: "opacity 0.4s ease" }}
        >
          <animateMotion dur={dur} repeatCount="indefinite" path={path} />
        </circle>
      )}

      {/* heal sweep: bright comet runs the new route once, staggered by hop */}
      {rerouted && !reduced && (
        <circle
          key={`heal-${id}-${seq}`}
          r={4.5}
          fill={HEX.green}
          opacity={0}
          style={{ filter: `drop-shadow(0 0 6px ${HEX.green})` }}
        >
          <animateMotion dur="0.55s" begin={`${hopDelay}s`} repeatCount="1" path={path} fill="freeze" />
          <animate
            attributeName="opacity"
            values="1;1;0"
            keyTimes="0;0.75;1"
            dur="0.55s"
            begin={`${hopDelay}s`}
            repeatCount="1"
            fill="freeze"
          />
        </circle>
>>>>>>> interactivity
      )}
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

/* Topographic terrain: hillshaded relief (diffuse lighting on a procedural
   height field) for real depth, plus thin iso-contour lines on top. Two stacked,
   identical, self-tiling tiles scroll continuously DOWNWARD so the swarm reads as
   flying forward over passing ground — the loop is seamless because the tiles match. */
function TerrainTile() {
  return (
    <svg className="block h-1/2 w-full" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" filter="url(#skein-terrain)" />
    </svg>
  );
}

function MapField() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {/* shared terrain filter */}
      <svg width="0" height="0" className="absolute" aria-hidden>
        <defs>
          <filter id="skein-terrain" x="0" y="0" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.004"
              numOctaves={5}
              seed={11}
              stitchTiles="stitch"
              result="noise"
            />
            {/* height map (alpha) drives the lighting bump */}
            <feColorMatrix
              in="noise"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0"
              result="height"
            />
            {/* shaded relief = depth + elevation */}
            <feDiffuseLighting
              in="height"
              surfaceScale="6"
              diffuseConstant="1"
              lightingColor="#1a6248"
              result="relief"
            >
              <feDistantLight azimuth="235" elevation="44" />
            </feDiffuseLighting>
            {/* contour lines: step height into bands then edge-detect boundaries */}
            <feColorMatrix
              in="noise"
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
              edgeMode="wrap"
              kernelMatrix="0 -1 0 -1 4 -1 0 -1 0"
              result="edges"
            />
            <feColorMatrix
              in="edges"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 1 1 0 0"
              result="lineAlpha"
            />
            <feFlood floodColor="#5affb0" result="line" />
            <feComposite in="line" in2="lineAlpha" operator="in" result="lines" />
            {/* relief (dimmed) under the contour lines */}
            <feComponentTransfer in="relief" result="reliefDim">
              <feFuncA type="linear" slope="0.55" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode in="reliefDim" />
              <feMergeNode in="lines" />
            </feMerge>
          </filter>
        </defs>
      </svg>

      {/* two identical tiles, scrolling down for a forward-flight feel */}
      <div className="terrain-scroll absolute inset-x-0 top-0" style={{ height: "200%", opacity: 0.4 }}>
        <TerrainTile />
        <TerrainTile />
      </div>

      {/* vignette to focus the swarm */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(125% 125% at 50% 47%, transparent 34%, rgba(3,7,11,0.93) 100%)",
        }}
      />
    </div>
  );
}

/* ── Hover tooltip ──────────────────────────────────────────────────────────
   Live readout that follows the cursor: a drone shows status / risk / current
   throughput; a link shows the detector's verdict, confidence, and the raw CIC
   numbers it scored this tick. Everything is read straight from live state. */
type Hover = { kind: "node" | "link"; id: string; x: number; y: number };

function fmt(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return n >= 100 ? Math.round(n).toString() : n.toFixed(1);
}

function HoverTip({
  hover,
  state,
  risk,
  isolated,
}: {
  hover: Hover | null;
  state: StateMessage | null;
  risk: Map<string, number>;
  isolated: Set<string>;
}) {
  if (!hover || !state) return null;
  // flip to the left when near the right edge so the tip never clips off-screen
  const vw = typeof window !== "undefined" ? window.innerWidth : 1920;
  const flip = hover.x > vw - 230;
  const style: React.CSSProperties = {
    left: flip ? hover.x - 14 : hover.x + 14,
    top: hover.y + 14,
    transform: flip ? "translateX(-100%)" : undefined,
  };

  let title: string;
  let accent: string;
  let rows: { label: string; value: string; color?: string }[];

  if (hover.kind === "node") {
    const node = state.nodes.find((n) => n.id === hover.id);
    if (!node) return null;
    const incident = state.links.filter((l) => l.source === node.id || l.target === node.id);
    const throughput = incident
      .filter((l) => l.active && l.status !== "jammed")
      .reduce((s, l) => s + (l.features.flow_packets_s ?? 0), 0);
    const jammed = incident.filter((l) => l.status === "jammed").length;
    const r = Math.round((risk.get(node.id) ?? 0) * 100);
    const off = isolated.has(node.id) && node.status !== "attacked";
    const statusLabel = off ? "isolated" : node.status;
    accent =
      node.status === "attacked" ? HEX.red : node.status === "defending" ? HEX.green : off ? HEX.faint : HEX.ink;
    title = `Drone ${node.id}`;
    rows = [
      { label: "Status", value: statusLabel, color: accent },
      { label: "Risk", value: `${r}%`, color: r >= 65 ? HEX.red : r >= 35 ? HEX.amber : HEX.dim },
      { label: "Throughput", value: `${fmt(throughput)} pkt/s` },
      { label: "Links", value: `${incident.length}${jammed ? ` · ${jammed} jammed` : ""}`, color: jammed ? HEX.red : undefined },
    ];
  } else {
    const link = state.links.find((l) => l.id === hover.id);
    if (!link) return null;
    const attack = !!link.prediction.attack_type;
    accent = link.status === "jammed" ? HEX.red : link.status === "rerouted" ? HEX.green : HEX.ink;
    title = `Link ${link.id}`;
    rows = [
      { label: "Verdict", value: link.prediction.label, color: attack ? HEX.red : HEX.green },
      { label: "Confidence", value: `${Math.round(link.prediction.confidence * 100)}%` },
      { label: "Flow pkts/s", value: fmt(link.features.flow_packets_s ?? 0) },
      { label: "Flow bytes/s", value: fmt(link.features.flow_bytes_s ?? 0) },
      { label: "Fwd packets", value: fmt(link.features.total_fwd_packets ?? 0) },
    ];
  }

  return (
    <div
      className="pointer-events-none fixed z-50 w-[190px] rounded-md border bg-panel/95 p-2.5 backdrop-blur"
      style={{ ...style, borderColor: `${accent}55` }}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold text-ink">{title}</span>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
      </div>
      <div className="space-y-1">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between">
            <span className="label-xs">{row.label}</span>
            <span className="mono text-[0.68rem] capitalize tabular-nums" style={{ color: row.color ?? HEX.ink }}>
              {row.value}
            </span>
          </div>
        ))}
      </div>
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

<<<<<<< HEAD
/* ── Auto-focus pulse ───────────────────────────────────────────────────────
   When an attack lands, an expanding ring blooms at exactly that spot so the
   judge's eye is pulled to the action before they even read the event feed. */
interface Pulse {
  key: number;
  x: number; // flow coords
  y: number;
}

function FocusPulse({ pulse, viewport }: { pulse: Pulse; viewport: Viewport }) {
  const left = pulse.x * viewport.zoom + viewport.x;
  const top = pulse.y * viewport.zoom + viewport.y;
  return (
    <div className="pointer-events-none absolute" style={{ left, top }}>
      {[0, 0.22].map((delay) => (
        <motion.span
          key={delay}
          className="absolute rounded-full"
          style={{ width: 110, height: 110, marginLeft: -55, marginTop: -55, border: `2px solid ${HEX.red}` }}
          initial={{ scale: 0.12, opacity: 0.85 }}
          animate={{ scale: 1, opacity: 0 }}
          transition={{ duration: 1.4, ease: "easeOut", delay }}
        />
      ))}
      <motion.span
        className="absolute"
        style={{ marginLeft: -55, marginTop: -55 }}
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: [0, 1, 0] }}
        transition={{ duration: 1.2, ease: "easeOut" }}
      >
        <span className="block -translate-x-1/2 -translate-y-[26px] whitespace-nowrap text-[0.6rem] font-semibold uppercase tracking-wide" style={{ color: HEX.red }}>
          ⚠ contact
        </span>
      </motion.span>
=======
/* ── Hover tooltip ──────────────────────────────────────────────────────────
   Ephemeral card that follows the cursor. Drone → status / risk / live traffic;
   link → verdict / confidence / the raw features driving it. Reads straight off
   the live state so the numbers are always the ones the detector just scored. */
type Hover = { kind: "node" | "link"; id: string; x: number; y: number };

function fmtNum(v: number): string {
  if (!isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  if (a >= 100) return v.toFixed(0);
  if (a >= 1) return v.toFixed(1);
  return v.toFixed(2);
}

function prettyFeature(key: string): string {
  return key.replace(/_/g, " ").replace(/\bs\b/, "/s");
}

function riskColor(risk: number): string {
  return risk >= 0.55 ? HEX.red : risk >= 0.18 ? HEX.amber : HEX.dim;
}

function HoverTip({
  hover,
  state,
  riskMap,
}: {
  hover: Hover | null;
  state: StateMessage | null;
  riskMap: Map<string, number>;
}) {
  if (!hover || !state) return null;

  // place the card near the cursor, flipping to stay inside the viewport
  const flipX = typeof window !== "undefined" && hover.x > window.innerWidth - 260;
  const flipY = typeof window !== "undefined" && hover.y > window.innerHeight - 180;
  const style: React.CSSProperties = {
    position: "fixed",
    left: hover.x + (flipX ? -16 : 16),
    top: hover.y + (flipY ? -12 : 16),
    transform: `translate(${flipX ? "-100%" : "0"}, ${flipY ? "-100%" : "0"})`,
    zIndex: 50,
  };

  let title = "";
  let badge = "";
  let badgeColor: string = HEX.ink;
  const rows: { label: string; value: string; color?: string }[] = [];

  if (hover.kind === "link") {
    const link = state.links.find((l) => l.id === hover.id);
    if (!link) return null;
    const attack = !!link.prediction.attack_type;
    title = `Link ${link.source}–${link.target}`;
    badge = link.status;
    badgeColor =
      link.status === "jammed" ? HEX.red : link.status === "rerouted" ? HEX.green : HEX.dim;
    rows.push({
      label: "Verdict",
      value: link.prediction.label,
      color: attack ? HEX.red : HEX.green,
    });
    rows.push({ label: "Confidence", value: `${Math.round(link.prediction.confidence * 100)}%` });
    // a few raw features — the ones the detector leaned on, else key flow stats
    const feats = link.features ?? {};
    const keys = (link.reasons ?? []).map((r) => r.feature).filter((k) => k in feats);
    const shown = (keys.length ? keys : ["flow_packets_s", "total_fwd_packets", "flow_bytes_s"]).slice(0, 3);
    for (const k of shown) {
      if (k in feats) rows.push({ label: prettyFeature(k), value: fmtNum(feats[k]) });
    }
  } else {
    const node = state.nodes.find((n) => n.id === hover.id);
    if (!node) return null;
    const incident = state.links.filter((l) => l.source === node.id || l.target === node.id);
    const jammed = incident.filter((l) => l.status === "jammed").length;
    const live = incident.filter((l) => l.active).length;
    const risk = riskMap.get(node.id) ?? 0;
    title = `Drone ${node.id}`;
    badge = node.status;
    badgeColor =
      node.status === "attacked" ? HEX.red : node.status === "defending" ? HEX.green : HEX.dim;
    rows.push({ label: "Risk", value: `${Math.round(risk * 100)}%`, color: riskColor(risk) });
    rows.push({ label: "Live traffic", value: `${live}/${incident.length} links` });
    if (jammed > 0) rows.push({ label: "Under attack", value: `${jammed} link${jammed > 1 ? "s" : ""}`, color: HEX.red });
  }

  return (
    <div
      className="pointer-events-none w-[220px] rounded-lg border border-line bg-panel/95 p-2.5 shadow-xl backdrop-blur"
      style={style}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-ink">{title}</span>
        <span
          className="rounded px-1.5 py-0.5 text-[0.55rem] font-medium capitalize"
          style={{ color: badgeColor, border: `1px solid ${badgeColor}44` }}
        >
          {badge}
        </span>
      </div>
      <div className="mono mt-2 space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3">
            <span className="label-xs normal-case tracking-normal">{r.label}</span>
            <span className="text-[0.7rem] tabular-nums" style={{ color: r.color ?? HEX.ink }}>
              {r.value}
            </span>
          </div>
        ))}
      </div>
>>>>>>> interactivity
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
  const risk = useMemo(() => computeRisk(state), [state]);

<<<<<<< HEAD
  // Drag overrides: once a judge moves a drone, its position is theirs to keep —
  // we hold the dragged coords here so the per-tick state stream doesn't snap it
  // back. Links recompute from live node positions, so they follow the hand.
  const [positions, setPositions] = useState<Record<string, XYPosition>>({});
  const onNodesChange = useCallback<OnNodesChange<DroneNode>>((changes) => {
    setPositions((prev) => {
      let next = prev;
      for (const c of changes) {
        if (c.type === "position" && c.position) {
          if (next === prev) next = { ...prev };
          next[c.id] = c.position;
        }
      }
      return next;
=======
  const hostiles = state?.links.filter((l) => l.status === "jammed").length ?? 0;
  const combat = hostiles > 0;
  const hopDelays = useMemo(() => computeHopDelays(state?.links ?? []), [state?.links]);
  const riskMap = useMemo(() => computeRisk(state), [state]);

  // manual drag positions — judges can grab and rearrange the formation; the
  // override sticks across the 1s state ticks so a dragged drone stays put.
  const [posOverride, setPosOverride] = useState<Map<string, { x: number; y: number }>>(new Map());
  const draggingRef = useRef(false);
  const onNodesChange = useCallback<OnNodesChange<DroneNode>>((changes) => {
    setPosOverride((prev) => {
      let next: Map<string, { x: number; y: number }> | null = null;
      for (const c of changes) {
        if (c.type === "position") {
          if (c.dragging !== undefined) draggingRef.current = c.dragging;
          if (c.position) {
            if (!next) next = new Map(prev);
            next.set(c.id, c.position);
          }
        }
      }
      return next ?? prev;
>>>>>>> interactivity
    });
  }, []);

  const nodes: DroneNode[] = useMemo(() => {
    return (state?.nodes ?? []).map((n) => {
      const ov = posOverride.get(n.id);
      return {
      id: n.id,
      type: "drone",
<<<<<<< HEAD
      position: positions[n.id] ?? { x: n.x * CANVAS_W, y: n.y * CANVAS_H },
=======
      position: ov ?? { x: n.x * CANVAS_W, y: n.y * CANVAS_H },
>>>>>>> interactivity
      data: {
        label: n.id,
        status: n.status,
        selected: selected?.kind === "node" && selected.id === n.id,
        isolated: isolated.has(n.id),
<<<<<<< HEAD
        risk: risk.byNode.get(n.id) ?? 0,
        predicted: risk.predicted === n.id,
      },
      draggable: true,
    }));
  }, [state?.nodes, selected, isolated, risk, positions]);
=======
        combat,
        risk: riskMap.get(n.id) ?? 0,
      },
      draggable: true,
      };
    });
  }, [state?.nodes, selected, isolated, combat, riskMap, posOverride]);
>>>>>>> interactivity

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

  // Live flow-space position of every drone (honoring drag overrides), so the
  // auto-focus pulse can be placed exactly where the attack landed.
  const flowPos = useMemo(() => {
    const m = new Map<string, XYPosition>();
    for (const n of state?.nodes ?? []) {
      m.set(n.id, positions[n.id] ?? { x: n.x * CANVAS_W, y: n.y * CANVAS_H });
    }
    return m;
  }, [state?.nodes, positions]);

  // Track the React Flow viewport so overlays (pulses) line up with the canvas
  // through fitView / zoom.
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });

  // Auto-focus: detect attacks that are NEW since last tick and bloom a pulse at
  // each. We diff against the previous set so an ongoing attack doesn't re-pulse.
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const prevAttacks = useRef<Set<string>>(new Set());
  const pulseSeq = useRef(0);
  useEffect(() => {
    if (!state) return;
    const current = new Set<string>();
    const fresh: XYPosition[] = [];
    for (const l of state.links) {
      if (l.status !== "jammed") continue;
      const key = `L:${l.id}`;
      current.add(key);
      if (!prevAttacks.current.has(key)) {
        const a = flowPos.get(l.source);
        const b = flowPos.get(l.target);
        if (a && b) fresh.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      }
    }
    for (const n of state.nodes) {
      if (n.status !== "attacked") continue;
      const key = `N:${n.id}`;
      current.add(key);
      if (!prevAttacks.current.has(key)) {
        const p = flowPos.get(n.id);
        if (p) fresh.push({ x: p.x, y: p.y });
      }
    }
    prevAttacks.current = current;
    if (fresh.length === 0) return;

    audio.detection(); // a fresh contact just landed
    const added = fresh.map((p) => ({ key: pulseSeq.current++, x: p.x, y: p.y }));
    setPulses((prev) => [...prev, ...added]);
    const keys = new Set(added.map((p) => p.key));
    const timer = window.setTimeout(
      () => setPulses((prev) => prev.filter((p) => !keys.has(p.key))),
      1700,
    );
    return () => window.clearTimeout(timer);
  }, [state, flowPos]);

  // Audio cue when the cut-off (isolated) set grows — a drone just went dark.
  const prevIsolated = useRef(0);
  useEffect(() => {
    if (isolated.size > prevIsolated.current) audio.isolation();
    prevIsolated.current = isolated.size;
  }, [isolated]);

  // Mute toggle (starts muted; clicking it is the gesture that unlocks audio).
  const [muted, setMuted] = useState(true);
  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      audio.setMuted(next);
      return next;
    });
  }, []);

  // auto-focus the action: when a fresh attack lands, glide the camera onto it
  // so attention goes where it matters; when the swarm is clean again, re-frame
  // the whole formation. Never fights an in-progress drag.
  const rfRef = useRef<ReactFlowInstance<DroneNode, DataEdge> | null>(null);
  const prevJammed = useRef<Set<string>>(new Set());
  useEffect(() => {
    const rf = rfRef.current;
    const links = state?.links ?? [];
    const jammed = new Set(links.filter((l) => l.status === "jammed").map((l) => l.id));
    const fresh = [...jammed].filter((id) => !prevJammed.current.has(id));
    const cleared = prevJammed.current.size > 0 && jammed.size === 0;
    prevJammed.current = jammed;
    if (!rf || draggingRef.current) return;

    if (fresh.length > 0) {
      // centroid of the newly-hit links' endpoints (respecting any manual drag)
      const pos = (id: string) => {
        const ov = posOverride.get(id);
        if (ov) return ov;
        const n = state?.nodes.find((m) => m.id === id);
        return n ? { x: n.x * CANVAS_W, y: n.y * CANVAS_H } : null;
      };
      let sx = 0, sy = 0, k = 0;
      for (const id of fresh) {
        const l = links.find((m) => m.id === id);
        if (!l) continue;
        for (const end of [l.source, l.target]) {
          const p = pos(end);
          if (p) { sx += p.x; sy += p.y; k++; }
        }
      }
      if (k > 0) rf.setCenter(sx / k, sy / k, { zoom: 1.15, duration: 600 });
    } else if (cleared) {
      rf.fitView({ padding: 0.16, duration: 700 });
    }
  }, [state?.links, state?.nodes, posOverride]);

  const onNodeClick = useCallback<NodeMouseHandler>(
    (_e, node) => onSelect({ kind: "node", id: node.id }),
    [onSelect],
  );
  const onEdgeClick = useCallback<EdgeMouseHandler<DataEdge>>(
    (_e, edge) => onSelect({ kind: "link", id: edge.id }),
    [onSelect],
  );
  const onPaneClick = useCallback(() => onSelect(null), [onSelect]);

<<<<<<< HEAD
  // Hover tooltips: a live readout that tracks the cursor over drones and links.
  const [hover, setHover] = useState<Hover | null>(null);
  const onNodeHover = useCallback<NodeMouseHandler>(
    (e, node) => setHover({ kind: "node", id: node.id, x: e.clientX, y: e.clientY }),
    [],
  );
  const onEdgeHover = useCallback<EdgeMouseHandler<DataEdge>>(
=======
  // hover tooltips — follow the cursor while over a drone or link
  const [hover, setHover] = useState<Hover | null>(null);
  const onNodeEnter = useCallback<NodeMouseHandler>(
    (e, node) => setHover({ kind: "node", id: node.id, x: e.clientX, y: e.clientY }),
    [],
  );
  const onEdgeEnter = useCallback<EdgeMouseHandler<DataEdge>>(
>>>>>>> interactivity
    (e, edge) => setHover({ kind: "link", id: edge.id, x: e.clientX, y: e.clientY }),
    [],
  );
  const clearHover = useCallback(() => setHover(null), []);
<<<<<<< HEAD

  const hostiles = state?.links.filter((l) => l.status === "jammed").length ?? 0;
=======
  const onHoverMove = useCallback(
    (e: React.MouseEvent) =>
      setHover((h) => (h ? { ...h, x: e.clientX, y: e.clientY } : h)),
    [],
  );

  // optional, mutable audio cues — off by default (autoplay policy + restraint)
  const [audioOn, setAudioOn] = useState(false);
  useAudioCues({ state, isolatedCount: isolated.size, enabled: audioOn });
>>>>>>> interactivity

  return (
    <HudFrame className="relative min-h-0 flex-1 overflow-hidden">
      <div className="pointer-events-none absolute left-4 top-3 z-20 panel-title">Swarm Map</div>
<<<<<<< HEAD
      <div className="absolute right-4 top-3 z-20 flex items-center gap-3 text-[0.68rem]">
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? "Unmute audio cues" : "Mute audio cues"}
          title={muted ? "Audio cues off — click to enable" : "Audio cues on"}
          className="pointer-events-auto grid h-5 w-5 place-items-center rounded text-[0.7rem] leading-none transition-colors"
          style={{ color: muted ? HEX.faint : HEX.green, border: `1px solid ${muted ? HEX.line : `${HEX.green}55`}` }}
        >
          {muted ? "🔇" : "🔊"}
        </button>
        <div className="pointer-events-none flex items-center gap-2">
=======
      <div className="pointer-events-none absolute right-4 top-3 z-20 flex items-center gap-3 text-[0.68rem]">
        <button
          type="button"
          onClick={() => setAudioOn((v) => !v)}
          className="pointer-events-auto grid h-6 w-6 place-items-center rounded border border-line bg-panel-2/80 transition-colors hover:border-ink-faint"
          style={{ color: audioOn ? HEX.green : HEX.faint }}
          aria-label={audioOn ? "Mute audio cues" : "Enable audio cues"}
          title={audioOn ? "Audio cues on" : "Audio cues off"}
        >
          <SpeakerIcon on={audioOn} />
        </button>
        <div className="flex items-center gap-2">
>>>>>>> interactivity
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: hostiles ? HEX.red : HEX.green }} />
          <span style={{ color: hostiles ? HEX.red : HEX.dim }}>
            {hostiles ? `${hostiles} contact${hostiles > 1 ? "s" : ""}` : "All nominal"}
          </span>
        </div>
      </div>

      <MapField />

      <div className="absolute inset-0 z-10" onMouseMove={onHoverMove} onMouseLeave={clearHover}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
<<<<<<< HEAD
=======
          onInit={(inst) => { rfRef.current = inst; }}
>>>>>>> interactivity
          onNodesChange={onNodesChange}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onPaneClick={onPaneClick}
<<<<<<< HEAD
          onNodeMouseEnter={onNodeHover}
          onNodeMouseMove={onNodeHover}
          onNodeMouseLeave={clearHover}
          onEdgeMouseEnter={onEdgeHover}
          onEdgeMouseMove={onEdgeHover}
          onEdgeMouseLeave={clearHover}
          onInit={(inst) => setViewport(inst.getViewport())}
          onMove={(_e, vp) => setViewport(vp)}
=======
          onNodeMouseEnter={onNodeEnter}
          onNodeMouseLeave={clearHover}
          onEdgeMouseEnter={onEdgeEnter}
          onEdgeMouseLeave={clearHover}
>>>>>>> interactivity
          fitView
          fitViewOptions={{ padding: 0.16 }}
          nodesDraggable
          nodesConnectable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          proOptions={{ hideAttribution: true }}
        />
      </div>

      {/* auto-focus pulses sit above the canvas, pinned to the attack location */}
      <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
        {pulses.map((p) => (
          <FocusPulse key={p.key} pulse={p} viewport={viewport} />
        ))}
      </div>

      <DetailCard state={state} selected={selected} />
<<<<<<< HEAD
      <HoverTip hover={hover} state={state} risk={risk.byNode} isolated={isolated} />
=======
      <HoverTip hover={hover} state={state} riskMap={riskMap} />
>>>>>>> interactivity
    </HudFrame>
  );
}
