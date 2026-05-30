# `live/` — live attack-traffic detection (EXPERIMENTAL, off by default)

Capture real attack traffic on laptop 1, turn it into the 10 CIC flow features,
and score it with the existing `detector.joblib`. The intent: on laptop 2 you run
a **real** `nmap -sS <laptop1-ip>` (→ PortScan) or `sudo hping3 --flood -S -p 80
<laptop1-ip>` (→ DoS), and the dashboard lights up from genuine packets.

## Status: NOT demo-ready yet

**The live demo runs on the simulated attacker lever** (the attacker-console keys /
dashboard buttons), which is already honest — real XGBoost on real CIC data, attack
simulated. This live path is **env-gated off** and has two blockers (below) that
must be cleared on the two-laptop rig before it can be relied on. The plumbing,
error-handling, and dashboard integration are done and unit-tested; what remains is
a model + cicflowmeter-timing reconciliation that needs the physical rig.

## Enabling it (when ready)

```bash
sudo SKEIN_LIVE_CAPTURE=1 \
     SKEIN_CAPTURE_IFACE=<hotspot-iface> \
     SKEIN_ATTACKER_IP=<laptop2-ip> \
     .venv/bin/uvicorn app:app --host 0.0.0.0 --port 8000
```

Capture needs root. Launch via the **venv** uvicorn so cicflowmeter resolves from
the venv bin (flow_source already prefers `dirname(sys.executable)/cicflowmeter`).
With the flag unset, none of this runs — single-laptop / mock mode is untouched.

## Blockers to clear before flipping it on (the "full size" scale-up)

1. **Feature space mismatch (model can't read raw features).** The detector was
   trained on **CIC-IDS-2017 V2, which is min-max *normalized*** (`train.py:313`,
   "median flow_duration ~4e-4") with a `StandardScaler` fit on those values.
   cicflowmeter emits **raw physical units** (duration in seconds, byte counts in
   the hundreds), and `features.map_flow` does no conversion — so live features land
   far outside the scaler's range and predictions are unreliable.
   **Fix (recommended):** retrain the detector on the **original (un-normalized)
   CICFlowMeter CIC-IDS-2017** so the model and live capture share a feature space.
   **First step, on the rig:** capture one real `nmap` and one real `hping3` flow,
   run `map_flow → detector.predict`, and confirm the label is correct before
   trusting anything.

2. **cicflowmeter flush latency.** Pinned `cicflowmeter==0.5.0` only writes a flow
   on idle ≥ `EXPIRED_UPDATE=240s`, active ≥ `ACTIVE_TIMEOUT=5s`, or a FIN. `nmap`
   tears down with RST and `hping3 --flood` never FINs, so a detection can take
   seconds-to-minutes — not the ~1–2s a demo needs, and there's no CLI flag.
   **Fix:** vendor/monkeypatch cicflowmeter's timeout constants to ~1–2s, then
   measure real end-to-end latency on the rig and record it.

## Layout

- `features.py` — `map_flow`: cicflowmeter flow dict → `FEATURE_COLUMNS`. Column
  names verified against cicflowmeter 0.5.0 `flow.py get_data()`; re-verify on upgrade.
- `capture.py` — `LiveCapture`: filter to attacker IP, score, callback. Survives a
  bad flow (logs + skips, never dies). Shares a stop event for clean shutdown.
- `flow_source.py` — production cicflowmeter subprocess + CSV-tail iterator. The one
  spot coupled to cicflowmeter; resolves the binary from the venv, surfaces stderr
  to a log, detects early exit.
- `wiring.py` — env-gated startup; `app.py` lifespan starts/stops it.
