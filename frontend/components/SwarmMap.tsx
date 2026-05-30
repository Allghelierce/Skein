// frontend/components/SwarmMap.tsx
// The plot. A swarm formation on a framed dark field, flying over drifting
// topographic terrain. Calm and neutral by default; color enters only with
// state — red when jammed/hacked, green along the healed reroute.
//
// Four stacking "alive" effects, all derived from existing state:
//   1. heal sweep   — a bright comet sweeps the new route hop-by-hop
//   2. idle hover    — each drone gently bobs like a hovering aircraft
//   3. break beat    — a red shockwave + edge snap when an attack lands
//   4. spotlight     — calm mesh dims during combat so the break/heal pop
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
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { motion } from "framer-motion";
import type { StateMessage, SwarmLink, SwarmNode } from "@/lib/types";
import { HEX, linkColor, nodeColor } from "@/lib/palette";
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

// ── small helpers ───────────────────────────────────────────────────────────
function hashLabel(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = () => setReduced(mq.matches);
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);
  return reduced;
}

// Reconstruct route order: BFS from each break (jammed link source) over the
// rerouted edges only, so each healed edge learns its hop distance from the
// break. Returns linkId -> staggered animation delay (seconds).
function computeHopDelays(links: SwarmLink[]): Map<string, number> {
  const jammedSources = links.filter((l) => l.status === "jammed").map((l) => l.source);
  const rerouted = links.filter((l) => l.status === "rerouted");
  if (jammedSources.length === 0 || rerouted.length === 0) return new Map();

  const adj = new Map<string, { to: string; id: string }[]>();
  for (const l of rerouted) {
    (adj.get(l.source) ?? adj.set(l.source, []).get(l.source)!).push({ to: l.target, id: l.id });
    (adj.get(l.target) ?? adj.set(l.target, []).get(l.target)!).push({ to: l.source, id: l.id });
  }

  const dist = new Map<string, number>();
  const queue: string[] = [];
  for (const s of jammedSources) {
    if (!dist.has(s)) {
      dist.set(s, 0);
      queue.push(s);
    }
  }
  const hop = new Map<string, number>();
  while (queue.length) {
    const u = queue.shift() as string;
    const du = dist.get(u) as number;
    for (const { to, id } of adj.get(u) ?? []) {
      if (!hop.has(id)) hop.set(id, du); // edge fires at the hop of its nearer endpoint
      if (!dist.has(to)) {
        dist.set(to, du + 1);
        queue.push(to);
      }
    }
  }
  const delay = new Map<string, number>();
  for (const [id, h] of hop) delay.set(id, h * 0.14);
  return delay;
}

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
  combat: boolean;
  risk: number; // 0..1 attack-likeness of this drone's neighbourhood
  reducedMotion: boolean;
}
type DroneNode = Node<DroneData, "drone">;

/* ── Airspeed wake ──────────────────────────────────────────────────────────
   The terrain scrolls DOWN (forward flight reads as up-screen), so a flying
   drone leaves a wake that falls BEHIND it — downward. Twin tapering streaks
   straddle the label, and small particles shed down them, so each drone reads
   as actively cutting forward over the moving ground rather than pinned in place. */
function DroneWake({ color, reduced }: { color: string; reduced: boolean }) {
  const offsets = [-5, 5];
  return (
    <span className="pointer-events-none absolute left-1/2 top-1/2" aria-hidden>
      {offsets.map((dx) => (
        <span key={dx}>
          <span
            className="absolute"
            style={{
              left: dx - 1,
              top: 4,
              width: 2,
              height: 15,
              background: `linear-gradient(to bottom, ${color}, transparent)`,
              filter: "blur(1px)",
              opacity: 0.32,
            }}
          />
          {!reduced && (
            <span
              className="drone-wake-dot absolute rounded-full"
              style={{
                left: dx - 1.25,
                top: 4,
                width: 2.5,
                height: 2.5,
                background: color,
                animationDelay: `${(dx + 5) * 0.07}s`,
              }}
            />
          )}
        </span>
      ))}
    </span>
  );
}

