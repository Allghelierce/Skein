#!/usr/bin/env python3
"""Skein — OFFENSE CONSOLE (laptop 2).

One program, two roles:

  1. Attacker console. Connects to laptop 1's backend WebSocket and fires REAL
     CommandMessages — jam / stealth / hack / reset — at live links and drones.
     This is the red "offense screen" in a split-demo against the blue defender
     dashboard. Nothing here is faked: every key press sends a command the shared
     simulator actually applies, and the defender screen reacts in real time.

  2. A real, killable mesh node. While running it registers laptop 2 as node
     "ATK" and sends a heartbeat every second. Kill this process (Ctrl-C, close
     the lid, pull the hotspot) and the heartbeats stop — the backend marks ATK
     down and the swarm visibly heals around it. That is the money demo beat.

Networking is configurable; we never hardcode localhost for the cross-laptop
link. Point it at laptop 1 over the phone hotspot:

    python attacker.py --host 192.168.43.12          # laptop 1's hotspot IP
    SKEIN_HOST=192.168.43.12 python attacker.py       # or via env

Find laptop 1's IP on laptop 1 with:  ipconfig getifaddr en0
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import json
import os
import sys

import websockets

# --- red/offensive theme ---------------------------------------------------
RESET = "\033[0m"
BOLD = "\033[1m"
DIM = "\033[2m"
RED = "\033[31m"
BRED = "\033[91m"
YELLOW = "\033[93m"
GREEN = "\033[92m"
GREY = "\033[90m"
ON_RED = "\033[41m\033[97m"

_THREAT_COLOR = {"NOMINAL": GREEN, "ELEVATED": YELLOW, "CRITICAL": BRED}

BANNER = rf"""{BRED}{BOLD}
   ███████ ██   ██ ███████ ██ ███    ██     OFFENSE CONSOLE
   ██      ██  ██  ██      ██ ████   ██  ░░  laptop 2 · red team
   ███████ █████   █████   ██ ██ ██  ██  ░░  jam · stealth · hack · kill
        ██ ██  ██  ██      ██ ██  ██ ██
   ███████ ██   ██ ███████ ██ ██   ████{RESET}{DIM}   every command is real{RESET}
