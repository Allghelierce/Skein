"""Routing — real shortest-path computation over the live mesh.

Self-healing is genuine here: a fresh networkx graph is built from the current
links each call, excluding any link ids in `avoid` (jammed/down links). If the
endpoints are partitioned, we return None rather than inventing a path.
"""

from __future__ import annotations

from typing import Iterable, Optional

import networkx as nx


def build_nx_graph(graph, avoid: Iterable[str] = ()):
    """Construct a networkx graph of the mesh, excluding `avoid` link ids."""
    avoid_set = set(avoid)
    G = nx.Graph()
    G.add_nodes_from(graph.node_ids())
    for link in graph.links:
        if link.id in avoid_set:
            continue
        G.add_edge(link.source, link.target)
    return G


def shortest_path(graph, src: str, dst: str, avoid: Iterable[str] = ()) -> Optional[list[str]]:
    """Shortest node path from src to dst avoiding the given dead link ids.

    Returns a list of node ids [src, ..., dst], or None if no path exists.
    """
    G = build_nx_graph(graph, avoid)
    try:
        return nx.shortest_path(G, src, dst)
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        return None
