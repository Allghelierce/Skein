"""SwarmGraph — the drone-swarm mesh topology.

A dense tactical swarm: 13 drones (D1..D13) in a two-ring + core formation,
wired by k-nearest-neighbour so EVERY drone has >=4 neighbours. That density is
the whole point — a real resilient swarm survives losing several nodes. With this
mesh the operator can jam links and quarantine multiple drones and the network
keeps finding alternate paths (genuine networkx reroute), instead of partitioning
the moment two nodes drop. The redundancy is what makes the self-healing real.

Node/link `status` fields are mutable; the simulator drives them each tick.
Statuses match the shared WS contract (frontend/lib/types.ts):
  NodeStatus = "healthy" | "attacked" | "defending" | "isolated"
  LinkStatus = "healthy" | "jammed" | "rerouted" | "down"
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional


# Fixed command-center layout in 0..1 coords (x right, y down).
# A core node, an inner ring of 4, and an outer ring of 8 — a believable
# tactical formation that fills the map and packs in redundant cross-links.
_NODE_LAYOUT: dict[str, tuple[float, float]] = {
    "D1": (0.50, 0.50),   # core
    # inner ring
    "D2": (0.50, 0.28),
    "D3": (0.72, 0.50),
    "D4": (0.50, 0.72),
    "D5": (0.28, 0.50),
    # outer ring
    "D6": (0.50, 0.10),
    "D7": (0.78, 0.22),
    "D8": (0.90, 0.50),
    "D9": (0.78, 0.78),
    "D10": (0.50, 0.90),
    "D11": (0.22, 0.78),
    "D12": (0.10, 0.50),
    "D13": (0.22, 0.22),
}

# Minimum neighbours per drone. k-nearest wiring below guarantees this, giving a
# mesh dense enough to survive multiple node losses and still self-heal.
_MIN_DEGREE = 4


def _build_dense_edges(
    layout: dict[str, tuple[float, float]], min_degree: int = _MIN_DEGREE
) -> list[tuple[str, str]]:
    """Connect each drone to its `min_degree` nearest neighbours (undirected).

    Symmetric k-NN: an edge exists if either endpoint counts the other among its
    k nearest. This reliably yields a single connected component where every node
    has at least `min_degree` links — the redundancy the self-healing demo needs.
    """
    ids = list(layout)
    edges: set[tuple[str, str]] = set()
    for a in ids:
        ax, ay = layout[a]
        others = sorted(
            (b for b in ids if b != a),
            key=lambda b: (layout[b][0] - ax) ** 2 + (layout[b][1] - ay) ** 2,
        )
        for b in others[:min_degree]:
            edges.add(tuple(sorted((a, b))))
    return sorted(edges)


_EDGES: list[tuple[str, str]] = _build_dense_edges(_NODE_LAYOUT)


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

    # --- dynamic membership (host nodes hosted by another laptop) -----------
    def add_node(
        self, node_id: str, x: float, y: float, neighbours: list[str]
    ) -> Node:
        """Add a node and link it to existing neighbours (idempotent).

        Used when laptop 2 checks in over the WS and joins the mesh as a real,
        killable node. Unknown neighbours are skipped; duplicate links are not
        re-created, so repeated heartbeats are safe.
        """
        existing = self._nodes_by_id.get(node_id)
        if existing is not None:
            return existing

        node = Node(id=node_id, x=x, y=y)
        self.nodes.append(node)
        self._nodes_by_id[node_id] = node
        for nb in neighbours:
            if nb == node_id or nb not in self._nodes_by_id:
                continue
            lid = canonical_link_id(node_id, nb)
            if lid in self._links_by_id:
                continue
            lo, hi = sorted((node_id, nb))
            link = Link(id=lid, source=lo, target=hi)
            self.links.append(link)
            self._links_by_id[lid] = link
        return node

    def some_adjacent_pair(self) -> tuple[str, str]:
        """Return two directly-linked node ids (used by tests/helpers)."""
        first = self.links[0]
        return first.source, first.target

    def node_ids(self) -> list[str]:
        return [n.id for n in self.nodes]
