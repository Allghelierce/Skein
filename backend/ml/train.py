"""train.py — train the Skein classic-ML attack/jamming detector on real CIC data.

Pipeline (Task A):
    discover CIC CSVs  ->  map raw columns to FEATURE_COLUMNS  ->  map raw
    labels to ALL_LABELS  ->  clean inf/NaN  ->  stratified split  ->  train
    LogisticRegression / RandomForest / XGBoost  ->  compare (acc, macro
    P/R/F1)  ->  save the best bundle to models/detector.joblib  ->  emit the
    real data/sample/cic_sample.csv that replaces the Task-0 stub.

Data source (no fabrication — see CLAUDE.md hard rules):
    Looks for real CIC CSVs, in order:
      1. $CIC_CSV         (a CSV file or a directory of CSVs)
      2. backend/data/raw/**.csv   (auto-extracted from a *.zip there if needed)
    The recommended drop-in is the cleaned "CIC-IDS-2017 V2" release
    (https://zenodo.org/records/10141593) unzipped under backend/data/raw/.
    If no real CSVs are found, the script STOPS and reports — it does NOT
    invent feature numbers.

Run from backend/:   python ml/train.py
"""
from __future__ import annotations

import glob
import os
import re
import sys
import zipfile
from typing import Dict, List, Optional

# Make `import ml.*` work when run directly as `python ml/train.py` (script dir,
# not backend/, is what Python puts on sys.path[0]).
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler

try:
    from xgboost import XGBClassifier

    HAVE_XGB = True
except Exception as e:  # pragma: no cover - environment dependent
    HAVE_XGB = False
    print(f"[warn] xgboost unavailable ({e}); continuing with LogReg + RandomForest.")

from ml.schema import ALL_LABELS, ATTACK_TYPES, BENIGN, FEATURE_COLUMNS

HERE = os.path.dirname(__file__)
BACKEND = os.path.abspath(os.path.join(HERE, ".."))
RAW_DIR = os.path.join(BACKEND, "data", "raw")
SAMPLE_CSV = os.path.join(BACKEND, "data", "sample", "cic_sample.csv")
MODELS_DIR = os.path.join(BACKEND, "models")
MODEL_PATH = os.path.join(MODELS_DIR, "detector.joblib")
TEST_SPLIT_PATH = os.path.join(MODELS_DIR, "test_split.joblib")
COMPARISON_PATH = os.path.join(MODELS_DIR, "comparison.json")

# Per-class row caps so training stays fast and reasonably balanced on a laptop.
CAP_BENIGN = int(os.environ.get("CIC_CAP_BENIGN", "40000"))
CAP_ATTACK = int(os.environ.get("CIC_CAP_ATTACK", "20000"))
RANDOM_STATE = 42


# --------------------------------------------------------------------------- #
# Column + label mapping (robust to CIC's many header/casing variants)
# --------------------------------------------------------------------------- #
def _norm(name: str) -> str:
    """Normalize a column/label name: lowercase, strip all non-alphanumerics."""
    return re.sub(r"[^a-z0-9]", "", str(name).lower())


# normalized-source-name -> our FEATURE_COLUMNS target
_COLUMN_ALIASES: Dict[str, str] = {}


def _alias(target: str, *variants: str) -> None:
    for v in variants:
        _COLUMN_ALIASES[_norm(v)] = target


_alias("flow_duration", "Flow Duration")
_alias("total_fwd_packets", "Total Fwd Packets", "Total Fwd Packet", "Tot Fwd Pkts")
_alias("total_bwd_packets", "Total Backward Packets", "Total Bwd Packets", "Total Bwd Packet", "Tot Bwd Pkts")
_alias("flow_bytes_s", "Flow Bytes/s", "Flow Byts/s")
_alias("flow_packets_s", "Flow Packets/s", "Flow Pkts/s")
_alias("flow_iat_mean", "Flow IAT Mean")
_alias("fwd_pkt_len_mean", "Fwd Packet Length Mean", "Fwd Pkt Len Mean")
_alias("bwd_pkt_len_mean", "Bwd Packet Length Mean", "Bwd Pkt Len Mean")
_alias("pkt_len_mean", "Packet Length Mean", "Pkt Len Mean")
_alias("avg_pkt_size", "Average Packet Size", "Avg Packet Size", "Pkt Size Avg", "Average Pkt Size")


