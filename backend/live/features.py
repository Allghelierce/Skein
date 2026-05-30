"""Map a cicflowmeter flow record to the model's FEATURE_COLUMNS dict.

cicflowmeter emits ~80 bidirectional-flow columns; we select the 10 the model
was trained on (ml.schema.FEATURE_COLUMNS). Column names can vary by
cicflowmeter version — verify the left-hand keys against a real CSV header on
the rig (Task 4) before trusting in production.
"""
from __future__ import annotations

import math
from typing import Dict

from ml.schema import FEATURE_COLUMNS

# cicflowmeter column name -> our schema name.
FLOW_FEATURE_MAP: Dict[str, str] = {
    "flow_duration": "flow_duration",
    "tot_fwd_pkts": "total_fwd_packets",
    "tot_bwd_pkts": "total_bwd_packets",
    "flow_byts_s": "flow_bytes_s",
    "flow_pkts_s": "flow_packets_s",
    "flow_iat_mean": "flow_iat_mean",
    "fwd_pkt_len_mean": "fwd_pkt_len_mean",
    "bwd_pkt_len_mean": "bwd_pkt_len_mean",
    "pkt_len_mean": "pkt_len_mean",
    "pkt_size_avg": "avg_pkt_size",
}


def map_flow(flow: Dict[str, object]) -> Dict[str, float]:
    feats: Dict[str, float] = {}
    for cic_key, our_key in FLOW_FEATURE_MAP.items():
        try:
            val = float(flow[cic_key])  # KeyError propagates -> fail loud
        except (TypeError, ValueError):
            val = 0.0
        if math.isnan(val) or math.isinf(val):
            val = 0.0
        feats[our_key] = val
    missing = set(FEATURE_COLUMNS) - set(feats)
    if missing:
        raise KeyError(f"flow mapping missing features: {sorted(missing)}")
    return feats
