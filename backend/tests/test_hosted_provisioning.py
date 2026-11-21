"""Exercise the hosted CLI's forwarded command without reading hosted secrets or connecting."""

import importlib.util
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from accounts.management.commands.create_app_user import Command


@pytest.fixture
def helper():
    path = Path(__file__).resolve().parents[2] / "scripts" / "hosted-admin.py"
    spec = importlib.util.spec_from_file_location("hosted_provisioning_test", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize("role", [None, "User", "Choirmaster", "Admin"])
def test_hosted_creation_forwards_a_role_the_management_command_accepts(helper, monkeypatch, role):
    args = ["hosted-admin.py", "create-user", "--username", "fixture-user"]
    if role:
        args += ["--role", role]
    monkeypatch.setattr("sys.argv", args)
    monkeypatch.setattr("builtins.input", lambda _: "HOSTED")
    monkeypatch.setattr(helper, "hosted_environment", lambda _: ({}, "fixture.pooler.supabase.com"))
    run = Mock(return_value=SimpleNamespace(returncode=0))
    monkeypatch.setattr(helper.subprocess, "run", run)
    with pytest.raises(SystemExit) as result:
        helper.main()
    assert result.value.code == 0
    forwarded = run.call_args.args[0][2:]
    assert forwarded == ["create_app_user", "fixture-user", "--role", role or "User"]
    parsed = Command().create_parser("manage.py", "create_app_user").parse_args(forwarded[1:])
    assert parsed.role == (role or "User")


@pytest.mark.parametrize("role", ["Viewer", "Planner"])
def test_obsolete_hosted_roles_fail_before_loading_environment_or_running_a_command(
    helper, monkeypatch, role
):
    monkeypatch.setattr(
        "sys.argv", ["hosted-admin.py", "create-user", "--username", "fixture-user", "--role", role]
    )
    environment = Mock()
    run = Mock()
    monkeypatch.setattr(helper, "hosted_environment", environment)
    monkeypatch.setattr(helper.subprocess, "run", run)
    with pytest.raises(SystemExit) as result:
        helper.main()
    assert result.value.code == 2
    environment.assert_not_called()
    run.assert_not_called()
