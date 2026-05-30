"""Env-gated startup for the live-capture path. Off unless explicitly enabled."""
from __future__ import annotations

import os
from typing import Optional

from live.capture import LiveCapture


def maybe_start_live_capture(simulator) -> Optional[LiveCapture]:
    if os.getenv("SKEIN_LIVE_CAPTURE") != "1":
        return None
    attacker_ip = os.getenv("SKEIN_ATTACKER_IP")
    if not attacker_ip:
        return None
    iface = os.getenv("SKEIN_CAPTURE_IFACE", "en0")
    from live.flow_source import cicflowmeter_flows

    source = cicflowmeter_flows(iface)
    capture = LiveCapture(
        source, simulator.detector, attacker_ip, simulator.push_live_attack
    )
    capture.start()
    return capture
