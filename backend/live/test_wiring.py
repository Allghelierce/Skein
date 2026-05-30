from live.wiring import maybe_start_live_capture


class _FakeSim:
    detector = object()

    def push_live_attack(self, *a, **k):
        pass


def test_disabled_when_env_unset(monkeypatch):
    monkeypatch.delenv("SKEIN_LIVE_CAPTURE", raising=False)
    assert maybe_start_live_capture(_FakeSim()) is None


def test_disabled_when_attacker_ip_missing(monkeypatch):
    monkeypatch.setenv("SKEIN_LIVE_CAPTURE", "1")
    monkeypatch.delenv("SKEIN_ATTACKER_IP", raising=False)
    assert maybe_start_live_capture(_FakeSim()) is None