def build_rename_map(raw_columns: List[str]) -> Dict[str, str]:
    """Map this file's raw column names onto FEATURE_COLUMNS (+ 'label')."""
    rename: Dict[str, str] = {}
    for col in raw_columns:
        n = _norm(col)
        if n in _COLUMN_ALIASES:
            rename[col] = _COLUMN_ALIASES[n]
        elif n == "label":
            rename[col] = "label"
    return rename


def map_label(raw: str) -> Optional[str]:
    """Map a raw CIC label onto ALL_LABELS, or None to drop (out-of-scope class)."""
    n = _norm(raw)
    if "benign" in n or n == "normal":
        return BENIGN
    if "portscan" in n or "port scan" in raw.lower():
        return "PortScan"
    # Brute-force families: FTP/SSH patator and web brute force.
    if "patator" in n or "bruteforce" in n or "brute" in n:
        return "BruteForce"
    # Flood / denial-of-service families (incl. DDoS) -> DoS.
    if "dos" in n or "ddos" in n or "hulk" in n or "goldeneye" in n or "slowloris" in n or "slowhttptest" in n:
        return "DoS"
    return None  # Bot, Infiltration, Heartbleed, Web XSS/SQLi, etc. -> out of scope


# --------------------------------------------------------------------------- #
# Data discovery + loading
# --------------------------------------------------------------------------- #
def _extract_zips_if_needed() -> None:
    if not os.path.isdir(RAW_DIR):
        return
    csvs = glob.glob(os.path.join(RAW_DIR, "**", "*.csv"), recursive=True)
    if csvs:
        return
    for zp in glob.glob(os.path.join(RAW_DIR, "*.zip")):
        print(f"[data] extracting {os.path.basename(zp)} ...")
        with zipfile.ZipFile(zp) as zf:
            zf.extractall(RAW_DIR)


def discover_csvs() -> List[str]:
    env = os.environ.get("CIC_CSV")
    if env:
        if os.path.isdir(env):
            return sorted(glob.glob(os.path.join(env, "**", "*.csv"), recursive=True))
        if os.path.isfile(env):
            return [env]
        print(f"[error] CIC_CSV={env!r} is not a file or directory.")
        sys.exit(1)
    _extract_zips_if_needed()
    return sorted(glob.glob(os.path.join(RAW_DIR, "**", "*.csv"), recursive=True))


