// frontend/lib/ws.ts
// useSwarm() — the single source of truth the dashboard reads from.
//
// Two modes, chosen at runtime:
//   • MOCK  (NEXT_PUBLIC_MOCK=true, or no WS url set): drives the UI from the
//     in-browser MockEngine so the demo works with NO backend.
//   • LIVE  (NEXT_PUBLIC_WS_URL set, MOCK off): connects to the Python backend
//     WebSocket (Task B) and streams real ML-driven state.
//
// Either way it returns the same { state, send, selected, setSelected,
// connected, mode } so components never care which one is running.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CommandMessage, StateMessage } from "./types";
import { MockEngine } from "./mock";

export type Selection =
  | { kind: "node"; id: string }
  | { kind: "link"; id: string }
  | null;

export interface UseSwarm {
  state: StateMessage | null;
  send: (cmd: CommandMessage) => void;
  selected: Selection;
  setSelected: (sel: Selection) => void;
  connected: boolean;
  mode: "mock" | "live";
}

const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL?.trim() || "ws://localhost:8000/ws";
// MOCK is the safe default: only go live when explicitly asked AND a url exists.
const MOCK_ENABLED =
  process.env.NEXT_PUBLIC_MOCK === "true" || !process.env.NEXT_PUBLIC_WS_URL;

const TICK_MS = 1000;

export function useSwarm(): UseSwarm {
  const [state, setState] = useState<StateMessage | null>(null);
  const [selected, setSelected] = useState<Selection>(null);
  const [connected, setConnected] = useState(false);
  const mode: "mock" | "live" = MOCK_ENABLED ? "mock" : "live";

  const engineRef = useRef<MockEngine | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // ── MOCK mode ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== "mock") return;
    const engine = new MockEngine();
    engineRef.current = engine;
    setState(engine.step());
    setConnected(true);
    const id = window.setInterval(() => setState(engine.step()), TICK_MS);
    return () => {
      window.clearInterval(id);
      engineRef.current = null;
      setConnected(false);
    };
  }, [mode]);

  // ── LIVE mode (auto-reconnect) ────────────────────────────────────────────
  useEffect(() => {
    if (mode !== "live") return;
    let closed = false;
    let retry: number | undefined;

    const connect = () => {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as StateMessage;
          if (msg.type === "state") setState(msg);
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) retry = window.setTimeout(connect, 1500);
      };
      ws.onerror = () => ws.close();
    };
    connect();

    return () => {
      closed = true;
      if (retry) window.clearTimeout(retry);
      wsRef.current?.close();
      wsRef.current = null;
      setConnected(false);
    };
  }, [mode]);

  const send = useCallback(
    (cmd: CommandMessage) => {
      if (mode === "mock") {
        const engine = engineRef.current;
        if (engine) setState(engine.command(cmd.action, cmd.target));
        return;
      }
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(cmd));
      }
    },
    [mode],
  );

  return { state, send, selected, setSelected, connected, mode };
}
