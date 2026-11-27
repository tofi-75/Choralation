"""Owner credential setup checks use fictional passwords and no hosted access."""

from types import SimpleNamespace
from unittest.mock import MagicMock
from urllib.parse import parse_qs, unquote, urlsplit

import psycopg
import pytest
import setup_operations_database as setup

HOST = "aws-1-eu-central-1.pooler.supabase.com"
PROJECT = "abcdefghijklmnopqrst"


def test_url_encodes_password_and_uses_session_pooler_tls():
    password = "A secret:@/#?%+é"
    value = setup.connection_url(HOST, PROJECT, "postgres", "choralation_backup", password)
    parsed = urlsplit(value)
    assert unquote(parsed.password) == password
    assert parsed.username == f"choralation_backup.{PROJECT}"
    assert parsed.hostname == HOST and parsed.port == 5432
    assert parse_qs(parsed.query) == {"sslmode": ["require"]}


@pytest.mark.parametrize(
    "host,project",
    [
        ("evil.example.test", PROJECT),
        ("user:password@" + HOST, PROJECT),
        (HOST + ":6543", PROJECT),
        (HOST, "../different-project"),
    ],
)
def test_invalid_target_is_rejected(host, project):
    with pytest.raises(setup.SetupError):
        setup.validate_target(host, project, "postgres")


@pytest.mark.parametrize("role", [name for name, _ in setup.ROLES])
def test_checks_correct_role_readonly_permissions_without_private_rows(monkeypatch, role):
    connection = MagicMock()
    row = (
        "postgres",
        role,
        False,
        False,
        False,
        False,
        False,
        True,
        role == "choralation_backup",
        False,
        False,
        False,
    )
    connection.execute.return_value.fetchone.return_value = row
    connect = MagicMock()
    connect.return_value.__enter__.return_value = connection
    monkeypatch.setattr(setup.psycopg, "connect", connect)
    setup.verify_login("fictional-private-url", role, "postgres")
    assert any("LIMIT 0" in call.args[0] for call in connection.execute.call_args_list) == (
        role == "choralation_backup"
    )


@pytest.mark.parametrize(
    "index,value", [(0, "other_db"), (1, "postgres"), (2, True), (5, True), (9, True)]
)
def test_wrong_database_identity_or_excess_privileges_fail_closed(monkeypatch, index, value):
    row = [
        "postgres",
        "choralation_backup",
        False,
        False,
        False,
        False,
        False,
        True,
        True,
        False,
        False,
        False,
    ]
    row[index] = value
    connection = MagicMock()
    connection.execute.return_value.fetchone.return_value = tuple(row)
    connect = MagicMock()
    connect.return_value.__enter__.return_value = connection
    monkeypatch.setattr(setup.psycopg, "connect", connect)
    with pytest.raises(setup.SetupError, match="identity or permissions"):
        setup.verify_login("fictional-private-url", "choralation_backup", "postgres")


def test_connection_error_never_prints_credentials(monkeypatch):
    def fail(*args, **kwargs):
        raise psycopg.OperationalError("private password and connection URL")

    monkeypatch.setattr(setup.psycopg, "connect", fail)
    with pytest.raises(setup.SetupError) as error:
        setup.verify_login("fictional-private-url", "choralation_backup", "postgres")
    assert "private password" not in str(error.value)


def test_url_files_are_private_and_never_printed(monkeypatch, tmp_path, capsys):
    destination = tmp_path / "private-urls"
    monkeypatch.setattr(setup, "OUTPUT", destination)
    monkeypatch.setattr(setup.sys, "stdin", SimpleNamespace(isatty=lambda: True))
    monkeypatch.setattr(setup.getpass, "getpass", lambda _: "fictional-@-password")
    verified = []
    monkeypatch.setattr(setup, "verify_login", lambda url, role, db: verified.append(role))
    setup.prepare(HOST, PROJECT, "postgres")
    assert verified == [name for name, _ in setup.ROLES]
    for role, filename in setup.ROLES:
        value = (destination / filename).read_text().strip()
        assert unquote(urlsplit(value).password) == "fictional-@-password"
        assert urlsplit(value).username.startswith(role + ".")
    output = capsys.readouterr().out
    assert "fictional-@-password" not in output and "postgresql://" not in output
    with pytest.raises(setup.SetupError, match="existing files are preserved"):
        setup.prepare(HOST, PROJECT, "postgres")


def test_failed_login_writes_no_secret_files(monkeypatch, tmp_path):
    destination = tmp_path / "no-partial-urls"
    monkeypatch.setattr(setup, "OUTPUT", destination)
    monkeypatch.setattr(setup.sys, "stdin", SimpleNamespace(isatty=lambda: True))
    monkeypatch.setattr(setup.getpass, "getpass", lambda _: "fictional-password")

    def verify(url, role, database):
        if role == "choralation_operations":
            raise setup.SetupError("Failed login")

    monkeypatch.setattr(setup, "verify_login", verify)
    with pytest.raises(setup.SetupError, match="Failed login"):
        setup.prepare(HOST, PROJECT, "postgres")
    assert not destination.exists()


def test_redirected_output_directory_and_noninteractive_input_are_rejected(monkeypatch, tmp_path):
    monkeypatch.setattr(setup, "OUTPUT", setup.ROOT.parent / "outside-setup")
    with pytest.raises(setup.SetupError, match="inside this checkout"):
        setup.checked_output()
    monkeypatch.setattr(setup, "OUTPUT", tmp_path / "no-terminal")
    monkeypatch.setattr(setup.sys, "stdin", SimpleNamespace(isatty=lambda: False))
    with pytest.raises(setup.SetupError, match="interactive terminal"):
        setup.prepare(HOST, PROJECT, "postgres")
