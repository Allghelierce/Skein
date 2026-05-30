from ml.schema import FEATURE_COLUMNS
from mesh.simulator import COMPROMISE_DWELL_TICKS, STEALTH, Simulator


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


def test_hack_is_flagged_by_detector_before_quarantine():
    sim = Simulator()
    # Phase 1 — intrusion. A hacked node is NOT removed instantly: it stays in
    # the mesh emitting real CIC PortScan flows that the ML detector flags. This
    # is the IDS catching the compromise before the swarm contains it.
    node_id = "D2"
    sim.command("hack", node_id)
    state = sim.tick()

    node = next(n for n in state["nodes"] if n["id"] == node_id)
    assert node["status"] == "attacked"

    incident = [l for l in state["links"] if node_id in (l["source"], l["target"])]
    assert len(incident) >= 4
    # Its links are flagged as a live attack (PortScan), NOT yet severed.
    assert all(l["status"] == "jammed" for l in incident)
    assert all(l["prediction"]["label"] == "PortScan" for l in incident)
    # The detector — not an oracle — is what surfaces the compromise.
    assert state["threat_level"] != "NOMINAL"
    assert any(
        e["kind"] == "detection" and "PortScan" in e["message"] for e in state["events"]
    )


def test_hack_quarantines_node_and_reroutes_around_it():
    sim = Simulator()
    # Dense 13-node mesh: after the intrusion is detected (phase 1), the swarm
    # auto-quarantines the node (phase 2) — severing all of ITS incident links
    # (status "down") and rerouting traffic elsewhere; nobody gets isolated.
    node_id = "D2"  # high-degree inner node; the swarm easily survives its loss
    sim.command("hack", node_id)
    # Advance through the detection dwell into containment.
    for _ in range(COMPROMISE_DWELL_TICKS + 1):
        state = sim.tick()

    node = next(n for n in state["nodes"] if n["id"] == node_id)
    assert node["status"] == "attacked"

    # (a) Every link incident to the hacked node is severed (down) — and a
    #     severed link must NEVER be repainted as rerouted.
    incident = [l for l in state["links"] if node_id in (l["source"], l["target"])]
    assert len(incident) >= 4  # dense node: >= 4 neighbours
    assert all(l["status"] == "down" for l in incident)
    assert not any(l["status"] == "rerouted" for l in incident)

    # (b) Some OTHER link in the swarm is rerouted (real detour around the loss).
    rerouted = [l for l in state["links"] if l["status"] == "rerouted"]
    assert rerouted, "expected reroutes elsewhere in the swarm"
    assert all(node_id not in (l["source"], l["target"]) for l in rerouted)
    assert any(e["kind"] == "reroute" for e in state["events"])

    # (c) No node is isolated — the dense mesh survives losing one drone.
    assert all(n["status"] != "isolated" for n in state["nodes"])


def _neighbours_of(sim, node_id):
    """Full neighbour set of a node, read straight from the live graph."""
    nbrs = set()
    for l in sim.graph.links:
        if l.source == node_id:
            nbrs.add(l.target)
        elif l.target == node_id:
            nbrs.add(l.source)
    return nbrs


def test_hacking_both_neighbours_isolates_a_drone():
    sim = Simulator()
    # In the dense mesh, killing 2 neighbours no longer isolates a node — that
    # redundancy is the point. To truly isolate a drone we must hack its ENTIRE
    # neighbour set. D8 is an outer-ring node; surround it completely.
    target = "D8"
    neighbours = _neighbours_of(sim, target)
    assert neighbours, "target must have neighbours"
    for nb in neighbours:
        sim.command("hack", nb)
    # Advance through detection into containment — once the neighbours are
    # quarantined, the surrounded drone is genuinely cut off.
    for _ in range(COMPROMISE_DWELL_TICKS + 1):
        state = sim.tick()

    node = next(n for n in state["nodes"] if n["id"] == target)
    assert node["status"] == "isolated"
    assert any(
        e["kind"] == "detection" and "ISOLATED" in e["message"]
        for e in state["events"]
    )
    # Multiple hacked drones + an isolated one -> CRITICAL.
    assert state["threat_level"] == "CRITICAL"


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


def test_live_attack_overlays_on_host_node_links():
    sim = Simulator()
    sim.heartbeat("ATK")        # register the host (attacker) node
    sim.tick()
    feats = {c: 1.0 for c in FEATURE_COLUMNS}
    sim.push_live_attack(
        feats, {"label": "PortScan", "attack_type": "PortScan", "confidence": 0.97},
        ttl_ticks=3,
    )
    state = sim.tick()
    atk_links = [l for l in state["links"] if "ATK" in (l["source"], l["target"])]
    assert atk_links, "ATK node should have incident links"
    assert all(l["prediction"]["label"] == "PortScan" for l in atk_links)
    assert state["threat_level"] != "NOMINAL"


def test_live_attack_expires_after_ttl():
    sim = Simulator()
    sim.heartbeat("ATK")
    sim.tick()
    feats = {c: 1.0 for c in FEATURE_COLUMNS}
    sim.push_live_attack(
        feats, {"label": "DoS", "attack_type": "DoS", "confidence": 0.95},
        ttl_ticks=1,
    )
    for _ in range(4):
        state = sim.tick()
    atk_links = [l for l in state["links"] if "ATK" in (l["source"], l["target"])]
    assert all(l["prediction"]["label"] != "DoS" for l in atk_links)
