"""Shared contract between the ML detector and the mesh simulator.

Both the training pipeline (Task A) and the mesh simulator (Task B) MUST use
FEATURE_COLUMNS in this exact order. Do not reorder or rename without updating
both sides and frontend/lib/types.ts consumers.
"""

FEATURE_COLUMNS = [
    "flow_duration",
    "total_fwd_packets",
    "total_bwd_packets",
    "flow_bytes_s",
    "flow_packets_s",
    "flow_iat_mean",
    "fwd_pkt_len_mean",
    "bwd_pkt_len_mean",
    "pkt_len_mean",
    "avg_pkt_size",
]

# Our normalized labels. CIC raw labels are mapped onto these in train.py.
BENIGN = "BENIGN"
ATTACK_TYPES = ["DoS", "PortScan", "BruteForce"]  # everything not BENIGN
ALL_LABELS = [BENIGN] + ATTACK_TYPES

# Mesh attack-action -> CIC attack category it should sample.
ACTION_TO_ATTACK = {
    "jam": "DoS",  # jamming a link looks like a flood / DoS on that link
    "hack": "PortScan",  # hacking a node looks like scanning / recon from it
}
