# Live attack-traffic detection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make laptop 2's real `nmap`/`hping3` traffic get captured on laptop 1, turned into the 10 CIC flow features, scored by the existing `detector.joblib`, and shown on the dashboard via the ATK node's links.

**Architecture:** A background capture thread on laptop 1 reads bidirectional flows from `cicflowmeter` (isolated behind a `flow_source` iterator), keeps only flows involving the attacker IP, maps them to `FEATURE_COLUMNS`, scores them with the same `Detector`, and pushes attack detections into the `Simulator`, which overlays them on the host (ATK) node's incident links for a few ticks. The whole live path is off by default (env-gated) so single-laptop/mock mode is untouched, and the simulated command path stays as a stage fallback.

**Tech Stack:** Python 3.13, FastAPI, `cicflowmeter` (live flow features), `joblib`/XGBoost (existing model), pytest.

**Spec:** `docs/superpowers/specs/2026-05-30-live-traffic-detection-design.md`

---

## File structure

- `backend/live/__init__.py` — new package.
- `backend/live/features.py` — map a cicflowmeter flow dict → the 10 `FEATURE_COLUMNS`. Pure, fully unit-tested.
- `backend/live/capture.py` — `LiveCapture`: filter-by-attacker-IP, score, callback. Core is unit-tested with a fake flow source (no real packets).
- `backend/live/flow_source.py` — production cicflowmeter wrapper (subprocess + CSV tail). The one brittle third-party coupling, isolated here.
- `backend/live/wiring.py` — `maybe_start_live_capture(app, simulator)`: env-gated startup, testable as a no-op when disabled.
- `backend/mesh/simulator.py` — add `push_live_attack()` (thread-safe) + tick overlay on host-node links.
- `backend/app.py` — call the wiring on startup.
- `backend/requirements.txt` — add `cicflowmeter`.
- `docs/DEMO_SCRIPT.md` — add the live-traffic runbook steps.

---

### Task 0: Feature mapping module + dependency

**Goal:** Convert a cicflowmeter flow record into a `{FEATURE_COLUMNS: float}` dict the `Detector` accepts, with bad-value guards.

**Files:**
- Create: `backend/live/__init__.py` (empty)
- Create: `backend/live/features.py`
- Create: `backend/live/test_features.py`
- Modify: `backend/requirements.txt` (add `cicflowmeter`)

**Acceptance Criteria:**
- [ ] `map_flow()` returns a dict whose keys are exactly `FEATURE_COLUMNS`.
- [ ] Non-numeric / NaN / inf values coerce to `0.0`.
- [ ] Missing source columns raise `KeyError` (fail loud, not silent garbage).

**Verify:** `cd backend && ./.venv/bin/python -m pytest live/test_features.py -v` → all pass.

**Steps:**

- [ ] **Step 1: Write the failing test** — `backend/live/test_features.py`

```python
import pytest
from live.features import map_flow
from ml.schema import FEATURE_COLUMNS


def _sample_flow():
    # cicflowmeter-shaped record for a small scan flow (attacker -> laptop 1).
    return {
        "flow_duration": 1234.0, "tot_fwd_pkts": 6, "tot_bwd_pkts": 1,
        "flow_byts_s": 5000.0, "flow_pkts_s": 4200.0, "flow_iat_mean": 30.0,
        "fwd_pkt_len_mean": 20.0, "bwd_pkt_len_mean": 0.0, "pkt_len_mean": 18.0,
        "pkt_size_avg": 22.0, "src_ip": "10.0.0.2", "dst_ip": "10.0.0.1",
    }


def test_map_flow_produces_every_feature_column():
    feats = map_flow(_sample_flow())
    assert set(feats) == set(FEATURE_COLUMNS)
    assert feats["total_fwd_packets"] == 6.0
    assert feats["avg_pkt_size"] == 22.0


def test_map_flow_coerces_bad_values_to_zero():
    flow = _sample_flow()
    flow["flow_byts_s"] = "Infinity"
    flow["flow_pkts_s"] = None
    feats = map_flow(flow)
    assert feats["flow_bytes_s"] == 0.0
    assert feats["flow_packets_s"] == 0.0


def test_map_flow_raises_when_source_lacks_columns():
    with pytest.raises(KeyError):
        map_flow({"flow_duration": 1.0})
```

