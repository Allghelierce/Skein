// frontend/lib/modelReport.ts
// The detector's REAL evaluation, surfaced to the UI. These numbers are not
// invented — they're produced by `backend/ml/report.py` from the saved model
// (models/detector.joblib) scored on the held-out CIC-IDS-2017 test split, then
// copied here as model_report.json. To refresh after retraining:
//
//   cd backend && ./.venv/bin/python ml/report.py
//   cp backend/models/model_report.json frontend/lib/model_report.json
//
// Static by nature: this is training-time evaluation, the model's report card —
// it doesn't change tick to tick, so it lives in the bundle (works in MOCK too).

import report from "./model_report.json";

export interface PerClass {
  label: string;
  precision: number;
  recall: number;
  f1: number;
  support: number;
}

export interface FeatureImportance {
  feature: string;
  value: number;
}

export interface ModelComparison {
  model: string;
  accuracy: number;
  precision_macro: number;
  recall_macro: number;
  f1_macro: number;
}

export interface ModelReport {
  best_model: string;
  n_test: number;
  accuracy: number;
  macro_f1: number;
  macro_precision: number;
  macro_recall: number;
  labels: string[];
  confusion_matrix: number[][];
  per_class: PerClass[];
  feature_importance: FeatureImportance[];
  comparison: ModelComparison[];
}

export const MODEL_REPORT = report as ModelReport;
