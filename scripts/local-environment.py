"""Create development-only secrets in ignored project files without overwriting them."""

import secrets
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def create_environment() -> None:
    """Write one local .env and PostgreSQL password file; never print secret values."""
    environment = ROOT / ".env"
    password_file = ROOT / ".local" / "postgres-password.txt"
    if environment.exists():
        print("Existing .env retained; no credentials were changed.")
        return
    password = secrets.token_urlsafe(32)
    password_file.parent.mkdir(parents=True, exist_ok=True)
    password_file.write_text(password, encoding="utf-8")
    environment.write_text(
        f"DJANGO_SECRET_KEY={secrets.token_urlsafe(64)}\n"
        "DJANGO_DEBUG=true\nDJANGO_ALLOWED_HOSTS=localhost,127.0.0.1\n"
        f"DATABASE_URL=postgresql://choralation:{password}@127.0.0.1:55432/choralation\n"
        "TEST_DATABASE_NAME=test_choralation\n"
        "CSRF_TRUSTED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173\n"
        f"APP_TIME_ZONE=Asia/Beirut\nPOSTGRES_PASSWORD={password}\n",
        encoding="utf-8",
    )
    print("Private development settings created in the project's ignored .env.")


if __name__ == "__main__":
    create_environment()
