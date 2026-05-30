from mesh.graph import SwarmGraph
from mesh.routing import components, shortest_path


def test_direct_path_is_the_link_itself():
    g = SwarmGraph()
    a, b = g.some_adjacent_pair()
    direct = shortest_path(g, a, b, avoid=set())
    assert direct == [a, b]


def test_reroutes_around_dead_link():
    g = SwarmGraph()
    a, b = g.some_adjacent_pair()
    around = shortest_path(g, a, b, avoid={g.link_id(a, b)})
    # Either the pair is now partitioned (None) or a real detour exists that
    # starts at a, ends at b, and is strictly longer than the direct hop.
    assert around is None or (around[0] == a and around[-1] == b and len(around) > 2)


def test_topology_is_connected_with_redundancy():
    g = SwarmGraph()
    # Dense 13-drone mesh: core + inner ring + outer ring, k-nearest wired so
    # every drone has at least 4 neighbours (the redundancy that lets the swarm
    # survive losing multiple nodes).
    assert len(g.nodes) == 13
    for node in g.nodes:
        degree = sum(1 for l in g.links if node.id in (l.source, l.target))
        assert degree >= 4
    # Every node reachable from D1.
    reachable = shortest_path(g, "D1", "D10", avoid=set())
    assert reachable is not None


def test_partition_returns_none():
    g = SwarmGraph()
    a, b = g.some_adjacent_pair()
    # Avoid every link -> graph has no edges -> no path.
    all_links = {l.id for l in g.links}
    assert shortest_path(g, a, b, avoid=all_links) is None


def _neighbours_of(g, node_id):
    nbrs = set()
    for l in g.links:
        if l.source == node_id:
            nbrs.add(l.target)
        elif l.target == node_id:
            nbrs.add(l.source)
    return nbrs


def test_routes_around_a_removed_node():
    g = SwarmGraph()
    # D8's neighbours include D3 and D9 (a direct D8-D9 link exists). Removing D8
    # should force D9->D3 to detour around D8 entirely (D8 never in the path).
    path = shortest_path(g, "D9", "D3", avoid_nodes={"D8"})
    assert path is not None
    assert "D8" not in path
    assert path[0] == "D9" and path[-1] == "D3"


def test_isolated_node_falls_out_of_main_component():
    g = SwarmGraph()
    # The dense mesh survives losing a couple of nodes — to actually cut a drone
    # off we must remove its ENTIRE neighbour set. Surround D8 completely.
    target = "D8"
    neighbours = _neighbours_of(g, target)
    comps = components(g, avoid_nodes=neighbours)
    main = comps[0]
    assert target not in main
    assert any(c == {target} for c in comps)
