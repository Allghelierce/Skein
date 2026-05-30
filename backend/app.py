"""Skein backend — FastAPI WebSocket server.

Streams full swarm state to the command-center frontend every tick (~1s) and
accepts attack/reset commands. One Simulator instance is shared across clients
so every connected screen sees the same world (handy for the demo).

Run:  uvicorn app:app --reload --port 8000
"""

from __future__ import annotations

import asyncio
import contextlib

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from mesh.simulator import Simulator

TICK_SECONDS = 1.0

app = FastAPI(title="Skein Mesh Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Single shared world for the demo.
simulator = Simulator()


@app.get("/")
def health() -> dict:
    return {
        "status": "ok",
        "service": "skein-mesh",
        "tick": simulator.tick_count,
        "nodes": len(simulator.graph.nodes),
        "links": len(simulator.graph.links),
        "detector": simulator.model_name,
    }


async def _stream(ws: WebSocket) -> None:
    """Advance the world and push state to this client every tick."""
    with contextlib.suppress(WebSocketDisconnect):
        while True:
            await ws.send_json(simulator.tick())
            await asyncio.sleep(TICK_SECONDS)


async def _receive(ws: WebSocket) -> None:
    """Apply incoming CommandMessages to the shared simulator."""
    with contextlib.suppress(WebSocketDisconnect):
        while True:
            msg = await ws.receive_json()
            if msg.get("type") == "command":
                action = msg.get("action")
                target = msg.get("target")
                if action in ("jam", "stealth", "hack", "reset"):
                    simulator.command(action, target)


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    # Send an immediate first frame so the UI paints without waiting a tick.
    with contextlib.suppress(WebSocketDisconnect):
        await ws.send_json(simulator.tick())

    sender = asyncio.create_task(_stream(ws))
    receiver = asyncio.create_task(_receive(ws))
    # Whichever side ends first (usually the client disconnecting) tears down
    # the other. Retrieve each task's result so no exception goes unhandled.
    done, pending = await asyncio.wait(
        {sender, receiver}, return_when=asyncio.FIRST_COMPLETED
    )
    for task in pending:
        task.cancel()
    for task in (*done, *pending):
        with contextlib.suppress(asyncio.CancelledError, WebSocketDisconnect):
            await task
