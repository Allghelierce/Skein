# Second-Laptop Demo Rig — Setup Guide (agent handoff)

**Audience:** an AI agent guiding the human operator through getting **laptop 2**
ready for the live two-laptop Skein demo. The operator is physically at the
machines; the agent's job is to walk them through it step by step and troubleshoot.

---

## 1. Goal

Get **laptop 2** working as the **attacker** for the two-laptop demo:
- It runs the attacker console (`attacker/attacker.py`) over a **phone hotspot**.
- Each keypress sends a **real command** over the network to laptop 1's backend.
- Laptop 2 is **also a real, killable node** on the swarm map (`ATK`): close the
  lid / pull the hotspot and ~4s later it drops off and the swarm heals around it.

Success = on laptop 1's dashboard, an attack triggered from laptop 2 lights up the
ML detector + reroute, and killing laptop 2 shows "went dark → heartbeat lost" and a
heal.

## 2. What the demo looks like (the payoff to aim for)

1. **Cold open:** laptop 1 shows a green 13-drone mesh, threat `NOMINAL`.
2. **"Attack from another machine":** the `ATK` node (laptop 2) sits on the map.
3. **Jam / hack from laptop 2:** press `1`/`3`, type a target → on laptop 1 a link
   or drone flares red, the ML Detector flips to DoS/PortScan ~99%, the feed
   narrates it, the swarm reroutes (green), comms dips then recovers.
4. **Kill shot:** close laptop 2's lid → `ATK went dark — heartbeat lost` → node
   drops → swarm heals around it. (A real machine dying, live.)
5. **Reset (`4`)** → swarm restored.
6. **Judge-interactive:** hand laptop 2 to a judge — *"pick a drone to hack"* — they
   type the id, it lights up.

## 3. How it works (architecture)

- **One shared backend simulator** runs on laptop 1. Both the dashboard's on-screen
  controls AND `attacker.py` send the **same** `CommandMessage`
  (`{"type":"command","action":"jam|stealth|hack|reset","target":...}`) over a
  WebSocket. Same code path → identical effect; the only difference is the source.
- `attacker.py` also sends a **heartbeat** once/sec; the first beat registers it as
  the `ATK` node. If beats stop for >~4s the backend marks it `down` and heals.
- **Honesty (say it on stage):** commands are real over the network, detection is
  real ML on real CIC data, routing is real. The jamming/attacks are *simulated*
  link/node degradation — real RF jamming is illegal.

## 4. Laptop 1 (the command center — already set up on this machine)

Must be running and reachable on the LAN:
- **Backend** (bound to all interfaces so laptop 2 can reach it):
  ```
  cd backend && ./.venv/bin/uvicorn app:app --host 0.0.0.0 --port 8000
  ```
  Health check: `curl -s http://localhost:8000/` → `{"status":"ok",...,"detector":"trained"}`
- **Frontend** (the dashboard you project): `cd frontend && npm run dev` → open
  `http://localhost:3000`
- **Find laptop 1's hotspot IP** (run AFTER joining the hotspot):
  ```
  ipconfig getifaddr en0
  ```
  This is `<laptop1-ip>` for laptop 2 (typically `172.20.10.x` on iPhone hotspot,
  `192.168.43.x` on Android).

## 5. Laptop 2 setup steps (what to guide the operator through)

1. **Python 3 present:** `python3 --version` (3.8+). If missing: `brew install python`.
2. **Get the attacker script** — it's standalone, just one file:
   - clone: `git clone https://github.com/Allghelierce/Skein.git && cd Skein/attacker`
   - or copy `attacker/attacker.py` over (AirDrop/USB/scp) into any folder.
3. **Install the only dependency:** `pip3 install websockets`
4. **Join the same phone hotspot** as laptop 1.
5. **Run it** (needs laptop 1's IP from step 4 above):
   ```
   python3 attacker.py --host <laptop1-ip>
   ```

## 6. Verify the cross-laptop link

- On laptop 2's console, press `1` (jam) → it prompts for a target → type a link
  index/id. Laptop 1's dashboard should react within ~1s.
- The `ATK` node should appear on the map (it heartbeats once/sec).
- **Kill test:** Ctrl-C or close the lid → ~4s later laptop 1 shows
  `ATK went dark — heartbeat lost` and the swarm reroutes.

## 7. Attacker console reference

- Keys: `1` jam (a link) · `2` stealth (a link) · `3` hack (a node) · `4` reset.
- **Targeting is interactive:** press the key, then type the target **index or id**
  from the live list (blank cancels). You choose the target each time — any link or
  any drone `D1`–`D13`.
- Flags: `--host <ip>` (required, no localhost fallback cross-laptop), `--port 8000`,
  `--node ATK` (name of its node), `--no-heartbeat` (issue commands without
  registering as a node — a "pure attacker").
- **Optional 3-machine split** (only if a spare laptop + rehearsal time): computer 2
  = a real drone (`--node FIELD1`, never attacks), computer 3 = pure attacker
  (`--no-heartbeat`). Not required; 2 machines is the recommended demo.

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| Laptop 2 can't connect | Confirm both on the **same hotspot**; re-check `<laptop1-ip>` (it changes on the hotspot); laptop 1 backend must be `--host 0.0.0.0`. |
| Connects but nothing happens | macOS firewall on laptop 1 may block `:8000` — System Settings → Network → Firewall: allow incoming for Python, or turn off for the demo. |
| `ModuleNotFoundError: websockets` | `pip3 install websockets` on laptop 2. |
| `ATK` never dies after closing lid | Heartbeat timeout is ~4s — wait a few seconds; confirm laptop 2 was actually heartbeating (no `--no-heartbeat`). |
| Want to test before the hotspot | On **laptop 1** run `python3 attacker/attacker.py --host 127.0.0.1` against the running backend to confirm the console works locally. |

## 9. Scope — what is and isn't part of this demo

**In scope (this guide):** the working **simulated-command** two-laptop demo above.
It is solid and demo-ready.

**Explicitly OUT of scope — do NOT try to build these while setting up the rig:**
- **Real `nmap`/`hping3` packets driving the ML** (live capture). Implemented but
  **parked** behind a model retrain — see `backend/live/README.md` and task #11. The
  env flag `SKEIN_LIVE_CAPTURE` stays **off**.
- **Laptop-2-as-a-chosen-drone + computer glyph.** Brainstormed, **not built**. If
  the operator wants it, that's a separate design+build task, not rig setup.

The agent's job here is **operational**: get laptop 2 talking to laptop 1 and
rehearse the demo flow. Don't refactor, don't enable the parked paths.
