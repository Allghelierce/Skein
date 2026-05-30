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
from collections import deque
from datetime import datetime
from pathlib import Path
from typing import Optional

from ml.schema import (
    ACTION_TO_ATTACK,
    ALL_LABELS,
    ATTACK_TYPES,
    BENIGN,
    FEATURE_COLUMNS,
)
from mesh.graph import SwarmGraph
from mesh.routing import shortest_path

_BACKEND_DIR = Path(__file__).resolve().parent.parent
_SAMPLE_CSV = _BACKEND_DIR / "data" / "sample" / "cic_sample.csv"
_MODEL_PATH = _BACKEND_DIR / "models" / "detector.joblib"

_EVENT_BUFFER = 20


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
    def __init__(self, csv_path: Optional[Path] = None, seed: Optional[int] = None) -> None:
        self.graph = SwarmGraph()
        self.tick_count = 0
        self._rng = random.Random(seed)
        self._events: deque[dict] = deque(maxlen=_EVENT_BUFFER)
        self.hacked_nodes: set[str] = set()
        self._announced_detections: set[str] = set()
        self._announced_reroutes: set[str] = set()

        rows = _load_rows(csv_path or _SAMPLE_CSV)
        self.benign_rows = [r for r in rows if r["label"] == BENIGN]
        self.attack_rows: dict[str, list[dict]] = {
            atk: [r for r in rows if r["label"] == atk] for atk in ATTACK_TYPES
        }
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
        return FakeDetector(labeled_rows), "FakeDetector(nearest-centroid)"

    # --- sampling ----------------------------------------------------------
    def _sample_features(self, link) -> dict:
        if link.attack_type and self.attack_rows.get(link.attack_type):
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
        elif action == "hack":
            if target and target in self.graph._nodes_by_id:
                self.hacked_nodes.add(target)
                for link in self.graph.links_incident_to(target):
                    link.attack_type = ACTION_TO_ATTACK["hack"]  # PortScan
                self._emit("info", f"Operator hacked drone {target}")
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
            self._emit("recovery", "All systems restored — swarm healthy")

    # --- the tick loop -----------------------------------------------------
    def tick(self) -> dict:
        self.tick_count += 1
        jammed_count = 0

        # 1. Sample + score every link; link visibility follows the prediction.
        for link in self.graph.links:
            feats = self._sample_features(link)
            pred = self.detector.predict(feats)
            link.prediction = pred
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

        # 2. Self-heal: real reroute around jammed/down links.
        dead = {l.id for l in self.graph.links if l.status in ("jammed", "down")}
        rerouted_links: set[str] = set()
        defending_nodes: set[str] = set()
        still_jammed: set[str] = set()

        for link in self.graph.links:
            if link.status != "jammed":
                continue
            still_jammed.add(link.id)
            path = shortest_path(self.graph, link.source, link.target, avoid=dead)
            if path and len(path) > 1:
                for a, b in zip(path, path[1:]):
                    rerouted_links.add(self.graph.link_id(a, b))
                defending_nodes.update(path)
                if link.id not in self._announced_reroutes:
                    self._emit("reroute", f"Rerouted around {link.id} via {'→'.join(path)}")
                    self._announced_reroutes.add(link.id)
            else:
                if link.id not in self._announced_reroutes:
                    self._emit("info", f"No path around {link.id} — endpoints partitioned")
                    self._announced_reroutes.add(link.id)

        # Forget reroute announcements for links that have recovered.
        self._announced_reroutes &= still_jammed

        # Paint detour links (only healthy links carrying rerouted traffic).
        for link in self.graph.links:
            if link.status == "healthy" and link.id in rerouted_links:
                link.status = "rerouted"
                link.active = True

        # 3. Node statuses: hacked > defending > healthy.
        for node in self.graph.nodes:
            if node.id in self.hacked_nodes:
                node.status = "attacked"
            elif node.id in defending_nodes:
                node.status = "defending"
            else:
                node.status = "healthy"

        return self._serialize(self._threat_level(jammed_count))

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
                }
                for l in self.graph.links
            ],
            "events": list(reversed(self._events)),  # newest-first
        }
