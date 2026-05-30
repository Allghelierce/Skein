# Design: live attack-traffic detection (real packets → real ML)

**Status:** parked stretch goal — build only after the core demo is locked.
**Date:** 2026-05-30
**Owner:** ctvillegas

## Goal

Today, pressing an attack lever (or the laptop-2 attacker key) sends a *command* and
the backend *samples a pre-recorded CIC row* of the matching class. This design
replaces that — for the two-laptop demo — with **real attack traffic**:

- On **laptop 2** the operator literally types a real attack at laptop 1's IP:
  - Port scan → `nmap -sS <laptop1-ip>`  (classifies as **PortScan**)
  - SYN flood → `sudo hping3 --flood -S -p 80 <laptop1-ip>`  (classifies as **DoS**)
- On **laptop 1** the backend captures those real packets, computes the **same 10
  CIC flow features** the model was trained on, and scores them with the **same
  `detector.joblib` XGBoost model**. The dashboard lights up from genuine packets.

This is the strongest possible credibility beat: *not a replayed dataset — that is
an actual scan hitting this machine right now, caught by real ML.* It is legal
because it is our own machines on our own LAN. It is the first concrete step of the
post-hackathon roadmap (real traffic → edge deployment).

## Honesty framing (says out loud in the demo)

- RF jamming is still **simulated** (real RF jamming is illegal). Unchanged.
- The network attacks (scan/flood) are now **real packets**, and detection is **real
  ML on live features**. Consistent with the project rule: no fake/hardcoded numbers.

## Architecture (all new pieces on laptop 1)

```
LAPTOP 2 (attacker)                 LAPTOP 1 (defender backend)
  $ nmap -sS <ip>   ── packets ──▶  ① capture NIC (cicflowmeter)
  $ hping3 --flood                      │ group into bidirectional flows (5-tuple)
                                        ▼
                                   ② featurize → 10 FEATURE_COLUMNS
                                        │ filter: only flows to/from laptop-2 IP
                                        ▼
                                   ③ detector.joblib (same XGBoost) → label + conf
                                        │
                                        ▼
                                   ④ inject as the ATK node's live links
                                        │
                                        ▼
                                   simulator tick → WebSocket → dashboard
```

1. **Capture + flow aggregation + featurize** — `cicflowmeter` Python package
   (`pip install cicflowmeter`). Sniffs an interface live, groups packets into
   bidirectional flows by 5-tuple with an idle timeout, and emits CICFlowMeter-
   compatible features in real time. We select the **10** `FEATURE_COLUMNS` from its
   output (names/units verified against `backend/ml/schema.py`). Chosen over the
   Java CICFlowMeter (batch/CSV, fiddly) and a hand-rolled scapy aggregator (feature-
   definition drift risk → model misclassifies).

2. **New module** `backend/live/capture.py` — runs the sniffer in a background
   thread/process, pushes classified flows onto a thread-safe queue the simulator
   drains each tick. Must not block the event loop.

3. **Detector reuse** — feed the 10-feature vector straight into the existing
   `Detector` (same model, same `_explain` z-score path for why-it-flagged).

4. **Simulator integration** — the ATK node (laptop 2) is already wired into the
   mesh (neighbours D4/D5). On a live detection, the ATK node's incident links carry
   the **live** flow + prediction instead of a sampled CIC row. Everything downstream
   (link status, reroute, comms gauge, AI narration) is unchanged.

## Demo-safety guards

- **IP scoping:** only capture/score flows whose peer is laptop 2's IP. Idle = no
  flows = nothing scored → **no benign false positives** (the cardinal demo sin).
- **Fallback path:** keep the existing simulated-command path. If live capture
  hiccups on stage, the attacker key still drives the dashboard. Belt and suspenders.
- **Permissions:** packet capture needs `sudo`/`setcap` on laptop 1; document the
  exact launch command in the runbook. `nmap -sT` (connect scan) avoids root on
  laptop 2 if we want to skip sudo there.

## Why the two demo attacks classify cleanly

- `nmap -sS`: many tiny, short-lived flows, 1–2 packets each, high packets/s, tiny
  payloads → textbook **PortScan** feature profile.
- `hping3 --flood`: sustained high packets/s and bytes/s, many fwd packets →
  textbook **DoS** profile.
  Both are feature-distinctive enough that live-vs-2017 distribution shift should not
  break classification for the demo.

## Risks / open questions

- **Distribution shift** beyond the two demo attacks (benign live traffic, other
  scan types) is unvalidated — out of scope; we only claim the two demo attacks.
- **`cicflowmeter` feature parity** with `schema.py` must be verified empirically
  (field names, units like bytes/s vs bytes, packet-length definitions) before trust.
- **Interface selection** on the hotspot must be correct and documented.
- **Stage timing** — flow idle-timeout vs how long a scan runs; tune so a detection
  appears within ~1–2 s of firing the attack.

## Out of scope

- Detecting arbitrary/real-world attacks beyond `nmap` scan and `hping3` flood.
- Replacing the simulated levers in single-laptop / mock mode (those stay as-is).
- GPS spoofing (separate parked spec).

## Effort estimate

~Half a day for someone comfortable with scapy/packet capture, plus real testing on
the two-laptop rig. Strictly a stretch goal; do not start before the core is locked.
