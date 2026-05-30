"""Live capture: flow iterator -> filter -> Detector -> callback.

The brittle third-party piece (cicflowmeter) is isolated in flow_source.py and
injected here as `flow_source`, an iterator of flow dicts. That keeps this core
unit-testable with a plain list and no real packets.
"""
from __future__ import annotations

import logging
import threading
from typing import Callable, Dict, Iterable, Optional

from live.features import map_flow
from ml.schema import BENIGN

logger = logging.getLogger("skein.live")


class LiveCapture:
    def __init__(
        self,
        flow_source: Iterable[Dict],
        detector,
        attacker_ip: str,
        on_detection: Callable[[Dict[str, float], Dict[str, object]], None],
        stop_event: Optional[threading.Event] = None,
    ) -> None:
        self._flow_source = flow_source
        self._detector = detector
        self._attacker_ip = attacker_ip
        self._on_detection = on_detection
        # Shared so the production flow_source can watch the same stop signal and
        # return promptly instead of blocking the thread forever.
        self._stop = stop_event or threading.Event()
        self._thread: Optional[threading.Thread] = None
        self.last_error: Optional[str] = None

    @property
    def stop_event(self) -> threading.Event:
        return self._stop

    def _involves_attacker(self, flow: Dict) -> bool:
        return self._attacker_ip in (flow.get("src_ip"), flow.get("dst_ip"))

    def _run(self) -> None:
        for flow in self._flow_source:
            if self._stop.is_set():
                break
            # One malformed flow (e.g. a cicflowmeter column-name drift that makes
            # map_flow raise) must NOT silently kill the capture thread — log it,
            # remember it, and keep scoring the next flow.
            try:
                if not self._involves_attacker(flow):
                    continue
                feats = map_flow(flow)
                pred = self._detector.predict(feats)
                if pred["label"] != BENIGN:
                    self._on_detection(feats, pred)
            except Exception as exc:  # noqa: BLE001 — deliberately broad: keep alive
                self.last_error = repr(exc)
                logger.warning("live capture: skipping bad flow: %r", exc)

    def start(self) -> None:
        self._thread = threading.Thread(
            target=self._run, name="skein-live-capture", daemon=True
        )
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
