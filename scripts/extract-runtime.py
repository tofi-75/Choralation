"""Extract portable archives only into the current project's .local directory.

Path traversal and links escaping the runtime area are rejected. PostgreSQL extraction intentionally
omits pgAdmin/StackBuilder: this project needs bin/lib/share, not an installer.
"""

import argparse
import tarfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def extract(archive: Path, target: Path, postgres: bool) -> None:
    """Validate all destinations before extracting trusted, checksum-checked data."""
    archive, target = archive.resolve(), target.resolve()
    if not archive.is_relative_to(ROOT) or not target.is_relative_to(ROOT / ".local"):
        raise ValueError("Archive and output must remain inside this project's local runtime area.")
    target.mkdir(parents=True, exist_ok=True)
    if not postgres:
        with tarfile.open(archive) as package:
            package.extractall(target, filter="data")
        return
    with zipfile.ZipFile(archive) as package:
        for item in package.infolist():
            if item.is_dir() or not item.filename.startswith(
                ("pgsql/bin/", "pgsql/lib/", "pgsql/share/")
            ):
                continue
            destination = (target / item.filename.removeprefix("pgsql/")).resolve()
            if not destination.is_relative_to(target):
                raise ValueError("Archive entry escapes its runtime destination.")
            destination.parent.mkdir(parents=True, exist_ok=True)
            with package.open(item) as source, destination.open("wb") as output:
                output.write(source.read())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("target", type=Path)
    parser.add_argument("--postgres", action="store_true")
    args = parser.parse_args()
    extract(args.archive, args.target, args.postgres)
