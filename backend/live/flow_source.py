"""Production flow source: run cicflowmeter writing CSV, tail rows as dicts.

This is the one place coupled to cicflowmeter's CLI/output, so the rest of the
live path stays testable. Capture requires root on laptop 1 (run the server
with sudo, or grant the python binary capture caps).

Column names + CLI flags are pinned to cicflowmeter==0.5.0 — verify against the
package's flow.py `get_data()` (and live/features.py::FLOW_FEATURE_MAP) on any
upgrade, and on the rig (Task 4) before trusting. A name drift makes map_flow
raise, which LiveCapture now logs and skips rather than dying silently.
"""
from __future__ import annotations

import contextlib
import csv
import logging
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from typing import Dict, Iterator, List, Optional

logger = logging.getLogger("skein.live")


def _cicflowmeter_cmd(iface: str, out_csv: str) -> List[str]:
    """Resolve the cicflowmeter executable robustly.

    Under `sudo`, root's PATH usually lacks the venv, so a bare `cicflowmeter`
    raises FileNotFoundError. Prefer the console script sitting next to THIS
    interpreter (the venv bin), then fall back to PATH.
    """
    venv_bin = os.path.join(os.path.dirname(sys.executable), "cicflowmeter")
    exe = venv_bin if os.path.exists(venv_bin) else (shutil.which("cicflowmeter") or "cicflowmeter")
    return [exe, "-i", iface, "-c", out_csv]


def cicflowmeter_flows(
    iface: str,
    flush_seconds: float = 1.0,
    stop_event: Optional[threading.Event] = None,
) -> Iterator[Dict[str, str]]:
    out_dir = tempfile.mkdtemp(prefix="skein-flows-")
    out_csv = os.path.join(out_dir, "flows.csv")
    err_log = os.path.join(out_dir, "cicflowmeter.err")
    cmd = _cicflowmeter_cmd(iface, out_csv)
    logger.info("live capture: launching: %s", " ".join(cmd))

    def _stopping() -> bool:
        return stop_event is not None and stop_event.is_set()

    try:
        err_fh = open(err_log, "w")
        proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=err_fh)
    except FileNotFoundError as exc:
        # Don't let a missing binary kill the server — the simulated lever still
        # drives the dashboard. Surface a clear reason instead of a silent death.
        logger.error("live capture: cicflowmeter not found (%r); live detection disabled", exc)
        return

    def _proc_died() -> bool:
        if proc.poll() is None:
            return False
        logger.error(
            "live capture: cicflowmeter exited (code %s) — see %s; live detection off",
            proc.returncode, err_log,
        )
        return True

    try:
        while not os.path.exists(out_csv):
            if _stopping() or _proc_died():
                return
            time.sleep(flush_seconds)
        with open(out_csv, newline="") as f:
            reader = csv.DictReader(f)
            while not _stopping():
                row = next(reader, None)
                if row is None:
                    if _proc_died():
                        return
                    time.sleep(flush_seconds)
                    continue
                yield row
    finally:
        with contextlib.suppress(Exception):
            proc.terminate()
        with contextlib.suppress(Exception):
            err_fh.close()