- [ ] **Step 2: Run test, verify it fails** — `cd backend && ./.venv/bin/python -m pytest live/test_features.py -v` → FAIL (`ModuleNotFoundError: live.features`).

- [ ] **Step 3: Implement** — `backend/live/__init__.py` (empty file) and `backend/live/features.py`:

```python
"""Map a cicflowmeter flow record to the model's FEATURE_COLUMNS dict.

cicflowmeter emits ~80 bidirectional-flow columns; we select the 10 the model
was trained on (ml.schema.FEATURE_COLUMNS). Column names can vary by
cicflowmeter version — verify the left-hand keys against a real CSV header on
the rig (Task 4) before trusting in production.
"""
from __future__ import annotations

import math
from typing import Dict

from ml.schema import FEATURE_COLUMNS

# cicflowmeter column name -> our schema name.
FLOW_FEATURE_MAP: Dict[str, str] = {
    "flow_duration": "flow_duration",
    "tot_fwd_pkts": "total_fwd_packets",
    "tot_bwd_pkts": "total_bwd_packets",
    "flow_byts_s": "flow_bytes_s",
    "flow_pkts_s": "flow_packets_s",
    "flow_iat_mean": "flow_iat_mean",
    "fwd_pkt_len_mean": "fwd_pkt_len_mean",
    "bwd_pkt_len_mean": "bwd_pkt_len_mean",
    "pkt_len_mean": "pkt_len_mean",
    "pkt_size_avg": "avg_pkt_size",
}


def map_flow(flow: Dict[str, object]) -> Dict[str, float]:
    feats: Dict[str, float] = {}
    for cic_key, our_key in FLOW_FEATURE_MAP.items():
        try:
            val = float(flow[cic_key])  # KeyError propagates -> fail loud
        except (TypeError, ValueError):
            val = 0.0
        if math.isnan(val) or math.isinf(val):
            val = 0.0
        feats[our_key] = val
    missing = set(FEATURE_COLUMNS) - set(feats)
    if missing:
        raise KeyError(f"flow mapping missing features: {sorted(missing)}")
    return feats
```

- [ ] **Step 4: Add dependency** — append `cicflowmeter` to `backend/requirements.txt`, then `cd backend && ./.venv/bin/pip install cicflowmeter`.

- [ ] **Step 5: Run test, verify pass** — `cd backend && ./.venv/bin/python -m pytest live/test_features.py -v` → PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/live/__init__.py backend/live/features.py backend/live/test_features.py backend/requirements.txt
git commit -m "map cicflowmeter flow records to the model feature columns"
```

---

### Task 1: Live capture core

**Goal:** A `LiveCapture` that consumes a flow iterator, keeps only flows touching the attacker IP, scores them with the `Detector`, and calls a callback on each attack (non-BENIGN) detection — runnable in a background thread but unit-tested synchronously.

**Files:**
- Create: `backend/live/capture.py`
- Create: `backend/live/test_capture.py`

**Acceptance Criteria:**
- [ ] Flows not involving the attacker IP are skipped (no callback).
- [ ] A non-BENIGN prediction triggers the callback with `(features, prediction)`.
- [ ] A BENIGN prediction does not trigger the callback.

**Verify:** `cd backend && ./.venv/bin/python -m pytest live/test_capture.py -v` → all pass.

**Steps:**

- [ ] **Step 1: Write the failing test** — `backend/live/test_capture.py`

```python
from live.capture import LiveCapture
from ml.schema import BENIGN


class FakeDetector:
    def __init__(self, label):
        self.label = label

    def predict(self, feats):
        at = None if self.label == BENIGN else self.label
        return {"label": self.label, "attack_type": at, "confidence": 0.99}