def load_dataset() -> pd.DataFrame:
    """Stream all CIC CSVs in chunks, map + clean, accumulate with per-class caps."""
    files = discover_csvs()
    if not files:
        print(
            "\n[STOP] No real CIC CSVs found.\n"
            "  Skein's hard rule is REAL data only — this script will not fabricate features.\n"
            "  Provide the data one of these ways, then re-run `python ml/train.py`:\n"
            f"    • unzip the cleaned CIC-IDS-2017 V2 into {RAW_DIR}/\n"
            "      (https://zenodo.org/records/10141593)\n"
            "    • or set CIC_CSV=/path/to/cic.csv  (file or directory of CSVs)\n",
            file=sys.stderr,
        )
        sys.exit(2)

    print(f"[data] found {len(files)} CSV file(s) under the data source.")
    caps = {BENIGN: CAP_BENIGN, **{a: CAP_ATTACK for a in ATTACK_TYPES}}
    counts = {lbl: 0 for lbl in ALL_LABELS}
    keep_parts: List[pd.DataFrame] = []

    for path in files:
        if all(counts[l] >= caps[l] for l in ALL_LABELS):
            break
        try:
            header = pd.read_csv(path, nrows=0)
        except Exception as e:
            print(f"[warn] skip {os.path.basename(path)}: {e}")
            continue
        rename = build_rename_map(list(header.columns))
        have = set(rename.values())
        if not (set(FEATURE_COLUMNS) <= have and "label" in have):
            missing = (set(FEATURE_COLUMNS) | {"label"}) - have
            print(f"[warn] skip {os.path.basename(path)}: missing {sorted(missing)}")
            continue

        reader = pd.read_csv(
            path,
            usecols=list(rename.keys()),
            chunksize=200_000,
            low_memory=False,
        )
        for chunk in reader:
            chunk = chunk.rename(columns=rename)
            chunk = chunk[FEATURE_COLUMNS + ["label"]].copy()
            chunk["label"] = chunk["label"].map(map_label)
            chunk = chunk.dropna(subset=["label"])
            # numeric coercion + clean inf/NaN in features
            for c in FEATURE_COLUMNS:
                chunk[c] = pd.to_numeric(chunk[c], errors="coerce")
            chunk = chunk.replace([np.inf, -np.inf], np.nan).dropna(subset=FEATURE_COLUMNS)

            for lbl, grp in chunk.groupby("label"):
                room = caps[lbl] - counts[lbl]
                if room <= 0:
                    continue
                take = grp.iloc[:room]
                keep_parts.append(take)
                counts[lbl] += len(take)

    df = pd.concat(keep_parts, ignore_index=True) if keep_parts else pd.DataFrame()
    print("[data] rows per class after cleaning + caps:")
    for lbl in ALL_LABELS:
        print(f"        {lbl:<11} {counts[lbl]:>8}")

    present = [l for l in ALL_LABELS if counts[l] > 0]
    if BENIGN not in present or len(present) < 2:
        print(
            "\n[STOP] Need BENIGN plus at least one attack class to train.\n"
            "  The discovered CSVs did not yield the expected CIC label set.\n",
            file=sys.stderr,
        )
        sys.exit(3)
    return df


# --------------------------------------------------------------------------- #
# Model training + comparison
# --------------------------------------------------------------------------- #
def _macro(y_true, y_pred) -> Dict[str, float]:
    return {
        "accuracy": accuracy_score(y_true, y_pred),
        "precision_macro": precision_score(y_true, y_pred, average="macro", zero_division=0),
        "recall_macro": recall_score(y_true, y_pred, average="macro", zero_division=0),
        "f1_macro": f1_score(y_true, y_pred, average="macro", zero_division=0),
    }


def train_models(X_train, X_test, y_train, y_test):
    """Train 3 classic models on scaled features; return per-model results."""
    le = LabelEncoder().fit(y_train)  # for XGBoost's integer-label requirement

    results = []

    # 1) Logistic Regression. A couple of CIC features are heavy-tailed, so the
    # LBFGS line search probes large weights and trips harmless float-overflow
    # flags in the matmul; the fit still converges. Silence those cosmetic
    # numpy FP warnings for fit + predict.
    logreg = LogisticRegression(max_iter=2000)
    with np.errstate(all="ignore"):
        logreg.fit(X_train, y_train)
        logreg_pred = logreg.predict(X_test)
    results.append(("LogisticRegression", logreg, list(logreg.classes_), logreg_pred))

    # 2) Random Forest
    rf = RandomForestClassifier(
        n_estimators=200, max_depth=None, n_jobs=-1, random_state=RANDOM_STATE, class_weight="balanced_subsample"
    )
    rf.fit(X_train, y_train)
    results.append(("RandomForest", rf, list(rf.classes_), rf.predict(X_test)))

    # 3) XGBoost (optional)
    if HAVE_XGB:
        xgb = XGBClassifier(
            n_estimators=300,
            max_depth=8,
            learning_rate=0.2,
            subsample=0.9,
            colsample_bytree=0.9,
            tree_method="hist",
            n_jobs=-1,
            random_state=RANDOM_STATE,
            eval_metric="mlogloss",
        )
        xgb.fit(X_train, le.transform(y_train))
        xgb_pred = le.inverse_transform(xgb.predict(X_test))
        results.append(("XGBoost", xgb, list(le.classes_), xgb_pred))

    rows = []
    for name, model, classes, y_pred in results:
        m = _macro(y_test, y_pred)
        rows.append({"model": name, "_obj": model, "_classes": classes, **m})
    return rows


