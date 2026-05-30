from live.capture import LiveCapture
from ml.schema import BENIGN


class FakeDetector:
    def __init__(self, label):
        self.label = label

    def predict(self, feats):
        at = None if self.label == BENIGN else self.label
        return {"label": self.label, "attack_type": at, "confidence": 0.99}


def _flow(src="10.0.0.2", dst="10.0.0.1"):
    return {
        "flow_duration": 1.0, "tot_fwd_pkts": 6, "tot_bwd_pkts": 1,
        "flow_byts_s": 1.0, "flow_pkts_s": 1.0, "flow_iat_mean": 1.0,
        "fwd_pkt_len_mean": 1.0, "bwd_pkt_len_mean": 1.0, "pkt_len_mean": 1.0,
        "pkt_size_avg": 1.0, "src_ip": src, "dst_ip": dst,
    }


def test_only_attacker_flows_are_scored():
    got = []
    cap = LiveCapture([_flow(src="10.0.0.9", dst="10.0.0.8")],
                      FakeDetector("PortScan"), "10.0.0.2",
                      lambda f, p: got.append(p))
    cap._run()
    assert got == []


def test_attack_flow_triggers_callback():
    got = []
    cap = LiveCapture([_flow()], FakeDetector("PortScan"), "10.0.0.2",
                      lambda f, p: got.append(p))
    cap._run()
    assert len(got) == 1 and got[0]["label"] == "PortScan"


def test_benign_flow_does_not_trigger_callback():
    got = []
    cap = LiveCapture([_flow()], FakeDetector(BENIGN), "10.0.0.2",
                      lambda f, p: got.append(p))
    cap._run()
    assert got == []
