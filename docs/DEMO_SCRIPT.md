# Skein — Demo Runbook

**Self-healing drone-swarm mesh that detects RF/cyber attacks in real time and reroutes around the damage.**

For the Bow Capital × Firestorm hackathon. Firestorm builds front-line drone swarms; Bow funds AI/ML + defense.

> Use this doc live while presenting. Bold = **what you click/do**. Quotes = **what you say**.

---

## 1. 30-Second Pitch

> "Firestorm puts drone swarms on the front line — and the front line is the most contested RF environment on Earth. The enemy's first move isn't a missile, it's a jammer. The instant they jam your links or spoof a node, your swarm goes blind and scatters.
>
> **Skein is the immune system for the swarm.** Every drone is a mesh node. We watch the network traffic in real time with a machine-learning detector — trained on 2 million-plus real network records, ~99% accuracy — and the moment a link is jammed or a drone is compromised, we detect it, quarantine the bad node, and self-heal the mesh around the damage. No human in the loop, sub-second.
>
> That's the Bow thesis exactly: real AI/ML applied to a real defense problem. This isn't a hardcoded toggle — it's a model classifying live traffic, deciding what's an attack, and the swarm routing around it. Let me show you."

**One-liner if rushed:** "Skein is a self-healing drone mesh — ML detects jamming and hacks in real time, and the swarm reroutes around the dead node automatically."

---

## 2. Setup Checklist

### Laptop 1 — Defense Dashboard (the screen judges watch)
- [ ] **Start backend:**
  ```
  cd backend
  uvicorn app:app --host 0.0.0.0 --port 8000
  ```
  (`--host 0.0.0.0` is required so laptop 2 can reach it — not just localhost.)
- [ ] **Start frontend:**
  ```
  cd frontend
  npm run dev
  ```
- [ ] Open **http://localhost:3000** — confirm swarm map renders, stats bar is live, event feed scrolling.
- [ ] Confirm backend is healthy: browser to **http://localhost:8000** (or its docs/health route) returns OK.

### Connect the two laptops
- [ ] **Phone hotspot ON.** Connect BOTH laptops to the same hotspot SSID. (Hotspot beats venue Wi-Fi — no client isolation, no captive portal.)
- [ ] **Critical:** backend MUST be started with `--host 0.0.0.0` (above), not the default localhost, or laptop 2 can't reach it.
- [ ] **Fallbacks if hotspot flakes:** laptop 1 hosts a local Wi-Fi network laptop 2 joins; or an ethernet cable with static IPs. Same subnet is all that matters.
- [ ] **Find laptop 1's IP** (run on laptop 1):
  - macOS: `ipconfig getifaddr en0` (try `en1` if blank)
  - Linux: `hostname -I` or `ip addr`
  - Note the address, e.g. `192.168.x.x`.
- [ ] **Sanity check from laptop 2:** open `http://<laptop1-ip>:8000` in a browser (should return the health JSON), or `ping <laptop1-ip>`. Must succeed before you trust the live link.

### Laptop 2 — Attacker Console (the real mesh node)
- [ ] Point the attacker at laptop 1 (pass the **IP only** via `--host`, not a full URL; it builds `ws://<host>:8000/ws` itself):
  ```
  cd attacker
  python3 -m venv .venv && . .venv/bin/activate
  pip install -r requirements.txt        # just `websockets`
  python attacker.py --host <laptop1-ip>  # or set SKEIN_HOST
  ```
  (`--host` is REQUIRED — no localhost default. For single-laptop fallback pass `--host 127.0.0.1` explicitly.)
- [ ] Console keys: **`1` jam · `2` stealth · `3` hack · `4` reset · `r` refresh · `q` quit.** After a key, pick a target by index or id from the live list it prints.
- [ ] Confirm node **`ATK`** (laptop 2) shows up as a **live node** on laptop 1's swarm map before the demo (it links to `D4` and `D5`; this is the node you'll later kill).

### Final pre-flight (do this 2 min before presenting)
- [ ] Reset to a clean healthy state (Reset control on dashboard).
- [ ] All panels visible & legible at projector resolution.
- [ ] Run the **kill-laptop-2** beat ONCE in rehearsal so you know healing actually fires.

