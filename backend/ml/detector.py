"""Detector — the live ML brain of Skein (Task A).

Loads the trained classic-ML bundle produced by `train.py` and scores ONE
feature vector at a time. The mesh simulator (Task B) imports `Detector` and
calls `predict()` per link per tick. The returned shape is a fixed contract:

    {"label": str, "attack_type": str | None, "confidence": float}

`label` is one of `ml.schema.ALL_LABELS`; `attack_type` is `None` for BENIGN
and equal to `label` otherwise; `confidence` is the model's max class
probability in [0, 1].
"""
from __future__ import annotations

from typing import Dict, Optional

import joblib
import numpy as np
import pandas as pd

from ml.schema import BENIGN, FEATURE_COLUMNS


class Detector:
    """Wraps a saved {model, scaler, columns, classes, model_name} bundle."""

    def __init__(self, model_path: str):
        bundle = joblib.load(model_path)
        self.model = bundle["model"]
        self.scaler = bundle.get("scaler")
        # Column order the model was trained on (defaults to the shared contract).
        self.columns = list(bundle.get("columns", FEATURE_COLUMNS))
        # Class labels aligned to predict_proba's column order.
        self.classes = list(bundle["classes"])
        self.model_name = bundle.get("model_name", type(self.model).__name__)

    def _vectorize(self, features: Dict[str, float]) -> np.ndarray:
        """Build a 1-row matrix in the trained column order, scaled if needed."""
        row = pd.DataFrame([[float(features[c]) for c in self.columns]], columns=self.columns)
        X = row.values
        if self.scaler is not None:
            X = self.scaler.transform(X)
        return X

    def predict(self, features: Dict[str, float]) -> Dict[str, object]:
        """Score one feature dict (keys must include every FEATURE_COLUMNS entry)."""
        X = self._vectorize(features)
        proba = np.asarray(self.model.predict_proba(X))[0]
        idx = int(np.argmax(proba))
        label = str(self.classes[idx])
        confidence = float(proba[idx])
        attack_type: Optional[str] = None if label == BENIGN else label
        return {"label": label, "attack_type": attack_type, "confidence": confidence}