def print_comparison(rows) -> None:
    print("\n=== model comparison (test set) ===")
    print(f"{'model':<20}{'accuracy':>10}{'precision':>11}{'recall':>9}{'f1_macro':>10}")
    for r in sorted(rows, key=lambda x: x["f1_macro"], reverse=True):
        print(
            f"{r['model']:<20}{r['accuracy']:>10.4f}{r['precision_macro']:>11.4f}"
            f"{r['recall_macro']:>9.4f}{r['f1_macro']:>10.4f}"
        )


def write_sample_csv(df: pd.DataFrame) -> None:
    """Write the real cic_sample.csv: >=200 benign + >=50 per attack type."""
    parts = []
    targets = {BENIGN: 250, **{a: 80 for a in ATTACK_TYPES}}
    for lbl, n in targets.items():
        grp = df[df["label"] == lbl]
        if len(grp) == 0:
            continue
        parts.append(grp.sample(n=min(n, len(grp)), random_state=RANDOM_STATE))
    sample = pd.concat(parts, ignore_index=True)
    sample = sample.sample(frac=1.0, random_state=RANDOM_STATE).reset_index(drop=True)
    # Keep FULL precision: the CIC-IDS-2017 V2 features are min-max normalized
    # and heavily compressed near zero (median flow_duration ~4e-4), so rounding
    # collapses the very structure the trees split on. No .round() here.
    sample = sample[FEATURE_COLUMNS + ["label"]]
    os.makedirs(os.path.dirname(SAMPLE_CSV), exist_ok=True)
    sample.to_csv(SAMPLE_CSV, index=False)
    print(f"[sample] wrote {len(sample)} rows -> {os.path.relpath(SAMPLE_CSV, BACKEND)}")
    print(sample["label"].value_counts().to_string())


def main() -> None:
    os.makedirs(MODELS_DIR, exist_ok=True)
    df = load_dataset()

    X = df[FEATURE_COLUMNS].astype("float64")
    y = df["label"].astype(str)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, stratify=y, random_state=RANDOM_STATE
    )

    scaler = StandardScaler().fit(X_train)
    Xtr = scaler.transform(X_train)
    Xte = scaler.transform(X_test)

    rows = train_models(Xtr, Xte, y_train.values, y_test.values)
    print_comparison(rows)

    best = max(rows, key=lambda r: r["f1_macro"])
    print(f"\n[best] {best['model']}  (macro-F1 = {best['f1_macro']:.4f})")

    bundle = {
        "model": best["_obj"],
        "scaler": scaler,
        "columns": FEATURE_COLUMNS,
        "classes": best["_classes"],
        "model_name": best["model"],
        "metrics": {k: best[k] for k in ("accuracy", "precision_macro", "recall_macro", "f1_macro")},
    }
    joblib.dump(bundle, MODEL_PATH)
    print(f"[save] {os.path.relpath(MODEL_PATH, BACKEND)}")

    # Persist the test split (scaled-ready: store raw + reuse scaler) for evaluate.py.
    joblib.dump(
        {"X_test": X_test, "y_test": y_test.values, "scaler": scaler, "columns": FEATURE_COLUMNS},
        TEST_SPLIT_PATH,
    )

    # Persist a comparison table for the notebook.
    import json

    with open(COMPARISON_PATH, "w") as f:
        json.dump(
            [{k: r[k] for k in ("model", "accuracy", "precision_macro", "recall_macro", "f1_macro")} for r in rows],
            f,
            indent=2,
        )

    write_sample_csv(df)

    if best["f1_macro"] < 0.90:
        print(
            f"\n[warn] best macro-F1 {best['f1_macro']:.4f} < 0.90 target — "
            "revisit feature mapping / cleaning."
        )


if __name__ == "__main__":
    main()