def _flow(src="10.0.0.2", dst="10.0.0.1"):
    return {
        "flow_duration": 1.0, "tot_fwd_pkts": 6, "tot_bwd_pkts": 1,
        "flow_byts_s": 1.0, "flow_pkts_s": 1.0, "flow_iat_mean": 1.0,
        "fwd_pkt_len_mean": 1.0, "bwd_pkt_len_mean": 1.0, "pkt_len_mean": 1.0,
        "pkt_size_avg": 1.0, "src_ip": src, "dst_ip": dst,
    }


def test_only_attacker_flows_are_scored():
    got = []
    cap = LiveCapture([_flow(src="10.0.0.9", dst="10.0.0.8")],
                      FakeDetector("PortScan"), "10.0.0.2",
                      lambda f, p: got.append(p))
    cap._run()
    assert got == []


def test_attack_flow_triggers_callback():
    got = []
    cap = LiveCapture([_flow()], FakeDetector("PortScan"), "10.0.0.2",
                      lambda f, p: got.append(p))
    cap._run()
    assert len(got) == 1 and got[0]["label"] == "PortScan"


def test_benign_flow_does_not_trigger_callback():
    got = []
    cap = LiveCapture([_flow()], FakeDetector(BENIGN), "10.0.0.2",
                      lambda f, p: got.append(p))
    cap._run()
    assert got == []
```

- [ ] **Step 2: Run test, verify fail** — `cd backend && ./.venv/bin/python -m pytest live/test_capture.py -v` → FAIL (`ModuleNotFoundError: live.capture`).

- [ ] **Step 3: Implement** — `backend/live/capture.py`:

```python
"""Live capture: flow iterator -> filter -> Detector -> callback.

The brittle third-party piece (cicflowmeter) is isolated in flow_source.py and
injected here as `flow_source`, an iterator of flow dicts. That keeps this core
unit-testable with a plain list and no real packets.
"""
from __future__ import annotations

import threading
from typing import Callable, Dict, Iterable, Optional

from live.features import map_flow
from ml.schema import BENIGN


class LiveCapture:
    def __init__(
        self,
        flow_source: Iterable[Dict],
        detector,
        attacker_ip: str,
        on_detection: Callable[[Dict[str, float], Dict[str, object]], None],
    ) -> None:
        self._flow_source = flow_source
        self._detector = detector
        self._attacker_ip = attacker_ip
        self._on_detection = on_detection
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None

    def _involves_attacker(self, flow: Dict) -> bool:
        return self._attacker_ip in (flow.get("src_ip"), flow.get("dst_ip"))

    def _run(self) -> None:
        for flow in self._flow_source:
            if self._stop.is_set():
                break
            if not self._involves_attacker(flow):
                continue
            feats = map_flow(flow)
            pred = self._detector.predict(feats)
            if pred["label"] != BENIGN:
                self._on_detection(feats, pred)

    def start(self) -> None:
        self._thread = threading.Thread(
            target=self._run, name="skein-live-capture", daemon=True
        )
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
```

- [ ] **Step 4: Run test, verify pass** — `cd backend && ./.venv/bin/python -m pytest live/test_capture.py -v` → PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/live/capture.py backend/live/test_capture.py
git commit -m "score live attacker flows with the existing detector"
```

---

### Task 2: Simulator live-overlay integration

**Goal:** Add a thread-safe `push_live_attack()` to the `Simulator` and overlay the live detection onto the host (ATK) node's incident links for a few ticks, so a real scan lights up the dashboard like an attack and then clears.

**Files:**
- Modify: `backend/mesh/simulator.py`
- Modify: `backend/mesh/test_simulator.py`

**Acceptance Criteria:**
- [ ] After `push_live_attack(...)`, the host node's incident links report the pushed prediction label and threat is non-NOMINAL.
- [ ] After the TTL elapses, those links no longer report the pushed label.
- [ ] `push_live_attack` is safe to call from another thread (guarded by a lock).

**Verify:** `cd backend && ./.venv/bin/python -m pytest mesh/test_simulator.py -v` → all pass.

**Steps:**

- [ ] **Step 1: Write the failing tests** — append to `backend/mesh/test_simulator.py`:

