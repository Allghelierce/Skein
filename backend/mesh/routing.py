"""Routing — real shortest-path computation over the live mesh.

Self-healing is genuine here: a fresh networkx graph is built from the current
links each call, excluding any link ids in `avoid` (jammed/down links) and any
node ids in `avoid_nodes` (quarantined/hacked drones treated as removed). If the
endpoints are partitioned, we return None rather than inventing a path.
"""

from __future__ import annotations

from typing import Iterable, Optional

import networkx as nx


def build_nx_graph(graph, avoid: Iterable[str] = (), avoid_nodes: Iterable[str] = ()):
    """Construct a networkx graph of the mesh.

    Excludes any link ids in `avoid` and removes any node ids in `avoid_nodes`
    (along with their incident links) — quarantined drones are treated as gone.
    """
    avoid_set = set(avoid)
    avoid_node_set = set(avoid_nodes)
    G = nx.Graph()
    G.add_nodes_from(n for n in graph.node_ids() if n not in avoid_node_set)
    for link in graph.links:
        if link.id in avoid_set:
            continue
        if link.source in avoid_node_set or link.target in avoid_node_set:
            continue
        G.add_edge(link.source, link.target)
    return G


def shortest_path(
    graph,
    src: str,
    dst: str,
    avoid: Iterable[str] = (),
    avoid_nodes: Iterable[str] = (),
) -> Optional[list[str]]:
    """Shortest node path from src to dst avoiding dead links and removed nodes.

    Returns a list of node ids [src, ..., dst], or None if no path exists.
    """
    G = build_nx_graph(graph, avoid, avoid_nodes)
    try:
        return nx.shortest_path(G, src, dst)
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        return None


def components(
    graph, avoid: Iterable[str] = (), avoid_nodes: Iterable[str] = ()
) -> list[set[str]]:
    """Connected components of the live mesh (dead links / removed nodes excluded).

    Used to find drones cut off from the swarm: any node not in the largest
    component is isolated. Returned largest-first.
    """
    G = build_nx_graph(graph, avoid, avoid_nodes)
    return sorted((set(c) for c in nx.connected_components(G)), key=len, reverse=True)
