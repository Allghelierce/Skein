# Skein — Offense Console (laptop 2)

The red "offense screen" for the split-demo. One small program plays **two roles
at once**:

1. **Attacker console** — fires *real* commands (jam / stealth / hack / reset) at
   the live swarm over laptop 1's backend WebSocket. Every key press sends a
   `CommandMessage` the shared simulator actually applies, so the blue defender
   dashboard reacts in real time. No faked numbers.
2. **A real, killable mesh node** — while it runs, it registers laptop 2 as node
   **`ATK`** and heartbeats once a second. **Kill this process** (Ctrl-C, close
   the lid, pull the hotspot) and the heartbeats stop → the backend marks `ATK`
   down → the swarm visibly heals around it. That's the money demo beat.

## Run

On **laptop 2**, with Python 3.10+:

```bash
cd attacker
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt          # just `websockets`

# point it at laptop 1 (see "Networking" below for the IP)
python attacker.py --host 192.168.43.12  # laptop 1's hotspot IP
```

Or reuse laptop 1's backend venv — it already has `websockets`.

### Flags / env

| Flag | Env | Default | Meaning |
|------|-----|---------|---------|
| `--host` | `SKEIN_HOST` | `127.0.0.1` | laptop 1's IP |
| `--port` | `SKEIN_PORT` | `8000` | backend port |
| `--node` | `SKEIN_NODE` | `ATK` | mesh node id this laptop hosts |
| `--heartbeat` | — | `1.0` | seconds between heartbeats |
| `--no-heartbeat` | — | off | attack only; don't be a killable node |

Controls: `1` jam · `2` stealth · `3` hack · `4` reset · `r` refresh · `q` quit.
Pick a target by its index or its id from the live lists.

## Networking (phone hotspot)

Both laptops join the **phone hotspot**. Then:

1. **On laptop 1**, bind the backend to all interfaces (not just localhost):
   ```bash
   cd backend
   uvicorn app:app --host 0.0.0.0 --port 8000
   ```
2. **On laptop 1**, find its hotspot IP:
   ```bash
   ipconfig getifaddr en0   # macOS; try en1 if blank
   ```
3. **On laptop 2**, run `python attacker.py --host <that-ip>`.

The console auto-reconnects with backoff, so a brief hotspot blip won't kill the
session — only actually quitting/killing it drops the `ATK` node.

### Fallbacks if the venue hotspot misbehaves
- Laptop 1 hosts a local Wi-Fi network; laptop 2 joins it; same steps.
- Ethernet cable between the laptops with static IPs.
- Last resort: run the console on laptop 1 itself against `127.0.0.1` to show the
  offense/defense split on one screen (you lose the physical-kill beat, but the
  attacks are still real).

## How the kill heals the swarm

`ATK` joins linked to drones `D4` and `D5`. When its heartbeats lapse past the
backend's timeout (~4s), the backend severs those links and reroutes `D4`↔`D5`
around the dead node — the exact same self-heal path used for a quarantined
drone. The dashboard shows `ATK` go dark and blue reroute links appear. Honest
mechanics: the "jamming" is simulated link degradation, but the mesh routing and
self-healing are real graph computation.