---

## 3. Live Demo Sequence (60–90 sec)

> Pace: don't rush. Let each detection visibly "pop" on screen before you talk over it.

**Beat 0 — Idle healthy swarm (~5s)**
- (a) **Do:** Just show the running dashboard, swarm at rest.
- (b) **Judge sees:** Nodes connected, green/healthy, live stats ticking, raw data scope streaming feature→prediction rows all classifying as benign.
- (c) **Say:** "Here's the swarm in the air. Every line is a mesh link. Down here, the detector is classifying live network traffic right now — every row is real features going into the model, and it's calling everything benign. That's the baseline."

**Beat 1 — Jam a link (~15s)**
- (a) **Do:** Click a **link** on the swarm map to select it (bottom bar shows "Link …"), then click **Jam link**.
- (b) **Judge sees:** Detector panel flips to **DoS / attack flagged**, the jammed link lights up red / risk-glows, raw scope shows the prediction flip, swarm computes a **reroute** around the dead link.
- (c) **Say:** "I just jammed that link — a denial-of-service flood, like an RF jammer saturating the channel. Watch: the model flagged it as a DoS attack in real time, and the swarm immediately rerouted traffic around the dead link. The mission keeps moving."

**Beat 2 — Hack a drone (~15s)**
- (a) **Do:** Click a **drone node** on the map to select it (bar shows "Drone …"), then click **Hack drone**.
- (b) **Judge sees:** Target node flagged as compromised, **quarantined / isolated**, mesh heals around it, "why it flagged" panel shows the offending features.
- (c) **Say:** "Now a harder attack — a drone gets compromised, not just jammed. The detector catches the anomalous traffic, we quarantine that node so it can't poison the rest of the swarm, and the mesh heals around it. Notice the 'why it flagged' panel — it shows the exact features that triggered the call. It's explainable, not a black box."

