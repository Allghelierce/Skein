"""Env-gated startup for the live-capture path. Off unless explicitly enabled."""
from __future__ import annotations

import logging
import os
import threading
from typing import Optional

from live.capture import LiveCapture

logger = logging.getLogger("skein.live")


def maybe_start_live_capture(simulator) -> Optional[LiveCapture]:
    if os.getenv("SKEIN_LIVE_CAPTURE") != "1":
        return None
    attacker_ip = os.getenv("SKEIN_ATTACKER_IP")
    if not attacker_ip:
        logger.warning(
            "SKEIN_LIVE_CAPTURE=1 but SKEIN_ATTACKER_IP is unset; live capture disabled"
        )
        return None
    iface = os.getenv("SKEIN_CAPTURE_IFACE", "en0")
    from live.flow_source import cicflowmeter_flows

    # One stop event shared by the capture loop and the flow source, so stop()
    # promptly unblocks the source's poll loop instead of leaving it sleeping.
    stop_event = threading.Event()
    source = cicflowmeter_flows(iface, stop_event=stop_event)
    capture = LiveCapture(
        source,
        simulator.detector,
        attacker_ip,
        simulator.push_live_attack,
        stop_event=stop_event,
    )
    capture.start()
    logger.info("live capture started on iface %s (attacker ip %s)", iface, attacker_ip)
    return capture
