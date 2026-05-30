import pytest
from live.features import map_flow
from ml.schema import FEATURE_COLUMNS


def _sample_flow():
    # cicflowmeter-shaped record for a small scan flow (attacker -> laptop 1).
    return {
        "flow_duration": 1234.0, "tot_fwd_pkts": 6, "tot_bwd_pkts": 1,
        "flow_byts_s": 5000.0, "flow_pkts_s": 4200.0, "flow_iat_mean": 30.0,
        "fwd_pkt_len_mean": 20.0, "bwd_pkt_len_mean": 0.0, "pkt_len_mean": 18.0,
        "pkt_size_avg": 22.0, "src_ip": "10.0.0.2", "dst_ip": "10.0.0.1",
    }


def test_map_flow_produces_every_feature_column():
    feats = map_flow(_sample_flow())
    assert set(feats) == set(FEATURE_COLUMNS)
    assert feats["total_fwd_packets"] == 6.0
    assert feats["avg_pkt_size"] == 22.0


def test_map_flow_coerces_bad_values_to_zero():
    flow = _sample_flow()
    flow["flow_byts_s"] = "Infinity"
    flow["flow_pkts_s"] = None
    feats = map_flow(flow)
    assert feats["flow_bytes_s"] == 0.0
    assert feats["flow_packets_s"] == 0.0


def test_map_flow_raises_when_source_lacks_columns():
    with pytest.raises(KeyError):
        map_flow({"flow_duration": 1.0})