"""


class AttackerConsole:
    def __init__(self, uri: str, node: str, heartbeat: float, beat: bool) -> None:
        self.uri = uri
        self.node = node
        self.heartbeat_interval = heartbeat
        self.send_beats = beat

        self.outbox: asyncio.Queue[dict] = asyncio.Queue()
        self.state: dict | None = None  # latest world snapshot from the backend
        self.connected = False
        self.beats_sent = 0
        self.fire_log: list[str] = []  # human-readable record of what we launched
        self._stop = asyncio.Event()

    # --- connection manager (auto-reconnect over a flaky hotspot) ----------
    async def _connection_manager(self) -> None:
        """Keep a live WS to laptop 1; reconnect with backoff if it drops."""
        backoff = 1.0
        while not self._stop.is_set():
            try:
                async with websockets.connect(
                    self.uri, ping_interval=20, open_timeout=5
                ) as ws:
                    self.connected = True
                    backoff = 1.0
                    self._note(f"{GREEN}● linked to {self.uri}{RESET}")
                    sender = asyncio.create_task(self._sender(ws))
                    receiver = asyncio.create_task(self._receiver(ws))
                    done, pending = await asyncio.wait(
                        {sender, receiver}, return_when=asyncio.FIRST_COMPLETED
                    )
                    for t in pending:
                        t.cancel()
                    with contextlib.suppress(Exception):
                        await asyncio.gather(*pending, return_exceptions=True)
            except Exception as exc:  # noqa: BLE001 — surface, then retry
                self._note(f"{YELLOW}○ no link ({type(exc).__name__}) — retrying{RESET}")
            finally:
                self.connected = False
            if self._stop.is_set():
                break
            await asyncio.sleep(backoff)
            backoff = min(backoff * 1.6, 8.0)

    async def _sender(self, ws) -> None:
        while True:
            msg = await self.outbox.get()
            await ws.send(json.dumps(msg))

    async def _receiver(self, ws) -> None:
        async for raw in ws:
            try:
                msg = json.loads(raw)
            except (ValueError, TypeError):
                continue
            if msg.get("type") == "state":
                self.state = msg

    # --- heartbeat: this is what makes laptop 2 a killable node ------------
    async def _heartbeat_loop(self) -> None:
        if not self.send_beats:
            return
        while not self._stop.is_set():
            if self.connected:
                await self.outbox.put({"type": "heartbeat", "node": self.node})
                self.beats_sent += 1
            await asyncio.sleep(self.heartbeat_interval)

    # --- firing commands ---------------------------------------------------
    async def _fire(self, action: str, target: str | None, label: str) -> None:
        await self.outbox.put({"type": "command", "action": action, "target": target})
        stamp = self._clock_str()
        self.fire_log.append(f"{stamp}  {label}")
        self.fire_log[:] = self.fire_log[-8:]

    def _clock_str(self) -> str:
        tick = (self.state or {}).get("tick")
        return f"t{tick:>4}" if isinstance(tick, int) else " --- "

    # --- live target lists from the latest snapshot ------------------------
    def _links(self) -> list[str]:
        return [l["id"] for l in (self.state or {}).get("links", [])]

    def _nodes(self) -> list[str]:
        return [n["id"] for n in (self.state or {}).get("nodes", [])]

    # --- rendering ---------------------------------------------------------
    def _note(self, line: str) -> None:
        self.fire_log.append(f"{self._clock_str()}  {line}")
        self.fire_log[:] = self.fire_log[-8:]

    def _render(self) -> None:
        sys.stdout.write("\033[2J\033[H")  # clear + home
        print(BANNER)

        link = f"{GREEN}● LINKED{RESET}" if self.connected else f"{YELLOW}○ offline{RESET}"
        node_state = "—"
        threat = "—"
        if self.state is not None:
            threat_lvl = self.state.get("threat_level", "—")
            threat = f"{_THREAT_COLOR.get(threat_lvl, '')}{threat_lvl}{RESET}"
            statuses = {n["id"]: n["status"] for n in self.state.get("nodes", [])}
            if self.node in statuses:
                s = statuses[self.node]
                col = GREEN if s in ("healthy", "defending") else BRED
                node_state = f"{col}{s}{RESET}"
            else:
                node_state = f"{DIM}registering…{RESET}"

        beat = (
            f"{BRED}♥{RESET} {self.beats_sent}"
            if self.send_beats
            else f"{DIM}off{RESET}"
        )
        print(f"  target {DIM}{self.uri}{RESET}   {link}")
        print(
            f"  my node {BOLD}{self.node}{RESET} [{node_state}]   "
            f"heartbeats {beat}   defender threat: {threat}"
        )
        print(f"  {GREY}{'─' * 60}{RESET}")

        print(f"  {BOLD}live links{RESET}  {DIM}(jam / stealth targets){RESET}")
        print(self._grid(self._links()))
        print(f"  {BOLD}live nodes{RESET}  {DIM}(hack targets){RESET}")
        print(self._grid(self._nodes(), mark=self.node))
        print(f"  {GREY}{'─' * 60}{RESET}")

        print(f"  {BOLD}fired{RESET}")
        if self.fire_log:
            for line in self.fire_log:
                print(f"    {DIM}{line}{RESET}")
        else:
            print(f"    {DIM}(nothing yet){RESET}")
        print(f"  {GREY}{'─' * 60}{RESET}")

        print(
            f"  {BRED}[1]{RESET} jam (DoS flood on a link)    "
            f"{BRED}[2]{RESET} stealth (low-and-slow on a link)"
        )
        print(
            f"  {BRED}[3]{RESET} hack (compromise a drone)    "
            f"{GREEN}[4]{RESET} reset (stand down)"
        )
        print(
            f"  {DIM}[r]{RESET} refresh    {DIM}[q]{RESET} quit "
            f"{DIM}(killing me drops node {self.node}){RESET}"
        )

    @staticmethod
    def _grid(items: list[str], mark: str | None = None, cols: int = 6) -> str:
        if not items:
            return f"    {DIM}(waiting for state…){RESET}"
        cells = []
        for i, it in enumerate(items):
            tag = f"{BRED}{it}{RESET}" if it == mark else it
            cells.append(f"{DIM}{i:>2}{RESET} {tag:<14}")
        lines = []
        for r in range(0, len(cells), cols):
            lines.append("    " + "".join(cells[r : r + cols]))
        return "\n".join(lines)

    # --- input -------------------------------------------------------------
    async def _ainput(self, prompt: str) -> str:
        try:
            return (await asyncio.to_thread(input, prompt)).strip()
        except (EOFError, KeyboardInterrupt):
            return "q"

    async def _pick(self, items: list[str], kind: str) -> str | None:
        """Resolve an id by index or by name from the live list."""
        if not items:
            self._note(f"{YELLOW}no {kind}s known yet — wait for state{RESET}")
            return None
        raw = await self._ainput(f"  {BRED}{kind}{RESET} (index or id, blank=cancel)> ")
        if not raw:
            return None
        if raw.isdigit() and int(raw) < len(items):
            return items[int(raw)]
        if raw in items:
            return raw
        # Be permissive: the backend safely ignores unknown targets.
        self._note(f"{YELLOW}'{raw}' not in current list — sending anyway{RESET}")
        return raw

    async def _menu(self) -> None:
        # Let the first state frame arrive so the target lists are populated.
        await asyncio.sleep(0.6)
        while not self._stop.is_set():
            self._render()
            choice = (await self._ainput(f"  {BRED}offense>{RESET} ")).lower()
            if choice in ("q", "quit", "exit"):
                break
            elif choice == "r":
                continue
            elif choice == "1":
                t = await self._pick(self._links(), "link")
                if t:
                    await self._fire("jam", t, f"{BRED}JAM{RESET}      DoS flood → {t}")
            elif choice == "2":
                t = await self._pick(self._links(), "link")
                if t:
                    await self._fire(
                        "stealth", t, f"{YELLOW}STEALTH{RESET}  low-and-slow → {t}"
                    )
            elif choice == "3":
                t = await self._pick(self._nodes(), "node")
                if t:
                    await self._fire("hack", t, f"{BRED}HACK{RESET}     compromise → {t}")
            elif choice == "4":
                await self._fire("reset", None, f"{GREEN}RESET{RESET}    stand down — all clear")
            # brief beat so a freshly-fired command's state can land before redraw
            await asyncio.sleep(0.25)
        self._stop.set()

    async def run(self) -> None:
        conn = asyncio.create_task(self._connection_manager())
        beat = asyncio.create_task(self._heartbeat_loop())
        try:
            await self._menu()
        finally:
            self._stop.set()
            conn.cancel()
            beat.cancel()
            with contextlib.suppress(Exception):
                await asyncio.gather(conn, beat, return_exceptions=True)
        print(f"\n{DIM}offense console down — node {self.node} will go dark on the defender.{RESET}")


def _build_uri(host: str, port: int) -> str:
    return f"ws://{host}:{port}/ws"


def main() -> None:
    p = argparse.ArgumentParser(description="Skein offense console (laptop 2).")
    p.add_argument(
        "--host",
        default=os.environ.get("SKEIN_HOST", "127.0.0.1"),
        help="laptop 1's IP (e.g. its phone-hotspot address). Env: SKEIN_HOST.",
    )
    p.add_argument(
        "--port", type=int, default=int(os.environ.get("SKEIN_PORT", "8000"))
    )
    p.add_argument("--node", default=os.environ.get("SKEIN_NODE", "ATK"),
                   help="mesh node id this laptop hosts (default ATK).")
    p.add_argument("--heartbeat", type=float, default=1.0,
                   help="seconds between heartbeats (default 1.0).")
    p.add_argument("--no-heartbeat", action="store_true",
                   help="attack only; do not register as a killable node.")
    args = p.parse_args()

    uri = _build_uri(args.host, args.port)
    console = AttackerConsole(
        uri=uri,
        node=args.node,
        heartbeat=args.heartbeat,
        beat=not args.no_heartbeat,
    )
    try:
        asyncio.run(console.run())
    except KeyboardInterrupt:
        print(f"\n{DIM}killed — heartbeats stopped.{RESET}")


if __name__ == "__main__":
    main()
