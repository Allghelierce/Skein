from ml.schema import FEATURE_COLUMNS
from mesh.simulator import Simulator


def _state_keys_ok(state):
    assert state["type"] == "state"
    assert isinstance(state["tick"], int)
    assert state["threat_level"] in ("NOMINAL", "ELEVATED", "CRITICAL")
    assert isinstance(state["nodes"], list)
    assert isinstance(state["links"], list)
    assert isinstance(state["events"], list)


def test_tick_returns_state_message_shape():
    sim = Simulator()
    state = sim.tick()
    _state_keys_ok(state)
    # nodes
    for n in state["nodes"]:
        assert set(n) == {"id", "x", "y", "status"}
        assert n["status"] in ("healthy", "attacked", "defending")
    # links
    for l in state["links"]:
        assert set(l) == {"id", "source", "target", "status", "active", "prediction", "features"}
        assert l["status"] in ("healthy", "jammed", "rerouted", "down")
        pred = l["prediction"]
        assert set(pred) == {"label", "attack_type", "confidence"}
        assert 0.0 <= pred["confidence"] <= 1.0


def test_idle_swarm_is_nominal_and_benign():
    sim = Simulator()
    state = sim.tick()
    assert state["threat_level"] == "NOMINAL"
    assert all(l["status"] == "healthy" for l in state["links"])
    assert all(l["prediction"]["label"] == "BENIGN" for l in state["links"])


def test_jam_link_becomes_jammed_and_emits_detection():
    sim = Simulator()
    target = sim.graph.links[0].id
    sim.command("jam", target)
    state = sim.tick()
    jammed = next(l for l in state["links"] if l["id"] == target)
    assert jammed["status"] == "jammed"
    assert jammed["prediction"]["label"] != "BENIGN"
    assert any(e["kind"] == "detection" for e in state["events"])
    assert state["threat_level"] != "NOMINAL"


def test_jam_triggers_real_reroute():
    sim = Simulator()
    target = sim.graph.links[0].id  # D1-D2, which has an alternate path
    sim.command("jam", target)
    state = sim.tick()
    assert any(l["status"] == "rerouted" for l in state["links"])
    assert any(e["kind"] == "reroute" for e in state["events"])


def test_reset_restores_health_and_emits_recovery():
    sim = Simulator()
    sim.command("jam", sim.graph.links[0].id)
    sim.tick()
    sim.command("reset", None)
    state = sim.tick()
    assert state["threat_level"] == "NOMINAL"
    assert all(l["status"] == "healthy" for l in state["links"])
    assert any(e["kind"] == "recovery" for e in state["events"])


def test_hack_node_marks_node_and_incident_links():
    sim = Simulator()
    node_id = "D2"
    sim.command("hack", node_id)
    state = sim.tick()
    node = next(n for n in state["nodes"] if n["id"] == node_id)
    assert node["status"] == "attacked"
    incident = [l for l in state["links"] if node_id in (l["source"], l["target"])]
    assert any(l["status"] == "jammed" for l in incident)


def test_predict_consumes_full_feature_schema():
    # The detector must be fed every contracted feature column.
    sim = Simulator()
    feats = sim._sample_features(sim.graph.links[0])
    assert set(feats) == set(FEATURE_COLUMNS)
