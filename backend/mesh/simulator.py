"""Simulator — the live world + battle loop.

Each tick, every link samples a REAL CIC row (benign vs attack, depending on its
attack state), the detector scores it, and the swarm's visible state is driven by
those predictions. When the detector flags a link, routing finds a genuine
alternate path around the damage (networkx) and the affected detour links light
up as "rerouted". Nothing here is hardcoded theater — link status follows the
ML output, and reroutes follow real graph computation.

Until Task A lands the trained model (`models/detector.joblib`), a `FakeDetector`
fills in: it's a nearest-centroid classifier fit on the same CIC sample rows, so
it classifies the well-separated benign/attack rows correctly on features alone.
Swapping in the real `Detector` is a one-line import change.
"""

from __future__ import annotations

import csv
import random
import time
from collections import deque
from datetime import datetime
from pathlib import Path
from typing import Callable, Optional

from ml.schema import (
    ACTION_TO_ATTACK,
    ALL_LABELS,
    ATTACK_TYPES,
    BENIGN,
    FEATURE_COLUMNS,
)
from mesh.graph import SwarmGraph
from mesh.routing import components, shortest_path

_BACKEND_DIR = Path(__file__).resolve().parent.parent
_SAMPLE_CSV = _BACKEND_DIR / "data" / "sample" / "cic_sample.csv"
_MODEL_PATH = _BACKEND_DIR / "models" / "detector.joblib"

_EVENT_BUFFER = 20

# Sentinel attack_type for a stealth attack: samples real attack flows that most
# resemble benign traffic, so the detector struggles to flag them.
STEALTH = "stealth"

# A host node whose heartbeats lapse for longer than this is declared down, and
# the swarm reroutes around it. ~4s tolerates a couple of dropped beats (the
# attacker sends one per second) while still healing visibly on a real kill.
HEARTBEAT_TIMEOUT_SECONDS = 4.0

# Where external host nodes land when they join. Laptop 2 ("ATK") sits at the
# bottom-right edge, linked to two real drones so its loss is always survivable
# (the swarm heals around it rather than partitioning).
HOST_NODE_SPECS: dict[str, dict] = {
    "ATK": {"x": 0.95, "y": 0.78, "neighbours": ["D4", "D5"]},
}
_DEFAULT_HOST_SPEC = {"x": 0.95, "y": 0.90, "neighbours": ["D5", "D6"]}


def _now() -> str:
    return datetime.now().strftime("%H:%M:%S")


def _load_rows(csv_path: Path) -> list[dict]:
    with open(csv_path, newline="") as f:
        return list(csv.DictReader(f))


class FakeDetector:
    """Benign-biased k-NN classifier fit on the CIC sample.

    A real (if simple) classic-ML classifier on the real sample rows — no
    hardcoded verdicts. It is deliberately biased toward BENIGN: a link is only
    called an attack when its single nearest neighbour is an attack AND attack
    neighbours strictly out-vote benign ones among the k nearest. That keeps the
    idle swarm free of false alarms (the cardinal demo sin) while still cleanly
    flagging the DoS/PortScan flows the mesh actually injects. Used only until
    Task A's trained `Detector` (models/detector.joblib) is present.
    """

    def __init__(self, labeled_rows: list[dict], k: int = 5) -> None:
        import numpy as np

        self._np = np
        self._X = np.array(
            [[float(r[c]) for c in FEATURE_COLUMNS] for r in labeled_rows], dtype=float
        )
        self._y = [r["label"] for r in labeled_rows]
        self._k = min(k, len(self._y))

        self._mean = self._X.mean(axis=0)
        std = self._X.std(axis=0)
        std[std == 0] = 1.0
        self._std = std
        self._Xs = (self._X - self._mean) / self._std  # standardized training set

    def predict(self, features: dict) -> dict:
        np = self._np
        x = np.array([float(features[c]) for c in FEATURE_COLUMNS], dtype=float)
        xs = (x - self._mean) / self._std

        dists = np.linalg.norm(self._Xs - xs, axis=1)
        order = np.argsort(dists)[: self._k]
        neigh_labels = [self._y[i] for i in order]
        neigh_weights = 1.0 / (dists[order] + 1e-9)  # distance-weighted votes

        benign_votes = neigh_labels.count(BENIGN)
        attack_votes = self._k - benign_votes
        nearest_is_attack = neigh_labels[0] != BENIGN

        if nearest_is_attack and attack_votes > benign_votes:
            attack_only = [l for l in neigh_labels if l != BENIGN]
            label = max(set(attack_only), key=attack_only.count)
        else:
            label = BENIGN

        # Confidence = distance-weighted share of the chosen label.
        chosen = sum(w for l, w in zip(neigh_labels, neigh_weights) if l == label)
        confidence = float(chosen / neigh_weights.sum())

        return {
            "label": label,
            "attack_type": None if label == BENIGN else label,
            "confidence": confidence,
        }


