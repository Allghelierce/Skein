"""Skein backend — FastAPI WebSocket server.

Streams full swarm state to the command-center frontend every tick (~1s) and
accepts attack/reset commands. One Simulator instance is shared across clients
so every connected screen sees the same world (handy for the demo).

Run (local only):    uvicorn app:app --reload --port 8000
Run (LAN / hotspot): uvicorn app:app --host 0.0.0.0 --port 8000

Binding ``0.0.0.0`` (instead of the default 127.0.0.1) is what lets a second
machine — e.g. the attacker laptop — reach this backend at
``ws://<laptop1-ip>:8000/ws`` over a shared phone hotspot or LAN. Running this
file directly (``python app.py``) binds 0.0.0.0 by default; host and port are
overridable via the ``SKEIN_HOST`` / ``SKEIN_PORT`` env vars so nothing is
hardcoded to a single network.
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
                if action in ("jam", "stealth", "hack", "reset", "heartbeat"):
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


if __name__ == "__main__":
    import os

    import uvicorn

    # Bind 0.0.0.0 by default so other machines on the hotspot/LAN can connect.
    # Override with SKEIN_HOST / SKEIN_PORT; never hardcode a single host/IP.
    host = os.environ.get("SKEIN_HOST", "0.0.0.0")
    port = int(os.environ.get("SKEIN_PORT", "8000"))
    uvicorn.run("app:app", host=host, port=port)


if __name__ == "__main__":
    import os

    import uvicorn

    # Bind 0.0.0.0 by default so other machines on the hotspot/LAN can connect.
    # Override with SKEIN_HOST / SKEIN_PORT; never hardcode a single host/IP.
    host = os.environ.get("SKEIN_HOST", "0.0.0.0")
    port = int(os.environ.get("SKEIN_PORT", "8000"))
    uvicorn.run("app:app", host=host, port=port)


if __name__ == "__main__":
    import os

    import uvicorn

    # Bind 0.0.0.0 by default so other machines on the hotspot/LAN can connect.
    # Override with SKEIN_HOST / SKEIN_PORT; never hardcode a single host/IP.
    host = os.environ.get("SKEIN_HOST", "0.0.0.0")
    port = int(os.environ.get("SKEIN_PORT", "8000"))
    uvicorn.run("app:app", host=host, port=port)


if __name__ == "__main__":
    import os

    import uvicorn

    # Bind 0.0.0.0 by default so other machines on the hotspot/LAN can connect.
    # Override with SKEIN_HOST / SKEIN_PORT; never hardcode a single host/IP.
    host = os.environ.get("SKEIN_HOST", "0.0.0.0")
    port = int(os.environ.get("SKEIN_PORT", "8000"))
    uvicorn.run("app:app", host=host, port=port)


if __name__ == "__main__":
    import os

    import uvicorn

    # Bind 0.0.0.0 by default so other machines on the hotspot/LAN can connect.
    # Override with SKEIN_HOST / SKEIN_PORT; never hardcode a single host/IP.
    host = os.environ.get("SKEIN_HOST", "0.0.0.0")
    port = int(os.environ.get("SKEIN_PORT", "8000"))
    uvicorn.run("app:app", host=host, port=port)


if __name__ == "__main__":
    import os

    import uvicorn

    # Bind 0.0.0.0 by default so other machines on the hotspot/LAN can connect.
    # Override with SKEIN_HOST / SKEIN_PORT; never hardcode a single host/IP.
    host = os.environ.get("SKEIN_HOST", "0.0.0.0")
    port = int(os.environ.get("SKEIN_PORT", "8000"))
    uvicorn.run("app:app", host=host, port=port)


if __name__ == "__main__":
    import os

    import uvicorn

    # Bind 0.0.0.0 by default so other machines on the hotspot/LAN can connect.
    # Override with SKEIN_HOST / SKEIN_PORT; never hardcode a single host/IP.
    host = os.environ.get("SKEIN_HOST", "0.0.0.0")
    port = int(os.environ.get("SKEIN_PORT", "8000"))
    uvicorn.run("app:app", host=host, port=port)


if __name__ == "__main__":
    import os

    import uvicorn

    # Bind 0.0.0.0 by default so other machines on the hotspot/LAN can connect.
    # Override with SKEIN_HOST / SKEIN_PORT; never hardcode a single host/IP.
    host = os.environ.get("SKEIN_HOST", "0.0.0.0")
    port = int(os.environ.get("SKEIN_PORT", "8000"))
    uvicorn.run("app:app", host=host, port=port)


if __name__ == "__main__":
    import os

    import uvicorn

    # Bind 0.0.0.0 by default so other machines on the hotspot/LAN can connect.
    # Override with SKEIN_HOST / SKEIN_PORT; never hardcode a single host/IP.
    host = os.environ.get("SKEIN_HOST", "0.0.0.0")
    port = int(os.environ.get("SKEIN_PORT", "8000"))
    uvicorn.run("app:app", host=host, port=port)


if __name__ == "__main__":
    import os

    import uvicorn

    # Bind 0.0.0.0 by default so other machines on the hotspot/LAN can connect.
    # Override with SKEIN_HOST / SKEIN_PORT; never hardcode a single host/IP.
    host = os.environ.get("SKEIN_HOST", "0.0.0.0")
    port = int(os.environ.get("SKEIN_PORT", "8000"))
    uvicorn.run("app:app", host=host, port=port)


if __name__ == "__main__":
    import os

    import uvicorn

    # Bind 0.0.0.0 by default so other machines on the hotspot/LAN can connect.
    # Override with SKEIN_HOST / SKEIN_PORT; never hardcode a single host/IP.
    host = os.environ.get("SKEIN_HOST", "0.0.0.0")
    port = int(os.environ.get("SKEIN_PORT", "8000"))
    uvicorn.run("app:app", host=host, port=port)
