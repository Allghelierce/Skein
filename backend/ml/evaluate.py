"""evaluate.py — evaluation report for the trained Skein detector (Task A).

Reads the saved bundle (models/detector.joblib) and the held-out test split
(models/test_split.joblib, written by train.py) and produces:
  • a per-class classification report (precision / recall / F1)
  • a confusion matrix (printed, and saved as PNG)
  • the top-10 feature importances (printed, and saved as PNG)

Run from backend/:   python ml/evaluate.py
(Requires `python ml/train.py` to have run first.)
"""
from __future__ import annotations

import os
import sys

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import classification_report, confusion_matrix

from ml.schema import ALL_LABELS, FEATURE_COLUMNS

HERE = os.path.dirname(__file__)
BACKEND = os.path.abspath(os.path.join(HERE, ".."))
MODELS_DIR = os.path.join(BACKEND, "models")
MODEL_PATH = os.path.join(MODELS_DIR, "detector.joblib")
TEST_SPLIT_PATH = os.path.join(MODELS_DIR, "test_split.joblib")
CM_PNG = os.path.join(MODELS_DIR, "confusion_matrix.png")
FI_PNG = os.path.join(MODELS_DIR, "feature_importance.png")


def _load() -> tuple:
    if not (os.path.exists(MODEL_PATH) and os.path.exists(TEST_SPLIT_PATH)):
        print(
            "[error] missing artifacts — run `python ml/train.py` first "
            f"(need {os.path.relpath(MODEL_PATH, BACKEND)} and "
            f"{os.path.relpath(TEST_SPLIT_PATH, BACKEND)}).",
            file=sys.stderr,
        )
        sys.exit(1)
    return joblib.load(MODEL_PATH), joblib.load(TEST_SPLIT_PATH)


def feature_importances(model, columns) -> pd.Series:
    """Return a feature-importance Series, whatever the best model type is."""
    if hasattr(model, "feature_importances_"):  # RandomForest / XGBoost
        vals = np.asarray(model.feature_importances_, dtype=float)
    elif hasattr(model, "coef_"):  # LogisticRegression -> mean |coef| across classes
        vals = np.abs(np.asarray(model.coef_, dtype=float)).mean(axis=0)
    else:
        vals = np.zeros(len(columns))
    s = pd.Series(vals, index=columns).sort_values(ascending=False)
    return s


def main() -> None:
    bundle, split = _load()
    model = bundle["model"]
    classes = list(bundle["classes"])
    scaler = bundle.get("scaler") or split.get("scaler")
    columns = list(bundle.get("columns", FEATURE_COLUMNS))

    X_test = split["X_test"][columns].astype("float64")
    y_test = np.asarray(split["y_test"])
    Xte = scaler.transform(X_test) if scaler is not None else X_test.values

    # Predict (map XGBoost integer output back to string labels via `classes`).
    raw_pred = model.predict(Xte)
    if np.issubdtype(np.asarray(raw_pred).dtype, np.integer):
        y_pred = np.array([classes[i] for i in raw_pred])
    else:
        y_pred = np.asarray(raw_pred).astype(str)

    labels = [l for l in ALL_LABELS if l in set(y_test) | set(y_pred)]

    print(f"=== evaluation: {bundle.get('model_name', type(model).__name__)} ===\n")
    print("per-class report:")
    print(classification_report(y_test, y_pred, labels=labels, digits=4, zero_division=0))

    cm = confusion_matrix(y_test, y_pred, labels=labels)
    print("confusion matrix (rows=true, cols=pred):")
    print(pd.DataFrame(cm, index=labels, columns=labels).to_string())

    fi = feature_importances(model, columns)
    print("\ntop-10 feature importances:")
    print(fi.head(10).to_string())

    # ---- save PNGs (best-effort; headless backend) ----
    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        fig, ax = plt.subplots(figsize=(6, 5))
        im = ax.imshow(cm, cmap="magma")
        ax.set_xticks(range(len(labels)), labels, rotation=45, ha="right")
        ax.set_yticks(range(len(labels)), labels)
        ax.set_xlabel("predicted")
        ax.set_ylabel("true")
        ax.set_title(f"confusion matrix — {bundle.get('model_name', '')}")
        for i in range(len(labels)):
            for j in range(len(labels)):
                ax.text(j, i, int(cm[i, j]), ha="center", va="center",
                        color="white" if cm[i, j] < cm.max() / 2 else "black", fontsize=8)
        fig.colorbar(im, ax=ax)
        fig.tight_layout()
        fig.savefig(CM_PNG, dpi=120)
        plt.close(fig)

        fig, ax = plt.subplots(figsize=(7, 4))
        top = fi.head(10)[::-1]
        ax.barh(top.index, top.values, color="#22c55e")
        ax.set_title("top-10 feature importances")
        fig.tight_layout()
        fig.savefig(FI_PNG, dpi=120)
        plt.close(fig)
        print(f"\n[save] {os.path.relpath(CM_PNG, BACKEND)} , {os.path.relpath(FI_PNG, BACKEND)}")
    except Exception as e:
        print(f"\n[warn] PNG export skipped ({e}); metrics above are authoritative.")


if __name__ == "__main__":
    main()
