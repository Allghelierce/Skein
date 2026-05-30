"""Heartbeat / killable-node tests.

Laptop 2 (the attacker console) registers itself as a real mesh node "ATK" via
periodic heartbeats. When those heartbeats stop — process killed, wifi pulled,
lid closed — the backend marks the node down and the swarm reroutes around it,
reusing the existing quarantine/heal path. These tests drive the clock by hand
so the timeout is deterministic (no sleeping in tests).
"""

from mesh.simulator import HEARTBEAT_TIMEOUT_SECONDS, Simulator


class FakeClock:
    """A hand-cranked monotonic clock so heartbeat timeouts are deterministic."""

    def __init__(self, t: float = 0.0) -> None:
        self.t = t

    def __call__(self) -> float:
        return self.t


def _atk(state):
    return next(n for n in state["nodes"] if n["id"] == "ATK")


def _atk_links(state):
    return [l for l in state["links"] if "ATK" in (l["source"], l["target"])]


def test_heartbeat_registers_host_node():
    clock = FakeClock()
    sim = Simulator(seed=0, clock=clock)
    assert "ATK" not in sim.graph.node_ids()  # absent until laptop 2 checks in

    sim.heartbeat("ATK")
    assert "ATK" in sim.graph.node_ids()

    state = sim.tick()
    assert _atk(state)["status"] == "healthy"
    # ATK joins linked to two real drones so killing it is survivable.
    links = _atk_links(state)
    assert {l["id"] for l in links} == {"ATK-D4", "ATK-D5"}
    assert all(l["status"] in ("healthy", "rerouted") for l in links)
    assert any(e["kind"] == "info" and "ATK" in e["message"] for e in state["events"])


def test_heartbeat_keeps_node_live_across_ticks():
    clock = FakeClock()
    sim = Simulator(seed=0, clock=clock)
    sim.heartbeat("ATK")
    for _ in range(5):
        clock.t += 1.0
        sim.heartbeat("ATK")  # laptop 2 still alive
        state = sim.tick()
        assert _atk(state)["status"] in ("healthy", "defending")
        assert "ATK" not in sim.down_nodes


def test_heartbeat_timeout_marks_node_down_and_reroutes():
    clock = FakeClock()
    sim = Simulator(seed=0, clock=clock)
    sim.heartbeat("ATK")
    sim.tick()  # registered + live

    clock.t += HEARTBEAT_TIMEOUT_SECONDS + 1.0  # laptop 2 killed; heartbeats stop
    state = sim.tick()

    assert _atk(state)["status"] == "down"
    assert "ATK" in sim.down_nodes
    # Its links are severed (down), not flagged as an attack.
    links = _atk_links(state)
    assert links and all(l["status"] == "down" for l in links)
    # The swarm heals AROUND it — real rerouted links appear.
    assert any(l["status"] == "rerouted" for l in state["links"])
    assert any(e["kind"] == "reroute" for e in state["events"])


def test_killing_host_node_is_not_an_attack():
    clock = FakeClock()
    sim = Simulator(seed=0, clock=clock)
    sim.heartbeat("ATK")
    sim.tick()
    clock.t += HEARTBEAT_TIMEOUT_SECONDS + 1.0
    state = sim.tick()

    # Losing the attacker's own host node must not isolate any real drone...
    assert all(
        n["status"] != "isolated" for n in state["nodes"] if n["id"].startswith("D")
    )
    # ...and a friendly node going dark is not an attack: threat stays nominal.
    assert state["threat_level"] == "NOMINAL"


def test_heartbeat_resume_brings_node_back():
    clock = FakeClock()
    sim = Simulator(seed=0, clock=clock)
    sim.heartbeat("ATK")
    sim.tick()
    clock.t += HEARTBEAT_TIMEOUT_SECONDS + 1.0
    down = sim.tick()
    assert _atk(down)["status"] == "down"

    sim.heartbeat("ATK")  # attacker reconnects
    back = sim.tick()
    assert _atk(back)["status"] in ("healthy", "defending")
    assert "ATK" not in sim.down_nodes
    assert any(e["kind"] == "recovery" for e in back["events"])


def test_idle_swarm_unaffected_without_heartbeats():
    # No heartbeats -> no ATK node -> the seven-drone swarm behaves exactly as before.
    sim = Simulator(seed=0)
    state = sim.tick()
    assert "ATK" not in {n["id"] for n in state["nodes"]}
    assert state["threat_level"] == "NOMINAL"
    assert all(l["status"] == "healthy" for l in state["links"])