**Beat 3 — Stealth attack (the credibility beat) (~15s)**
- (a) **Do:** Fire stealth from the **attacker console on laptop 2** — press **`2`**, then pick a link by index. (There's no stealth button on the dashboard; this is a "low-and-slow" attack only the console launches. Single-laptop fallback: run the console against `--host 127.0.0.1`.)
- (b) **Judge sees:** On laptop 1's dashboard, traffic that looks benign on the surface still gets flagged; detector confidence + reasoning shown.
- (c) **Say:** "This is the one that matters. A stealth, low-and-slow attack — traffic engineered to look benign, the kind a simple threshold or a 'did the drone go dark?' check would miss completely. The model still catches it, because it's classifying the full feature pattern, not just looking for an obvious outage. That's the difference between a real IDS and a tripwire."

**Beat 4 — Real attacker node + kill it (~20s)**
- (a) **Do:** Show laptop 2's red offense console (already running, node `ATK` live). Fire one more attack from it (e.g. `3` hack) so judges see the commands originate there. Then **kill laptop 2** — Ctrl-C / `q`, close the lid, or pull it off the hotspot.
- (b) **Judge sees:** `ATK` was a real participating node (linked to `D4`/`D5`); when its heartbeats stop, the backend marks it down after the ~4s timeout, severs those links, and the swarm on laptop 1 **heals around the now-dead real node** with blue reroute links — the same self-heal path as a quarantined drone.
- (c) **Say:** "Everything so far was on one screen — let me prove it's real. This second laptop isn't a slideshow; it's an actual mesh node attacking us over the network, heartbeating once a second. Now I physically kill it —" **(kill it)** "— give it a couple seconds... and the swarm heals around a node that genuinely just disappeared. Detection, quarantine, and routing are all real."

**Beat 5 — Reset (optional close)**
- (a) **Do:** Click **Reset** on the dashboard (always enabled; no selection needed).
- (b) **Say:** "And we recover to full health. That whole loop — detect, isolate, reroute — runs with no human in the loop."

---

## 4. Credibility Lines (say these, they're true)

- **"Real model, real data."** ~99% accuracy XGBoost trained on **CIC-IDS-2017 — 2M+ rows of real network traffic.** Not synthetic, not toy.
- **"It classifies, it doesn't toggle."** The dashboard isn't flipping a hardcoded `isAttacked = true`. Live features go into the model and it returns a prediction — you can watch that in the raw data scope.
- **"Explainable."** The "why it flagged" panel shows the features driving each decision — important for defense acceptance and operator trust.
- **Be honest about scope:** "The **jamming/RF effect is simulated** — we're not radiating in this room. But the **detection, classification, quarantine, and mesh re-routing are all real and running live.** The ML and the networking are the hard parts, and those are real."
- **"Real distributed system."** The two-laptop setup proves nodes talk over an actual network and the swarm heals around a genuinely-lost node.

---

## 5. Fallback Plan (a failure never kills the demo)

**If the hotspot / networking fails (laptop 2 unreachable):**
- Skip Beat 4. Run the ENTIRE demo on **laptop 1 alone** — Beats 0–3 + Reset are fully self-contained on the dashboard and need no network.
- Cover verbally: "Normally we'd show a second physical node dying and the swarm healing around it — happy to demo that one-on-one after; the same detect-and-reroute logic you just saw drives it."

**If the live run misbehaves (model/UI hiccup):**
- Hit **Reset** and re-run the misbehaving beat once — it's fast.
- If a specific attack stalls, move on; you have 4 attack types (jam/stealth/hack/reset), you only need 2–3 to land the story.
- If the dashboard shows an offline/mock `mode` (it falls back to cached mock data when the WS is down), restart the backend — but you can still narrate the canned behavior if cornered.

**If the dashboard won't start at all:**
- Have a **pre-recorded screen capture** of the full sequence ready on the desktop. Narrate over it with the same script. Lead with: "Here's a recording from our last run so I can walk you through it cleanly," then offer a live attempt if time allows.

**General rule:** keep talking. The pitch + credibility lines carry the story even if a click fails. Never go silent debugging on stage.

---

## 6. Likely Judge Questions + Crisp Answers

**Q: "How does it know a drone is hacked / jammed?"**
> "It watches the network-traffic features each node produces and runs them through our trained classifier. A jam looks like a DoS flood; a compromise produces anomalous traffic patterns. The model recognizes the signature and flags it — same way an IDS works, but inline on the mesh and fast enough to act on."

**Q: "Is this real data, or did you fake it?"**
> "Real. The model is trained on CIC-IDS-2017 — over 2 million rows of real labeled network traffic — and gets ~99% accuracy. At demo time it's classifying live feature streams, which you can watch in the raw data scope. The only simulated piece is the physical RF jamming, because we're not radiating in the room."

**Q: "What's novel here versus an existing IDS like Snort/Suricata?"**
> "Two things. One: it's coupled to **autonomous self-healing** — detection directly triggers quarantine and mesh re-routing with no human in the loop. A traditional IDS just alerts; ours acts. Two: it's built for the **swarm topology** — the network IS the weapon system, so detection and routing live together on the edge node."

**Q: "Couldn't you just notice a drone went dark and route around it?"**
> "For a crude jam, sure — but the enemy's real play is stealth: a compromised node that stays online and looks normal while it poisons the swarm. A 'did it go dark?' check misses that entirely. The stealth-attack beat showed the model catching traffic that looks benign on the surface. That's the whole point."

**Q: "How would this deploy on real drones?"**
> "The detector is a lightweight classifier — XGBoost runs comfortably on an edge compute module on each drone. Each node scores its own traffic locally and shares quarantine/route decisions over the mesh. Next step is feeding it real RF/PHY-layer features from the radios instead of simulated jamming, and hardening the routing protocol. The architecture — per-node detection plus distributed healing — is already what you saw."

**Q: "What about false positives quarantining a healthy drone?"**
> "Tunable. We can set the confidence threshold for quarantine and require corroboration from neighbors before isolating a node. The 'why it flagged' explainability also lets an operator audit decisions. ~99% accuracy on the benchmark gives us real headroom to tune conservatively."

**Q: "Does it scale to a large swarm?"**
> "Detection is per-node and local, so it scales linearly — each drone scores its own traffic. The routing/healing is the standard distributed mesh problem, which is well-understood; the new part we added is making detection drive it automatically."
