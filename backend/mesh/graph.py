"""SwarmGraph — the drone-swarm mesh topology.

Seven drones (D1..D7) with fixed 0..1 layout coordinates and a connected mesh
where each node has 2-3 neighbours. The topology is deliberately redundant (a
ring plus two chords) so that killing any single link still leaves an alternate
path — that redundancy is what makes the self-healing reroute real, not faked.

Node/link `status` fields are mutable; the simulator drives them each tick.
Statuses match the shared WS contract (frontend/lib/types.ts):
  NodeStatus = "healthy" | "attacked" | "defending"
  LinkStatus = "healthy" | "jammed" | "rerouted" | "down"
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


# Fixed command-center layout in 0..1 coords (x right, y down).
_NODE_LAYOUT: dict[str, tuple[float, float]] = {
    "D1": (0.15, 0.20),
    "D2": (0.40, 0.12),
    "D3": (0.70, 0.18),
    "D4": (0.85, 0.45),
    "D5": (0.62, 0.62),
    "D6": (0.32, 0.70),
    "D7": (0.12, 0.50),
}

# Ring (D1-D2-...-D7-D1) plus two chords (D2-D6, D3-D5) for redundancy.
# Result: each node has 2-3 neighbours and every single-link cut is survivable.
_EDGES: list[tuple[str, str]] = [
    ("D1", "D2"),
    ("D2", "D3"),
    ("D3", "D4"),
    ("D4", "D5"),
    ("D5", "D6"),
    ("D6", "D7"),
    ("D7", "D1"),
    ("D2", "D6"),
    ("D3", "D5"),
]


@dataclass
class Node:
    id: str
    x: float
    y: float
    status: str = "healthy"  # NodeStatus


@dataclass
class Link:
    id: str  # canonical "D1-D2" (endpoints sorted)
    source: str
    target: str
    status: str = "healthy"  # LinkStatus
    active: bool = True  # currently carrying traffic
    # Internal attack bookkeeping (drives which CIC pool gets sampled). None =>
    # benign. One of ATTACK_TYPES otherwise. Not serialized directly.
    attack_type: Optional[str] = None
    # Latest detector output for this link: {"label","attack_type","confidence"}.
    prediction: dict = field(
        default_factory=lambda: {"label": "BENIGN", "attack_type": None, "confidence": 1.0}
    )
    # Top features that drove this tick's prediction (why-it-flagged). Each item:
    # {"feature","value","baseline","z_score","direction"}.
    reasons: list = field(default_factory=list)
    # Raw CIC feature values the detector scored this tick (keys = FEATURE_COLUMNS).
    features: dict = field(default_factory=dict)

    def endpoints(self) -> tuple[str, str]:
        return self.source, self.target


def canonical_link_id(a: str, b: str) -> str:
    """Order-independent link id, e.g. ('D2','D1') -> 'D1-D2'."""
    lo, hi = sorted((a, b))
    return f"{lo}-{hi}"


class SwarmGraph:
    def __init__(self) -> None:
        self.nodes: list[Node] = [
            Node(id=nid, x=xy[0], y=xy[1]) for nid, xy in _NODE_LAYOUT.items()
        ]
        self._nodes_by_id: dict[str, Node] = {n.id: n for n in self.nodes}

        self.links: list[Link] = []
        self._links_by_id: dict[str, Link] = {}
        for a, b in _EDGES:
            lo, hi = sorted((a, b))
            link = Link(id=canonical_link_id(a, b), source=lo, target=hi)
            self.links.append(link)
            self._links_by_id[link.id] = link

    # --- lookups -----------------------------------------------------------
    def node(self, node_id: str) -> Node:
        return self._nodes_by_id[node_id]

    def link(self, link_id: str) -> Optional[Link]:
        return self._links_by_id.get(link_id)

    def link_id(self, a: str, b: str) -> str:
        return canonical_link_id(a, b)

    def links_incident_to(self, node_id: str) -> list[Link]:
        return [l for l in self.links if node_id in (l.source, l.target)]

    def some_adjacent_pair(self) -> tuple[str, str]:
        """Return two directly-linked node ids (used by tests/helpers)."""
        first = self.links[0]
        return first.source, first.target

    def node_ids(self) -> list[str]:
        return [n.id for n in self.nodes]
