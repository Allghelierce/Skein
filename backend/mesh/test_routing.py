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
    # 7 drones, each with 2-3 neighbours, fully connected mesh.
    assert len(g.nodes) == 7
    for node in g.nodes:
        degree = sum(1 for l in g.links if node.id in (l.source, l.target))
        assert 2 <= degree <= 3
    # Every node reachable from D1.
    reachable = shortest_path(g, "D1", "D7", avoid=set())
    assert reachable is not None


def test_partition_returns_none():
    g = SwarmGraph()
    a, b = g.some_adjacent_pair()
    # Avoid every link -> graph has no edges -> no path.
    all_links = {l.id for l in g.links}
    assert shortest_path(g, a, b, avoid=all_links) is None


def test_routes_around_a_removed_node():
    g = SwarmGraph()
    # D1's neighbours are D2 and D7. Removing D2 should force D1->D3 to detour
    # around D2 entirely (D2 never appears in the path).
    path = shortest_path(g, "D1", "D3", avoid_nodes={"D2"})
    assert path is not None
    assert "D2" not in path
    assert path[0] == "D1" and path[-1] == "D3"


def test_isolated_node_falls_out_of_main_component():
    g = SwarmGraph()
    # D1's only neighbours are D2 and D7. Quarantine both -> D1 is cut off.
    comps = components(g, avoid_nodes={"D2", "D7"})
    main = comps[0]
    assert "D1" not in main
    assert any(c == {"D1"} for c in comps)
