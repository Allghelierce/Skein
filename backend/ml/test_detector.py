"""TDD test for the Detector contract (Task A, Step 1).

Red before `python ml/train.py` (no model artifact yet), green after.
Run from the `backend/` directory:  pytest ml/test_detector.py -v
"""
import os

import pytest

from ml.detector import Detector
from ml.schema import ALL_LABELS, BENIGN, FEATURE_COLUMNS

MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "models", "detector.joblib")


@pytest.mark.skipif(
    not os.path.exists(MODEL_PATH),
    reason="models/detector.joblib not built yet — run `python ml/train.py` first",
)
def test_predict_shape():
    d = Detector(MODEL_PATH)
    feats = {c: 1.0 for c in FEATURE_COLUMNS}
    out = d.predict(feats)
    assert set(out) == {"label", "attack_type", "confidence"}
    assert 0.0 <= out["confidence"] <= 1.0
    assert out["label"] in ALL_LABELS
    # BENIGN must carry a null attack_type; any attack must name itself.
    if out["label"] == BENIGN:
        assert out["attack_type"] is None
    else:
        assert out["attack_type"] == out["label"]


@pytest.mark.skipif(
    not os.path.exists(MODEL_PATH),
    reason="models/detector.joblib not built yet — run `python ml/train.py` first",
)
def test_predict_separates_benign_from_dos():
    """A clearly-benign row and a clearly-DoS row must not get the same label.

    Uses the real cic_sample.csv pools so this exercises the trained model on
    genuine CIC-derived feature vectors, not hand-picked constants.
    """
    import csv

    sample = os.path.join(os.path.dirname(__file__), "..", "data", "sample", "cic_sample.csv")
    rows = list(csv.DictReader(open(sample)))
    by_label = {}
    for r in rows:
        by_label.setdefault(r["label"], []).append(r)

    d = Detector(MODEL_PATH)

    def predict_row(r):
        return d.predict({c: float(r[c]) for c in FEATURE_COLUMNS})

    # The model should label the majority of each pool as that pool's class.
    for label, pool in by_label.items():
        hits = sum(predict_row(r)["label"] == label for r in pool[:30])
        assert hits >= len(pool[:30]) * 0.6, f"{label}: only {hits} correct"