```python
def test_live_attack_overlays_on_host_node_links():
    sim = Simulator()
    sim.heartbeat("ATK")        # register the host (attacker) node
    sim.tick()
    feats = {c: 1.0 for c in FEATURE_COLUMNS}
    sim.push_live_attack(
        feats, {"label": "PortScan", "attack_type": "PortScan", "confidence": 0.97},
        ttl_ticks=3,
    )
    state = sim.tick()
    atk_links = [l for l in state["links"] if "ATK" in (l["source"], l["target"])]
    assert atk_links, "ATK node should have incident links"
    assert all(l["prediction"]["label"] == "PortScan" for l in atk_links)
    assert state["threat_level"] != "NOMINAL"


def test_live_attack_expires_after_ttl():
    sim = Simulator()
    sim.heartbeat("ATK")
    sim.tick()
    feats = {c: 1.0 for c in FEATURE_COLUMNS}
    sim.push_live_attack(
        feats, {"label": "DoS", "attack_type": "DoS", "confidence": 0.95},
        ttl_ticks=1,
    )
    for _ in range(4):
        state = sim.tick()
    atk_links = [l for l in state["links"] if "ATK" in (l["source"], l["target"])]
    assert all(l["prediction"]["label"] != "DoS" for l in atk_links)
```

- [ ] **Step 2: Run tests, verify fail** — `cd backend && ./.venv/bin/python -m pytest mesh/test_simulator.py -k live_attack -v` → FAIL (`AttributeError: push_live_attack`).

- [ ] **Step 3: Implement** — in `backend/mesh/simulator.py`:

Add the import at the top with the other stdlib imports:

```python
import threading
```

In `Simulator.__init__`, after `self.compromised: dict[str, int] = {}`:

```python
        # Live-capture overlay (real attacker traffic). Written from the capture
        # thread via push_live_attack(), read in tick(); guarded by a lock.
        self._live_lock = threading.Lock()
        self._live_attack: Optional[dict] = None
```

Add the public method (near the other command methods):

```python
    def push_live_attack(
        self, features: dict, prediction: dict, ttl_ticks: int = 3
    ) -> None:
        """Thread-safe. Overlay a live-captured attack onto host-node links for
        the next ttl_ticks ticks. Called from the LiveCapture thread."""
        with self._live_lock:
            self._live_attack = {
                "features": dict(features),
                "prediction": dict(prediction),
                "expires_tick": self.tick_count + ttl_ticks,
            }
```

In `tick()`, immediately after `self.tick_count += 1` and the phase-2 compromise block, before `hacked = self.hacked_nodes`, resolve the live overlay:

```python
        # Resolve any live-captured attack overlay (real attacker traffic).
        with self._live_lock:
            live = self._live_attack
            if live is not None and live["expires_tick"] < self.tick_count:
                live = self._live_attack = None
        live_link_ids: set[str] = set()
        if live is not None:
            for host in self.host_nodes:
                for l in self.graph.links_incident_to(host):
                    live_link_ids.add(l.id)
```

In the sampling loop (`for link in self.graph.links:`), as the first branch inside the loop, right after the `if link.id in severed:` block, add the live overlay branch:

```python
            if live is not None and link.id in live_link_ids and link.id not in severed:
                link.prediction = live["prediction"]
                link.features = live["features"]
                link.reasons = self._explain(live["features"])
                link.status = "jammed"
                link.active = False
                jammed_count += 1
                if link.id not in self._announced_detections:
                    self._emit(
                        "detection",
                        f"LIVE ATTACK on {link.id}: {live['prediction']['label']} "
                        f"({live['prediction']['confidence'] * 100:.0f}% conf) — real traffic",
                    )
                    self._announced_detections.add(link.id)
                continue
```

In `command("reset", ...)`, clear the overlay alongside the other state — after `self.compromised.clear()`:

```python
            with self._live_lock:
                self._live_attack = None
```

- [ ] **Step 4: Run tests, verify pass** — `cd backend && ./.venv/bin/python -m pytest mesh/test_simulator.py -v` → PASS (new + existing).

- [ ] **Step 5: Commit**

```bash
git add backend/mesh/simulator.py backend/mesh/test_simulator.py
git commit -m "overlay live-captured attacks on the host node's mesh links"
```

---