class Simulator:
    def __init__(
        self,
        csv_path: Optional[Path] = None,
        seed: Optional[int] = None,
        clock: Optional[Callable[[], float]] = None,
    ) -> None:
        self.graph = SwarmGraph()
        self.tick_count = 0
        self._rng = random.Random(seed)
        # Monotonic clock for heartbeat liveness; injectable so tests are
        # deterministic (no real sleeping). Defaults to wall-clock monotonic.
        self._clock = clock or time.monotonic
        self._events: deque[dict] = deque(maxlen=_EVENT_BUFFER)
        self.hacked_nodes: set[str] = set()
        # Externally-hosted nodes (e.g. laptop 2 as "ATK") and their liveness.
        self.host_nodes: set[str] = set()
        self.heartbeats: dict[str, float] = {}  # node_id -> last-seen clock time
        self.down_nodes: set[str] = set()  # host nodes whose heartbeats lapsed
        self._announced_detections: set[str] = set()
        self._announced_reroutes: set[str] = set()
        self._announced_isolated: set[str] = set()

        rows = _load_rows(csv_path or _SAMPLE_CSV)
        self.benign_rows = [r for r in rows if r["label"] == BENIGN]
        self.attack_rows: dict[str, list[dict]] = {
            atk: [r for r in rows if r["label"] == atk] for atk in ATTACK_TYPES
        }
        # Benign baseline (mean/std per feature) — the "normal" reference used to
        # explain WHY a link flagged: how abnormal each feature is vs benign.
        self._benign_mean, self._benign_std = self._benign_baseline()
        # Stealth pool: real attack rows that sit closest to benign in feature
        # space (hardest to detect). Built from the benign-standardized distance.
        self.stealth_pool = self._build_stealth_pool()
        self.detector, self.model_name = self._load_detector(rows)

        self._emit("info", f"Swarm online — {len(self.graph.nodes)} drones, "
                           f"{len(self.graph.links)} links · detector: {self.model_name}")

    # --- detector wiring ---------------------------------------------------
    def _load_detector(self, labeled_rows: list[dict]):
        if _MODEL_PATH.exists():
            try:
                from ml.detector import Detector  # provided by Task A

                return Detector(str(_MODEL_PATH)), "trained"
            except Exception:
                pass
        return FakeDetector(labeled_rows), "FakeDetector(k-NN)"

    # --- benign baseline / explanations ------------------------------------
    def _benign_baseline(self) -> tuple[dict, dict]:
        """Per-feature mean and std over benign rows (std floored to avoid /0)."""
        mean: dict[str, float] = {}
        std: dict[str, float] = {}
        n = max(len(self.benign_rows), 1)
        for c in FEATURE_COLUMNS:
            vals = [float(r[c]) for r in self.benign_rows] or [0.0]
            m = sum(vals) / n
            var = sum((v - m) ** 2 for v in vals) / n
            mean[c] = m
            std[c] = var ** 0.5 or 1.0
        return mean, std

    def _explain(self, features: dict) -> list[dict]:
        """Top-3 features driving the verdict: value + abnormality vs benign.

        Abnormality is a z-score against the benign baseline — a real, per-sample
        delta-from-normal that works regardless of which detector is plugged in.
        """
        scored = []
        for c in FEATURE_COLUMNS:
            z = (features[c] - self._benign_mean[c]) / self._benign_std[c]
            scored.append((c, features[c], self._benign_mean[c], z))
        scored.sort(key=lambda t: abs(t[3]), reverse=True)
        return [
            {
                "feature": c,
                "value": round(val, 4),
                "baseline": round(mean, 4),
                "z_score": round(z, 4),
                "direction": "high" if z >= 0 else "low",
            }
            for c, val, mean, z in scored[:3]
        ]

    def _build_stealth_pool(self) -> list[dict]:
        """Attack rows nearest to the benign cluster (low-and-slow, evasive).

        Distance is measured in benign-standardized feature space, so "nearest to
        benign" is principled rather than guessed. Keeps the closest ~half of all
        attack rows (min 3) — these are genuinely the attack flows most likely to
        slip past the detector."""
        scored = []
        for atk in ATTACK_TYPES:
            for row in self.attack_rows.get(atk, []):
                dist2 = sum(
                    ((float(row[c]) - self._benign_mean[c]) / self._benign_std[c]) ** 2
                    for c in FEATURE_COLUMNS
                )
                scored.append((dist2, row))
        scored.sort(key=lambda t: t[0])
        if not scored:
            return []
        keep = max(3, len(scored) // 2)
        return [row for _, row in scored[:keep]]

    # --- sampling ----------------------------------------------------------
    def _sample_features(self, link) -> dict:
        if link.attack_type == STEALTH and self.stealth_pool:
            pool = self.stealth_pool
        elif link.attack_type and self.attack_rows.get(link.attack_type):
            pool = self.attack_rows[link.attack_type]
        else:
            pool = self.benign_rows
        row = self._rng.choice(pool)
        return {c: float(row[c]) for c in FEATURE_COLUMNS}

    # --- events ------------------------------------------------------------
    def _emit(self, kind: str, message: str) -> None:
        self._events.append({"t": _now(), "kind": kind, "message": message})

    # --- commands ----------------------------------------------------------
    def command(self, action: str, target: Optional[str]) -> None:
        if action == "jam":
            link = self.graph.link(target) if target else None
            if link is not None:
                link.attack_type = ACTION_TO_ATTACK["jam"]  # DoS
                self._emit("info", f"Operator jammed link {link.id} (simulated RF)")
        elif action == "stealth":
            link = self.graph.link(target) if target else None
            if link is not None:
                link.attack_type = STEALTH  # low-and-slow, benign-like attack flow
                self._emit("info", f"Operator launched STEALTH attack on link {link.id}")
        elif action == "hack":
            if target and target in self.graph._nodes_by_id:
                self.hacked_nodes.add(target)
                # Quarantine response: the drone is treated as compromised and
                # removed from the mesh; its links are severed and traffic routes
                # around it (handled in tick). No attack sampling on a dead node.
                for link in self.graph.links_incident_to(target):
                    link.attack_type = None
                self._emit("detection", f"Drone {target} COMPROMISED — quarantining")
        elif action == "reset":
            for link in self.graph.links:
                link.attack_type = None
                link.status = "healthy"
                link.active = True
            for node in self.graph.nodes:
                node.status = "healthy"
            self.hacked_nodes.clear()
            self._announced_detections.clear()
            self._announced_reroutes.clear()
            self._announced_isolated.clear()
            self._emit("recovery", "All systems restored — swarm healthy")

    # --- host-node heartbeats (laptop 2 as a real, killable node) ----------
    def heartbeat(self, node_id: str) -> None:
        """Record a liveness beat from an externally-hosted node.

        First beat registers the node into the mesh; a beat from a node that had
        gone dark brings it back. The actual down/heal decision happens in
        tick() so it stays in step with the rest of the world.
        """
        if node_id not in self.host_nodes:
            self._register_host_node(node_id)
        self.heartbeats[node_id] = self._clock()
        if node_id in self.down_nodes:
            self.down_nodes.discard(node_id)
            self._emit("recovery", f"Host node {node_id} reconnected — rejoining mesh")

    def _register_host_node(self, node_id: str) -> None:
        spec = HOST_NODE_SPECS.get(node_id, _DEFAULT_HOST_SPEC)
        self.graph.add_node(node_id, spec["x"], spec["y"], spec["neighbours"])
        self.host_nodes.add(node_id)
        self._emit("info", f"Host node {node_id} joined the mesh (laptop online)")

    def _expire_stale_heartbeats(self) -> set[str]:
        """Mark any host node whose heartbeat lapsed as down; return all down."""
        now = self._clock()
        for node_id in self.host_nodes:
            last = self.heartbeats.get(node_id)
            if last is None or node_id in self.down_nodes:
                continue
            if now - last > HEARTBEAT_TIMEOUT_SECONDS:
                self.down_nodes.add(node_id)
                self._emit("detection", f"Host node {node_id} went dark — heartbeat lost")
        return self.down_nodes

    # --- the tick loop -----------------------------------------------------
    def tick(self) -> dict:
        self.tick_count += 1
        jammed_count = 0
        hacked = self.hacked_nodes
        # Host nodes whose heartbeats lapsed (laptop killed/offline) are treated
        # as removed from the mesh, exactly like a quarantined drone.
        down = self._expire_stale_heartbeats()
        removed = hacked | down
        # Links severed: any link touching a removed (hacked OR dark) node is cut.
        severed = {
            l.id
            for l in self.graph.links
            if l.source in removed or l.target in removed
        }

        # 1. Sample + score live links; quarantined links are severed (down).
        for link in self.graph.links:
            if link.id in severed:
                link.status = "down"
                link.active = False
                link.prediction = {"label": BENIGN, "attack_type": None, "confidence": 0.0}
                link.reasons = []
                link.features = {}
                self._announced_detections.discard(link.id)
                continue
            feats = self._sample_features(link)
            pred = self.detector.predict(feats)
            link.prediction = pred
            link.reasons = self._explain(feats)
            link.features = feats  # raw CIC values scored this tick (scope panel)
            if pred["label"] != BENIGN:
                link.status = "jammed"
                link.active = False
                jammed_count += 1
                if link.id not in self._announced_detections:
                    self._emit(
                        "detection",
                        f"ATTACK on {link.id}: {pred['label']} "
                        f"({pred['confidence'] * 100:.0f}% conf)",
                    )
                    self._announced_detections.add(link.id)
            else:
                link.status = "healthy"
                link.active = True
                self._announced_detections.discard(link.id)

        # 2. Self-heal. Dead = jammed + severed links; hacked drones are removed
        #    from routing entirely (quarantine), so traffic routes AROUND them.
        dead = {l.id for l in self.graph.links if l.status in ("jammed", "down")}
        rerouted_links: set[str] = set()
        defending_nodes: set[str] = set()
        live_reroute_keys: set[str] = set()

        # 2a. Reroute around each jammed link.
        for link in self.graph.links:
            if link.status != "jammed":
                continue
            live_reroute_keys.add(link.id)
            # Route AROUND every removed (hacked/dark) node and every dead link
            # so the detour never traverses a severed link.
            path = shortest_path(
                self.graph, link.source, link.target, avoid=dead, avoid_nodes=removed
            )
            if path and len(path) > 1:
                for a, b in zip(path, path[1:]):
                    lid = self.graph.link_id(a, b)
                    # Never schedule a severed (down) link to be repainted.
                    if lid not in dead:
                        rerouted_links.add(lid)
                defending_nodes.update(path)
                if link.id not in self._announced_reroutes:
                    self._emit("reroute", f"Rerouted around {link.id} via {'→'.join(path)}")
                    self._announced_reroutes.add(link.id)
            elif link.id not in self._announced_reroutes:
                self._emit("info", f"No path around {link.id} — endpoints partitioned")
                self._announced_reroutes.add(link.id)

        # 2b. Heal around each removed node — a quarantined (hacked) drone or a
        #     host node gone dark — by routing its former neighbours to one
        #     another around it. Same mechanism, different wording per cause.
        for h in removed:
            is_dark = h in down
            key = f"{'down' if is_dark else 'quarantine'}:{h}"
            live_reroute_keys.add(key)
            neighbours = [
                (l.target if l.source == h else l.source)
                for l in self.graph.links_incident_to(h)
            ]
            neighbours = [n for n in neighbours if n not in removed]
            healed = False
            for i in range(len(neighbours)):
                for j in range(i + 1, len(neighbours)):
                    path = shortest_path(
                        self.graph, neighbours[i], neighbours[j],
                        avoid=dead, avoid_nodes=removed,
                    )
                    if path and len(path) > 1:
                        for a, b in zip(path, path[1:]):
                            lid = self.graph.link_id(a, b)
                            # Never schedule a severed (down) link to be repainted.
                            if lid not in dead:
                                rerouted_links.add(lid)
                        defending_nodes.update(path)
                        healed = True
            if key not in self._announced_reroutes:
                if is_dark:
                    msg = (
                        f"{h} went dark — swarm rerouting around it"
                        if healed
                        else f"{h} went dark — no detour available"
                    )
                else:
                    msg = (
                        f"Quarantined {h} — swarm rerouting around it"
                        if healed
                        else f"Quarantined {h} — no detour available"
                    )
                self._emit("reroute" if healed else "info", msg)
                self._announced_reroutes.add(key)

        # Forget reroute announcements for threats that have cleared.
        self._announced_reroutes &= live_reroute_keys

        # 2c. Isolation: any still-present drone cut off from the main swarm.
        #     Removed nodes (hacked or dark) are intentionally gone, not isolated.
        comps = components(self.graph, avoid=dead, avoid_nodes=removed)
        main = comps[0] if comps else set()
        isolated = {
            n.id for n in self.graph.nodes
            if n.id not in removed and n.id not in main
        }
        for node_id in isolated:
            if node_id not in self._announced_isolated:
                self._emit("detection", f"Drone {node_id} ISOLATED — cut off from swarm")
                self._announced_isolated.add(node_id)
        for node_id in list(self._announced_isolated):
            if node_id not in isolated:
                self._emit("recovery", f"Drone {node_id} reconnected to swarm")
                self._announced_isolated.discard(node_id)

        # Paint detour links. ONLY currently-healthy links may become rerouted —
        # a severed link (status "down", incident to a hacked/dark node) is NEVER
        # repainted to "rerouted". This guard is the contract that keeps a hacked
        # node's incident links rendering as down (severed), not rerouted.
        for link in self.graph.links:
            if link.status == "healthy" and link.id in rerouted_links:
                link.status = "rerouted"
                link.active = True

        # 3. Node statuses: hacked(attacked) > dark(down) > isolated > defending.
        for node in self.graph.nodes:
            if node.id in hacked:
                node.status = "attacked"
            elif node.id in down:
                node.status = "down"
            elif node.id in isolated:
                node.status = "isolated"
            elif node.id in defending_nodes:
                node.status = "defending"
            else:
                node.status = "healthy"

        active_attacks = jammed_count + len(hacked) + len(isolated)
        return self._serialize(self._threat_level(active_attacks))

    # --- helpers -----------------------------------------------------------
    @staticmethod
    def _threat_level(active_attacks: int) -> str:
        if active_attacks == 0:
            return "NOMINAL"
        if active_attacks <= 2:
            return "ELEVATED"
        return "CRITICAL"

    def _serialize(self, threat_level: str) -> dict:
        return {
            "type": "state",
            "tick": self.tick_count,
            "threat_level": threat_level,
            "nodes": [
                {"id": n.id, "x": n.x, "y": n.y, "status": n.status}
                for n in self.graph.nodes
            ],
            "links": [
                {
                    "id": l.id,
                    "source": l.source,
                    "target": l.target,
                    "status": l.status,
                    "active": l.active,
                    "prediction": l.prediction,
                    "reasons": l.reasons,
                    "features": l.features,
                }
                for l in self.graph.links
            ],
            "events": list(reversed(self._events)),  # newest-first
        }
