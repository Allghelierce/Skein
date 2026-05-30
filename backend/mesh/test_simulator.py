from ml.schema import FEATURE_COLUMNS
from mesh.simulator import STEALTH, Simulator


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
        assert n["status"] in ("healthy", "attacked", "defending", "isolated", "down")
    # links
    for l in state["links"]:
        assert set(l) == {
            "id", "source", "target", "status", "active", "prediction", "reasons", "features"
        }
        assert l["status"] in ("healthy", "jammed", "rerouted", "down")
        pred = l["prediction"]
        assert set(pred) == {"label", "attack_type", "confidence"}
        assert 0.0 <= pred["confidence"] <= 1.0
        assert isinstance(l["reasons"], list)


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


def test_hack_quarantines_node_and_reroutes_around_it():
    sim = Simulator()
    node_id = "D2"  # degree-3 drone; removing it leaves the swarm connected
    sim.command("hack", node_id)
    state = sim.tick()

    node = next(n for n in state["nodes"] if n["id"] == node_id)
    assert node["status"] == "attacked"
    # Incident links are severed (quarantine), not flagged as jammed.
    incident = [l for l in state["links"] if node_id in (l["source"], l["target"])]
    assert incident and all(l["status"] == "down" for l in incident)
    # The swarm heals AROUND the node: real rerouted (blue) links appear.
    assert any(l["status"] == "rerouted" for l in state["links"])
    assert any(e["kind"] == "reroute" for e in state["events"])
    # Removing one degree-3 node does not isolate anyone here.
    assert all(n["status"] != "isolated" for n in state["nodes"])


def test_hacking_both_neighbours_isolates_a_drone():
    sim = Simulator()
    # D1's only neighbours are D2 and D7. Quarantine both -> D1 is cut off.
    sim.command("hack", "D2")
    sim.command("hack", "D7")
    state = sim.tick()
    d1 = next(n for n in state["nodes"] if n["id"] == "D1")
    assert d1["status"] == "isolated"
    assert any(e["kind"] == "detection" and "ISOLATED" in e["message"] for e in state["events"])
    assert state["threat_level"] == "CRITICAL"  # 2 hacked drones


def test_reset_clears_quarantine_and_isolation():
    sim = Simulator()
    sim.command("hack", "D2")
    sim.command("hack", "D7")
    sim.tick()
    sim.command("reset", None)
    state = sim.tick()
    assert all(n["status"] == "healthy" for n in state["nodes"])
    assert all(l["status"] == "healthy" for l in state["links"])
    assert state["threat_level"] == "NOMINAL"


def test_reasons_explain_the_jam():
    sim = Simulator(seed=1)
    target = sim.graph.links[0].id
    sim.command("jam", target)
    # Sample a few ticks of the sustained attack and check the structure each
    # tick; abnormality is checked on the strongest tick (a single flow can be
    # quiet, but a sustained DoS reads clearly abnormal vs the benign baseline).
    peak = 0.0
    for _ in range(5):
        state = sim.tick()
        jammed = next(l for l in state["links"] if l["id"] == target)
        reasons = jammed["reasons"]
        assert 1 <= len(reasons) <= 3
        for r in reasons:
            assert set(r) == {"feature", "value", "baseline", "z_score", "direction"}
            assert r["feature"] in FEATURE_COLUMNS
            assert r["direction"] in ("high", "low")
        peak = max(peak, max(abs(r["z_score"]) for r in reasons))
    # A DoS flood should look strongly abnormal vs the benign baseline.
    assert peak > 1.0
    # Reasons are sorted by descending abnormality.
    zs = [abs(r["z_score"]) for r in reasons]
    assert zs == sorted(zs, reverse=True)


def test_stealth_command_sets_stealth_attack():
    sim = Simulator()
    target = sim.graph.links[0].id
    sim.command("stealth", target)
    assert sim.graph.link(target).attack_type == STEALTH
    state = sim.tick()
    assert any(e["kind"] == "info" and "STEALTH" in e["message"] for e in state["events"])


def test_stealth_pool_is_attack_rows_closest_to_benign():
    sim = Simulator()
    assert len(sim.stealth_pool) >= 3
    # Every stealth row is a real attack row (never benign).
    benign_set = {tuple(r[c] for c in FEATURE_COLUMNS) for r in sim.benign_rows}
    for row in sim.stealth_pool:
        assert tuple(row[c] for c in FEATURE_COLUMNS) not in benign_set
        assert row["label"] != "BENIGN"


def test_stealth_is_harder_to_detect_than_a_jam():
    # Stealth flows should look far more benign (lower abnormality) than a loud
    # DoS jam — that is the whole point of a low-and-slow attack.
    sim = Simulator(seed=0)
    link = sim.graph.links[0]

    def mean_abnormality(attack_type, n=200):
        link.attack_type = attack_type
        total = 0.0
        for _ in range(n):
            feats = sim._sample_features(link)
            total += max(abs(r["z_score"]) for r in sim._explain(feats))
        return total / n

    dos = mean_abnormality("DoS")
    stealth = mean_abnormality(STEALTH)
    assert stealth < dos / 2  # markedly closer to benign


def test_predict_consumes_full_feature_schema():
    # The detector must be fed every contracted feature column.
    sim = Simulator()
    feats = sim._sample_features(sim.graph.links[0])
    assert set(feats) == set(FEATURE_COLUMNS)