function DroneNode({ data }: NodeProps<DroneNode>) {
  const threat = data.status === "attacked";
  // a cut-off (isolated) drone reads as offline: dark, dashed, no glow
  const offline = data.isolated && !threat;
  const colored = !offline && data.status !== "healthy";
  const color = offline ? HEX.faint : nodeColor(data.status);

  // spotlight: dim quiet/healthy drones during combat so threats stand out
  const calm = !offline && !colored && !data.selected;
  const dim = data.combat && calm;
  const wrapperOpacity = offline ? 0.7 : dim ? 0.5 : 1;
  const glyphColor = offline ? HEX.faint : colored ? color : dim ? "#3c3c44" : HEX.dim;

  // staggered idle hover (skip for downed/offline drones)
  const h = hashLabel(data.label);
  const hoverStyle = offline
    ? undefined
    : { animationDelay: `${(h % 20) / 10}s`, animationDuration: `${3.4 + (h % 9) * 0.12}s` };

  // risk heat: a healthy drone whose neighbourhood is turning attack-like glows
  // amber — danger you can see BEFORE it lands. Suppressed once it's actually red.
  const risk = data.risk ?? 0;
  const showRisk = !offline && !threat && risk >= 0.18;

  // a drone is "flying" (and so leaves a wake) unless it's cut off or gone dark.
  // ("down" is a runtime host-node status the backend emits but NodeStatus omits.)
  const flying = !offline && (data.status as string) !== "down";
  const wakeColor = colored ? color : "#4fae86";

  return (
    <div
      className="relative grid place-items-center"
      style={{ opacity: wrapperOpacity, transition: "opacity 0.4s ease" }}
    >
      <Handle type="target" position={Position.Top} style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />

      <div className={offline ? "grid place-items-center" : "drone-hover grid place-items-center"} style={hoverStyle}>
        {flying && <DroneWake color={wakeColor} reduced={data.reducedMotion} />}
        {showRisk && (
          <>
            <span
              className="pointer-events-none absolute rounded-full"
              style={{
                width: 26 + risk * 24,
                height: 26 + risk * 24,
                background: `radial-gradient(circle, ${HEX.amber}40 0%, transparent 70%)`,
                opacity: 0.35 + risk * 0.5,
              }}
            />
            {risk >= 0.4 && (
              <span
                className="risk-pulse pointer-events-none absolute rounded-full"
                style={{ width: 34, height: 34, border: `1px solid ${HEX.amber}`, opacity: risk * 0.7 }}
              />
            )}
          </>
        )}
        {threat && (
          <span className="absolute h-8 w-8 rounded-full animate-skein-ring" style={{ border: `1px solid ${color}` }} />
        )}
        {data.selected && (
          <span
            className="pointer-events-none absolute h-[34px] w-[34px] rounded-full"
            style={{ border: `1px solid ${colored ? color : HEX.ink}`, opacity: 0.55 }}
          />
        )}

        <motion.div
          animate={{ scale: data.selected ? 1.15 : 1 }}
          transition={{ duration: 0.35 }}
          className="grid h-[26px] w-[26px] place-items-center"
          style={{
            filter: colored
              ? `drop-shadow(0 0 6px ${color})`
              : "drop-shadow(0 0 3px rgba(0,0,0,0.8))",
          }}
        >
          <DroneGlyph color={glyphColor} size={18} />
        </motion.div>

        <span
          className="absolute -bottom-[15px] whitespace-nowrap text-[0.6rem] font-medium tracking-tight"
          style={{ color: offline ? HEX.faint : colored ? color : HEX.dim }}
        >
          {offline ? `${data.label} · OFFLINE` : data.label}
        </span>
      </div>
    </div>
  );
}

/* ── Link with traffic + one-shot heal/break effects ────────────────────── */
interface DataEdgeData extends Record<string, unknown> {
  status: SwarmLink["status"];
  active: boolean;
  selected: boolean;
  confidence: number;
  attack: boolean;
  dead: boolean;
  combat: boolean;
  seq: number; // bumps each time this link (re)enters jammed/rerouted
  hopDelay: number; // stagger for the heal comet (seconds)
  reducedMotion: boolean;
}
type DataEdge = Edge<DataEdgeData, "data">;