### Task 3: Production flow source + env-gated wiring

**Goal:** Provide the real cicflowmeter-backed flow iterator and an env-gated startup that launches `LiveCapture` only when explicitly enabled — leaving single-laptop/mock mode untouched.

**Files:**
- Create: `backend/live/flow_source.py`
- Create: `backend/live/wiring.py`
- Create: `backend/live/test_wiring.py`
- Modify: `backend/app.py`

**Acceptance Criteria:**
- [ ] With `SKEIN_LIVE_CAPTURE` unset, `maybe_start_live_capture` returns `None` and starts nothing.
- [ ] With it set but no `SKEIN_ATTACKER_IP`, it returns `None` (safe no-op).
- [ ] `app.py` calls the wiring on startup without breaking existing startup.

**Verify:** `cd backend && ./.venv/bin/python -m pytest live/test_wiring.py -v` → pass; `cd backend && ./.venv/bin/python -c "import app"` → no error.

**Steps:**

- [ ] **Step 1: Write the failing test** — `backend/live/test_wiring.py`

```python
from live.wiring import maybe_start_live_capture


class _FakeSim:
    detector = object()

    def push_live_attack(self, *a, **k):
        pass


def test_disabled_when_env_unset(monkeypatch):
    monkeypatch.delenv("SKEIN_LIVE_CAPTURE", raising=False)
    assert maybe_start_live_capture(_FakeSim()) is None


def test_disabled_when_attacker_ip_missing(monkeypatch):
    monkeypatch.setenv("SKEIN_LIVE_CAPTURE", "1")
    monkeypatch.delenv("SKEIN_ATTACKER_IP", raising=False)
    assert maybe_start_live_capture(_FakeSim()) is None
```

- [ ] **Step 2: Run test, verify fail** — `cd backend && ./.venv/bin/python -m pytest live/test_wiring.py -v` → FAIL (`ModuleNotFoundError: live.wiring`).

- [ ] **Step 3: Implement the flow source** — `backend/live/flow_source.py`:

```python
"""Production flow source: run cicflowmeter writing CSV, tail rows as dicts.

This is the one place coupled to cicflowmeter's CLI/output, so the rest of the
live path stays testable. Capture requires root on laptop 1 (run the server
with sudo, or grant the python binary capture caps). Verify the exact CLI flags
and CSV column names against the installed cicflowmeter version on the rig
(Task 4) — they vary between releases.
"""
from __future__ import annotations

import csv
import os
import subprocess
import tempfile
import time
from typing import Dict, Iterator


def cicflowmeter_flows(iface: str, flush_seconds: float = 1.0) -> Iterator[Dict[str, str]]:
    out_dir = tempfile.mkdtemp(prefix="skein-flows-")
    out_csv = os.path.join(out_dir, "flows.csv")
    proc = subprocess.Popen(
        ["cicflowmeter", "-i", iface, "-c", out_csv],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        while not os.path.exists(out_csv):
            time.sleep(flush_seconds)
        with open(out_csv, newline="") as f:
            reader = csv.DictReader(f)
            while True:
                row = next(reader, None)
                if row is None:
                    time.sleep(flush_seconds)
                    continue
                yield row
    finally:
        proc.terminate()
```

- [ ] **Step 4: Implement the wiring** — `backend/live/wiring.py`:

```python
"""Env-gated startup for the live-capture path. Off unless explicitly enabled."""
from __future__ import annotations

import os
from typing import Optional

from live.capture import LiveCapture


def maybe_start_live_capture(simulator) -> Optional[LiveCapture]:
    if os.getenv("SKEIN_LIVE_CAPTURE") != "1":
        return None
    attacker_ip = os.getenv("SKEIN_ATTACKER_IP")
    if not attacker_ip:
        return None
    iface = os.getenv("SKEIN_CAPTURE_IFACE", "en0")
    from live.flow_source import cicflowmeter_flows

    source = cicflowmeter_flows(iface)
    capture = LiveCapture(
        source, simulator.detector, attacker_ip, simulator.push_live_attack
    )
    capture.start()
    return capture
```

- [ ] **Step 5: Wire into app startup** — in `backend/app.py`, after `simulator = Simulator()`:

```python
from live.wiring import maybe_start_live_capture


@app.on_event("startup")
def _start_live_capture() -> None:
    app.state.live_capture = maybe_start_live_capture(simulator)
```

- [ ] **Step 6: Run tests + import check** — `cd backend && ./.venv/bin/python -m pytest live/test_wiring.py -v` → PASS; `cd backend && ./.venv/bin/python -c "import app"` → no error.

- [ ] **Step 7: Commit**

```bash
git add backend/live/flow_source.py backend/live/wiring.py backend/live/test_wiring.py backend/app.py
git commit -m "wire env-gated live capture into backend startup"
```

---

### Task 4: Two-laptop rig verification + runbook

**Goal:** Prove the whole path works on the real two-laptop rig — a real `nmap` scan and `hping3` flood from laptop 2 light up the ATK node on laptop 1's dashboard with the right class — and document the exact launch steps.

**USER-ORDERED GATE — NON-SKIPPABLE.** This task was requested by the user in the current conversation. It MUST NOT be closed by walking around it, by declaring it "verified inline", or by substituting a cheaper check. Close only after every item in `acceptanceCriteria` has been re-validated independently, with output captured.

**Files:**
- Modify: `docs/DEMO_SCRIPT.md`

**Acceptance Criteria:**
- [ ] `cicflowmeter` CSV column names confirmed against the installed version and `FLOW_FEATURE_MAP` updated if they differ.
- [ ] On laptop 1: `sudo SKEIN_LIVE_CAPTURE=1 SKEIN_CAPTURE_IFACE=<iface> SKEIN_ATTACKER_IP=<laptop2-ip> ./.venv/bin/uvicorn app:app --host 0.0.0.0 --port 8000` starts cleanly.
- [ ] From laptop 2, `nmap -sS <laptop1-ip>` makes the ATK node's links show **PortScan** on the dashboard within ~2s.
- [ ] From laptop 2, `sudo hping3 --flood -S -p 80 <laptop1-ip>` makes them show **DoS**; stopping the attack clears them within the TTL.
- [ ] Runbook steps added to `docs/DEMO_SCRIPT.md`.

**Verify:** Manual, on the rig — observe the dashboard transitions above; capture a screen recording or note the event-feed lines (`LIVE ATTACK on ATK-D4: PortScan …`).

**Steps:**

- [ ] **Step 1: Confirm column names** — on laptop 1, run `cicflowmeter -i <iface> -c /tmp/probe.csv` briefly during a test scan, inspect the header, and reconcile the left-hand keys in `backend/live/features.py::FLOW_FEATURE_MAP`. Update + re-run `pytest live/test_features.py` if any differ.

- [ ] **Step 2: Launch with live capture** — start the backend with the env vars above (root for capture). Confirm no startup error and `app.state.live_capture` is set.

- [ ] **Step 3: Fire the scan** — from laptop 2, `nmap -sS <laptop1-ip>`. Watch the dashboard ATK links flip to PortScan and the feed emit the `LIVE ATTACK …` line.

- [ ] **Step 4: Fire the flood** — `sudo hping3 --flood -S -p 80 <laptop1-ip>`; confirm DoS; stop it and confirm the links clear within the TTL.

- [ ] **Step 5: Document** — add the laptop-1 launch command, laptop-2 attack commands, and the IP/iface notes to `docs/DEMO_SCRIPT.md`.

- [ ] **Step 6: Commit**

```bash
git add docs/DEMO_SCRIPT.md backend/live/features.py
git commit -m "document and verify live-traffic detection on the two-laptop rig"
```

---

## Notes / risks (carried from the spec)

- **cicflowmeter parity** is the top risk — column names/units must match `schema.py`. Task 4 Step 1 reconciles this on the rig.
- **Capture permissions** — laptop 1's backend needs root for packet capture; documented in the runbook.
- **Fallback** — the simulated attacker-key command path is unchanged, so the demo still works if live capture is disabled or flaky.
- **Distribution shift** beyond the two demo attacks is out of scope; only `nmap` scan and `hping3` flood are claimed.
