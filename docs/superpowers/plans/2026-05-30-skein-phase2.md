# Skein Phase 2 — Interactivity, Wow, and the Attacker Laptop

**Goal:** Make the dashboard graph more interactive and impressive, and add a second physical machine (laptop 2) that acts as a live attacker console AND a real mesh node you can kill on camera to show the swarm self-heal.

**Status of Phase 1:** done + merged on `main`. Real XGBoost model (99%), live detection, quarantine healing, stealth attack, why-it-flagged, scope panel, stats bar. Backend already runs ONE shared simulator across all WebSocket clients (`backend/app.py`), so a second client can attack the same swarm — no backend change needed for shared state.

---

## Part A — Graph interactivity + wow (frontend, `ui` worktree)

Make the swarm map feel alive and tactile.

1. **Draggable drones** — judge can grab and reposition nodes; links follow live.
2. **Hover details** — hover a drone → tooltip with status, risk, live traffic; hover a link → its current features + verdict + confidence.
3. **Packets that show consequence** — on a jammed link, packets visibly pile up / drop; on reroute, they visibly take the new blue path. The eye should see traffic *failing then healing*, not just colors.
4. **Risk heatmap / predicted next target** — each drone glows by a risk score (how attack-like its recent traffic trended), so danger is visible *before* an attack lands. (Backend may supply a per-node risk; if not, derive client-side from incident-link confidences.)
5. **Auto-focus the action** — when an attack hits, briefly pan/zoom or pulse-highlight that region so attention goes where it matters.
6. **Audio cues (optional)** — subtle blip on detection, lower tone on isolation. Cheap, high demo impact. Must be mutable.

Acceptance: nodes drag, hovers show live data, packets visibly drop+reroute, drones glow by risk, demo reads as a living system. `tsc --noEmit` passes. MOCK mode still works.

---

## Part B — Attacker laptop (the second machine)

Laptop 2 plays two roles with ONE program: a live **attacker console** and a real **mesh node** that, when killed, makes the swarm heal.

### B1 — Attacker console (new small app, `attacker/` at repo root)
- A standalone terminal/TUI (Python, reuse backend venv) OR a tiny web page — pick terminal for credibility.
- Connects to laptop 1's backend WebSocket (`ws://<laptop1-ip>:8000/ws`) and sends real `CommandMessage`s: jam / hack / stealth / reset, targeting a chosen link or node.
- Shows what it's firing: a readable log of "launching DoS on D3-D4… launching stealth on D1-D2…", attack menu, target picker.
- Aesthetic: red/offensive theme to contrast the blue/green defender dashboard. This is the "offense screen" in a split-demo.

### B2 — Laptop 2 as a real killable node
- The attacker app ALSO registers laptop 2 as a participating node in the mesh (e.g. an extra node "ATK" or a real drone the backend knows is hosted by laptop 2), sending periodic heartbeats over the WS.
- Backend tracks node liveness: if laptop 2's heartbeats stop (process killed / wifi pulled / lid closed), the backend marks that node down and the swarm reroutes/heals around it — exactly the existing quarantine/heal path.
- Demo beat: attacker rampages → you kill laptop 2 → attacks stop AND its node vanishes → swarm visibly heals → dashboard clean.

### B3 — Networking (chosen: phone hotspot)
- Both laptops join the user's **phone hotspot**; attacker connects to laptop 1's hotspot IP on :8000.
- Backend already binds and CORS-allows all origins; confirm it binds `0.0.0.0` (not just 127.0.0.1) so laptop 2 can reach it.
- Fallbacks if hotspot fails at venue: (a) laptop 1 hosts a local network, (b) ethernet cable. Build IP-configurable (env var / CLI arg), never hardcode localhost.

Acceptance: from laptop 2, attacks land on laptop 1's dashboard in real time; killing the attacker process/wifi makes its node drop and the swarm heal; everything works over hotspot with a documented fallback.

---

## Backend changes (small, `mesh` worktree)
- **Bind 0.0.0.0** for LAN access (run uvicorn with `--host 0.0.0.0`); document it.
- **Node liveness / heartbeat**: accept a heartbeat command from a client claiming a node; if heartbeats lapse > N seconds, mark that node down → triggers existing heal. Add to the command handler.
- **(Optional) per-node risk score** in the state message for the heatmap (Part A item 4). If skipped, frontend derives it.
- Keep all existing tests green; add tests for heartbeat-timeout → node down → reroute.

---

## Demo / recording (the deliverables)
- **In-person:** live, two laptops on hotspot, split offense/defense, kill laptop 2 on camera.
- **Video submission:** record dashboard (OBS/QuickTime) and the physical kill (phone) SEPARATELY, splice in an editor (DaVinci Resolve free / CapCut). Cut to the phone exactly at the laptop kill. Edited is fine.
- Keep the cached-run fallback from Phase 1 in case live networking fails.

## Hard rules (unchanged)
- One shared real model; no fake numbers. RF jamming simulated, said honestly.
- Never attack anything but our own local mesh.
- IP/network configurable, never hardcode localhost for the cross-laptop link.
- Commit rules: plain lowercase messages, no prefixes, no trailer, no mention of ai/claude; commit per step.