function DataEdge({ id, sourceX, sourceY, targetX, targetY, data }: EdgeProps<DataEdge>) {
  const [path, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  const mx = (sourceX + targetX) / 2; // break point — where jammed traffic dies
  const my = (sourceY + targetY) / 2;
  const status = data?.status ?? "healthy";
  const active = data?.active ?? false;
  const selected = data?.selected ?? false;
  const confidence = data?.confidence ?? 0;
  const dead = data?.dead ?? false;
  const combat = data?.combat ?? false;
  const seq = data?.seq ?? 0;
  const hopDelay = data?.hopDelay ?? 0;
  const reduced = data?.reducedMotion ?? false;
  const color = linkColor(status);
  const jammed = status === "jammed";
  const rerouted = status === "rerouted";

  // a dead link (leads to a cut-off drone) is drawn faint + static, no packet
  if (dead && !jammed) {
    return (
      <BaseEdge
        path={path}
        style={{ stroke: "#26262c", strokeWidth: 1, opacity: 0.5, strokeDasharray: "2 5" }}
      />
    );
  }

  const width = (jammed ? 1.1 : rerouted ? 1 : 0.7) + (selected ? 0.7 : 0);
  // spotlight: quiet links recede during combat
  let opacity = jammed || rerouted ? 1 : active ? 0.6 : 0.42;
  if (combat && !jammed && !rerouted) opacity = active ? 0.26 : 0.16;

  // always-on traffic packet
  const packetColor = jammed ? HEX.red : rerouted ? HEX.green : "#4fae86";
  let packetOpacity = jammed || rerouted ? 1 : active ? 0.9 : 0.55;
  if (combat && !jammed && !rerouted) packetOpacity *= 0.4;
  const packetR = jammed ? 2 : rerouted ? 2.2 : active ? 2.1 : 1.8;
  const dur = jammed ? "0.8s" : rerouted ? "0.7s" : active ? "1.5s" : "2.4s";

  const labelColor = jammed ? HEX.red : rerouted ? HEX.green : HEX.faint;

  return (
    <>
      {/* one-shot red snap when the attack lands (replays on re-jam via seq key) */}
      {jammed && !reduced && (
        <path key={`flash-${id}-${seq}`} d={path} className="edge-snap" style={{ stroke: HEX.red, fill: "none" }} />
      )}

      <BaseEdge
        path={path}
        className={jammed ? "edge-jammed" : rerouted ? "edge-reroute" : undefined}
        style={{
          stroke: jammed || rerouted ? color : "#3a3a44",
          strokeWidth: width,
          opacity,
          transition: "opacity 0.4s ease",
          filter: jammed
            ? "drop-shadow(0 0 2px #ff3b5c)"
            : rerouted
              ? "drop-shadow(0 0 3px #2ee27a)"
              : undefined,
        }}
      />

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
          r={3}
          fill={HEX.green}
          opacity={0}
          style={{ filter: `drop-shadow(0 0 4px ${HEX.green})` }}
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
      )}

      <EdgeLabelRenderer>
        {/* break beat: expanding shockwave at the break midpoint */}
        {jammed && !reduced && (
          <div
            key={`snap-${id}-${seq}`}
            className="shockwave pointer-events-none absolute"
            style={{
              left: labelX,
              top: labelY,
              width: 54,
              height: 54,
              borderRadius: "9999px",
              border: `2px solid ${HEX.red}`,
            }}
          />
        )}
        {/* only the attacked link shows its confidence — the other 27 links stay
            label-free so the graph reads clean (hover any link for its detail) */}
        {jammed && (
          <div
            className="mono pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 tabular-nums"
            style={{
              left: labelX,
              top: labelY - 11,
              fontSize: "0.55rem",
              color: labelColor,
              fontWeight: 700,
              textShadow: "0 0 4px #000, 0 0 4px #000",
            }}
          >
            {Math.round(confidence * 100)}%
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}

const nodeTypes = { drone: DroneNode };
const edgeTypes = { data: DataEdge };

// Keep the swarm in the clear band between the floating glass rails (~300px each
// side) and above the bottom telemetry dock, so drones are never hidden behind UI.
const FIT_PADDING = { top: "84px", right: "320px", bottom: "136px", left: "320px" } as const;

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
              baseFrequency="0.0055"
              numOctaves={7}
              seed={11}
              stitchTiles="stitch"
              result="noise"
            />
            <feColorMatrix
              in="noise"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0"
              result="height"
            />
            <feDiffuseLighting
              in="height"
              surfaceScale="7"
              diffuseConstant="1"
              lightingColor="#3a3a40"
              result="relief"
            >
              <feDistantLight azimuth="235" elevation="44" />
            </feDiffuseLighting>
            <feColorMatrix
              in="noise"
              type="matrix"
              values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0 1"
              result="gray"
            />
            <feComponentTransfer in="gray" result="stepped">
              <feFuncR type="discrete" tableValues="0 .05 .1 .15 .2 .25 .3 .35 .4 .45 .5 .55 .6 .65 .7 .75 .8 .85 .9 .95 1" />
              <feFuncG type="discrete" tableValues="0 .05 .1 .15 .2 .25 .3 .35 .4 .45 .5 .55 .6 .65 .7 .75 .8 .85 .9 .95 1" />
              <feFuncB type="discrete" tableValues="0 .05 .1 .15 .2 .25 .3 .35 .4 .45 .5 .55 .6 .65 .7 .75 .8 .85 .9 .95 1" />
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
            <feFlood floodColor="#7d7d88" result="line" />
            <feComposite in="line" in2="lineAlpha" operator="in" result="lines" />
            <feComponentTransfer in="relief" result="reliefDim">
              <feFuncA type="linear" slope="0.85" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode in="reliefDim" />
              <feMergeNode in="lines" />
            </feMerge>
          </filter>
        </defs>
      </svg>

      <div className="terrain-scroll absolute inset-x-0 top-0" style={{ height: "200%", opacity: 0.62 }}>
        <TerrainTile />
        <TerrainTile />
      </div>

      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 120% at 50% 47%, transparent 42%, rgba(2,4,7,0.92) 100%)",
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
  // Gate the interactive ReactFlow canvas (and anything that reads window/
  // measures the DOM) behind a client-only mounted flag. The server render and
  // the first client render are therefore identical — just the static HUD frame
  // + terrain — which removes the hydration mismatch. ReactFlow then mounts in
  // an effect, exactly as before, so behaviour and the WS data flow are unchanged.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const reducedMotion = usePrefersReducedMotion();
  // remember last status per link so we can fire one-shot effects on transitions
  const prevStatus = useRef<Map<string, SwarmLink["status"]>>(new Map());
  const pulseSeq = useRef<Map<string, number>>(new Map());

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
    });
  }, []);

  const nodes: DroneNode[] = useMemo(() => {
    return (state?.nodes ?? []).map((n) => {
      const ov = posOverride.get(n.id);
      return {
      id: n.id,
      type: "drone",
      position: ov ?? { x: n.x * CANVAS_W, y: n.y * CANVAS_H },
      data: {
        label: n.id,
        status: n.status,
        selected: selected?.kind === "node" && selected.id === n.id,
        isolated: isolated.has(n.id),
        combat,
        risk: riskMap.get(n.id) ?? 0,
        reducedMotion,
      },
      draggable: true,
      };
    });
  }, [state?.nodes, selected, isolated, combat, riskMap, posOverride, reducedMotion]);

  const edges: DataEdge[] = useMemo(() => {
    return (state?.links ?? []).map((l) => {
      const prev = prevStatus.current.get(l.id);
      const justJammed = prev !== "jammed" && l.status === "jammed";
      const justRerouted = prev !== "rerouted" && l.status === "rerouted";
      if (justJammed || justRerouted) {
        pulseSeq.current.set(l.id, (pulseSeq.current.get(l.id) ?? 0) + 1);
      }
      return {
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
          combat,
          seq: pulseSeq.current.get(l.id) ?? 0,
          hopDelay: hopDelays.get(l.id) ?? 0,
          reducedMotion,
        },
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.links, selected, isolated, combat, hopDelays, reducedMotion]);

  // commit the new statuses AFTER render so transition detection stays stable
  // across StrictMode double-invokes and unrelated re-renders.
  useEffect(() => {
    const next = new Map<string, SwarmLink["status"]>();
    for (const l of state?.links ?? []) next.set(l.id, l.status);
    prevStatus.current = next;
  }, [state?.links]);

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
      rf.fitView({ padding: FIT_PADDING, duration: 700 });
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

  // hover tooltips — follow the cursor while over a drone or link
  const [hover, setHover] = useState<Hover | null>(null);
  const onNodeEnter = useCallback<NodeMouseHandler>(
    (e, node) => setHover({ kind: "node", id: node.id, x: e.clientX, y: e.clientY }),
    [],
  );
  const onEdgeEnter = useCallback<EdgeMouseHandler<DataEdge>>(
    (e, edge) => setHover({ kind: "link", id: edge.id, x: e.clientX, y: e.clientY }),
    [],
  );
  const clearHover = useCallback(() => setHover(null), []);
  const onHoverMove = useCallback(
    (e: React.MouseEvent) =>
      setHover((h) => (h ? { ...h, x: e.clientX, y: e.clientY } : h)),
    [],
  );

  // optional, mutable audio cues — off by default (autoplay policy + restraint)
  const [audioOn, setAudioOn] = useState(false);
  useAudioCues({ state, isolatedCount: isolated.size, enabled: audioOn });

  return (
    <HudFrame className="relative min-h-0 flex-1 overflow-hidden">
      <div className="pointer-events-none absolute right-4 top-3 z-20 flex items-center gap-3">
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
        {/* live heartbeat — flashes red once per state tick (data is streaming) */}
        <span
          key={state?.tick ?? 0}
          className="tick-flash h-2 w-2 shrink-0 rounded-full"
          style={{ background: HEX.red }}
          aria-label="live data feed"
          title="live"
        />
      </div>

      <MapField />

      <div className="absolute inset-0 z-10" onMouseMove={onHoverMove} onMouseLeave={clearHover}>
        {mounted && (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onInit={(inst) => { rfRef.current = inst; }}
          onNodesChange={onNodesChange}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onPaneClick={onPaneClick}
          onNodeMouseEnter={onNodeEnter}
          onNodeMouseLeave={clearHover}
          onEdgeMouseEnter={onEdgeEnter}
          onEdgeMouseLeave={clearHover}
          fitView
          fitViewOptions={{ padding: FIT_PADDING }}
          nodesDraggable
          nodesConnectable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          proOptions={{ hideAttribution: true }}
        />
        )}
      </div>

      <DetailCard state={state} selected={selected} />
      <HoverTip hover={hover} state={state} riskMap={riskMap} />
    </HudFrame>
  );
}
