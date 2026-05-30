"""Production flow source: run cicflowmeter writing CSV, tail rows as dicts.

This is the one place coupled to cicflowmeter's CLI/output, so the rest of the
live path stays testable. Capture requires root on laptop 1 (run the server
with sudo, or grant the python binary capture caps). Verify the exact CLI flags
and CSV column names against the installed cicflowmeter version on the rig
(Task 4) — they vary between releases.
"""
from __future__ import annotations

import csv
import os
import subprocess
import tempfile
import time
from typing import Dict, Iterator


def cicflowmeter_flows(iface: str, flush_seconds: float = 1.0) -> Iterator[Dict[str, str]]:
    out_dir = tempfile.mkdtemp(prefix="skein-flows-")
    out_csv = os.path.join(out_dir, "flows.csv")
    proc = subprocess.Popen(
        ["cicflowmeter", "-i", iface, "-c", out_csv],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        while not os.path.exists(out_csv):
            time.sleep(flush_seconds)
        with open(out_csv, newline="") as f:
            reader = csv.DictReader(f)
            while True:
                row = next(reader, None)
                if row is None:
                    time.sleep(flush_seconds)
                    continue
                yield row
    finally:
        proc.terminate()
