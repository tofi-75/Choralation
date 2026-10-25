"""Backup tooling must never persist or print the interactive database password."""

import importlib.util
import os
import subprocess
from pathlib import Path

import pytest


@pytest.fixture
def helper(tmp_path, monkeypatch):
    spec = importlib.util.spec_from_file_location(
        "backup_hosted", Path(__file__).resolve().parents[2] / "scripts" / "backup-hosted.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(module, "ROOT", tmp_path)
    binary = tmp_path / ".local" / "postgres" / "bin"
    binary.mkdir(parents=True)
    for name in ("pg_dump", "pg_restore"):
        (binary / (name + (".exe" if os.name == "nt" else ""))).touch()
    answers = iter(("aws-0-eu-central-1.pooler.supabase.com", "postgres.fictional"))
    monkeypatch.setattr("builtins.input", lambda _: next(answers))
    return module


@pytest.mark.parametrize("success", [True, False])
def test_password_is_only_in_dump_process_environment(helper, monkeypatch, capsys, success):
    password = "fictional-test-password-only"
    monkeypatch.setattr(helper.getpass, "getpass", lambda _: password)
    environments = []

    def run(args, **kwargs):
        assert password not in str(args)
        assert kwargs["capture_output"] and kwargs["timeout"] <= 600
        if "--file" in args:
            environments.append(kwargs["env"])
            assert kwargs["env"]["PGPASSWORD"] == password
            assert kwargs["env"]["PGSSLMODE"] == "require"
            Path(args[args.index("--file") + 1]).write_bytes(b"fictional-archive")
            return subprocess.CompletedProcess(args, 0 if success else 1, b"", password.encode())
        return subprocess.CompletedProcess(args, 0, b"fictional archive listing", b"")

    monkeypatch.setattr(helper.subprocess, "run", run)
    if success:
        helper.main()
    else:
        with pytest.raises(ValueError, match="Provider details were suppressed") as error:
            helper.main()
        assert password not in str(error.value)
    assert all("PGPASSWORD" not in environment for environment in environments)
    assert password not in capsys.readouterr().out
    assert len(list((helper.ROOT / ".local" / "backups").glob("*.dump"))) == int(success)
    assert not (helper.ROOT / ".env.hosted").exists()


def test_hidden_input_failure_never_falls_back_to_echo(helper, monkeypatch):
    def unavailable(_):
        import warnings

        warnings.warn("Cannot control echo", helper.getpass.GetPassWarning, stacklevel=2)

    monkeypatch.setattr(helper.getpass, "getpass", unavailable)
    with pytest.raises(ValueError, match="interactive terminal"):
        helper.main()
