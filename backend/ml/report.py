"""report.py — dump the trained detector's evaluation as machine-readable JSON.

Same data `evaluate.py` prints, but written to models/model_report.json so the
frontend can render the real report card (no invented numbers). Reads the saved
bundle (models/detector.joblib) + held-out split (models/test_split.joblib) and
the model bake-off (models/comparison.json).

Run from backend/:   python ml/report.py
(Requires `python ml/train.py` to have run first.)
"""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import joblib
import numpy as np
from sklearn.metrics import classification_report, confusion_matrix

from ml.evaluate import _load, feature_importances
from ml.schema import ALL_LABELS, FEATURE_COLUMNS

HERE = os.path.dirname(__file__)
BACKEND = os.path.abspath(os.path.join(HERE, ".."))
MODELS_DIR = os.path.join(BACKEND, "models")
COMPARISON_PATH = os.path.join(MODELS_DIR, "comparison.json")
OUT_PATH = os.path.join(MODELS_DIR, "model_report.json")


def main() -> None:
    bundle, split = _load()
    model = bundle["model"]
    classes = list(bundle["classes"])
    scaler = bundle.get("scaler") or split.get("scaler")
    columns = list(bundle.get("columns", FEATURE_COLUMNS))
    model_name = bundle.get("model_name", type(model).__name__)

    X_test = split["X_test"][columns].astype("float64")
    y_test = np.asarray(split["y_test"])
    Xte = scaler.transform(X_test) if scaler is not None else X_test.values

    raw_pred = model.predict(Xte)
    if np.issubdtype(np.asarray(raw_pred).dtype, np.integer):
        y_pred = np.array([classes[i] for i in raw_pred])
    else:
        y_pred = np.asarray(raw_pred).astype(str)

    labels = [l for l in ALL_LABELS if l in set(y_test) | set(y_pred)]

    # per-class precision / recall / f1 / support (real)
    rep = classification_report(
        y_test, y_pred, labels=labels, digits=4, zero_division=0, output_dict=True
    )
    per_class = [
        {
            "label": l,
            "precision": round(rep[l]["precision"], 4),
            "recall": round(rep[l]["recall"], 4),
            "f1": round(rep[l]["f1-score"], 4),
            "support": int(rep[l]["support"]),
        }
        for l in labels
    ]

    # confusion matrix (rows=true, cols=pred), real counts
    cm = confusion_matrix(y_test, y_pred, labels=labels).astype(int).tolist()

    # top-10 feature importances (real)
    fi = feature_importances(model, columns).head(10)
    importances = [{"feature": k, "value": round(float(v), 5)} for k, v in fi.items()]

    # model bake-off, if present
    comparison = []
    if os.path.exists(COMPARISON_PATH):
        with open(COMPARISON_PATH) as f:
            comparison = json.load(f)

    report = {
        "best_model": model_name,
        "n_test": int(len(y_test)),
        "accuracy": round(float(rep["accuracy"]), 4),
        "macro_f1": round(float(rep["macro avg"]["f1-score"]), 4),
        "macro_precision": round(float(rep["macro avg"]["precision"]), 4),
        "macro_recall": round(float(rep["macro avg"]["recall"]), 4),
        "labels": labels,
        "confusion_matrix": cm,
        "per_class": per_class,
        "feature_importance": importances,
        "comparison": comparison,
    }

    with open(OUT_PATH, "w") as f:
        json.dump(report, f, indent=2)
    print(f"[save] {os.path.relpath(OUT_PATH, BACKEND)}")
    print(f"  best={model_name}  acc={report['accuracy']}  macroF1={report['macro_f1']}  n_test={report['n_test']}")


if __name__ == "__main__":
    main()
