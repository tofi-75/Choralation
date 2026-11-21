"""Browser-only connection policy must not change normal or hosted settings."""

import runpy

import pytest
from django.core.exceptions import ImproperlyConfigured

from config import settings as base


def test_browser_connections_close_per_request_without_mutating_base(monkeypatch):
    configured = {"default": {"HOST": "127.0.0.1", "CONN_MAX_AGE": 60}}
    monkeypatch.setattr(base, "DEBUG", True)
    monkeypatch.setattr(base, "DATABASES", configured)
    browser = runpy.run_module("config.browser_test_settings")
    assert browser["DATABASES"]["default"]["CONN_MAX_AGE"] == 0
    assert configured["default"]["CONN_MAX_AGE"] == 60


@pytest.mark.parametrize("debug,host", [(False, "127.0.0.1"), (True, "hosted.example.test")])
def test_browser_settings_reject_hosted_or_production_use(monkeypatch, debug, host):
    monkeypatch.setattr(base, "DEBUG", debug)
    monkeypatch.setattr(base, "DATABASES", {"default": {"HOST": host}})
    with pytest.raises(ImproperlyConfigured, match="local development database"):
        runpy.run_module("config.browser_test_settings")
