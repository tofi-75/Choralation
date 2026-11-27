"""Pair a database snapshot with exact stored PDF representations."""

import secrets
import time
from datetime import UTC, datetime
from pathlib import Path

from .core import OpsError, now, private_directory
from .database import export_database
from .storage import independent_stores


def snapshot_id():
    return datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ") + "-" + secrets.token_hex(8)


def create_snapshot(reader_url, source, repository, *, kind, commit, identifier=None):
    independent_stores(source, repository.store)
    if kind not in {"daily", "predeploy"}:
        raise OpsError("Invalid snapshot kind.")
    start = time.monotonic()
    with private_directory("backup-") as directory:
        dump = Path(directory) / "application.dump"
        inventory = export_database(reader_url, dump)
        manifest = {
            "format": 1,
            "id": identifier or snapshot_id(),
            "kind": kind,
            "created_at": inventory.get("captured_at", now()),
            "commit": commit,
            "inventory": inventory,
            "source_project": source.project,
            "source_bucket": source.bucket,
            "database": repository.payload(dump),
            "objects": [],
        }
        objects = source.objects()
        keys = {item["Key"] for item in objects}
        if not set(inventory["referenced_pdfs"]) <= keys:
            raise OpsError("A database-referenced PDF is missing; deployment is blocked.")
        for item in sorted(objects, key=lambda row: row["Key"]):
            if time.monotonic() - start > 900:
                raise OpsError("Backup exceeded the 15-minute snapshot window.")
            data, metadata = source.get(item["Key"])
            if item["Key"] in inventory["referenced_pdfs"] and not data:
                raise OpsError("A database-referenced PDF is empty; deployment is blocked.")
            if len(data) != item["Size"]:
                raise OpsError("Source object changed during backup; retry in a quiet window.")
            # Local filename is unrelated to the untrusted original object key.
            path = Path(directory) / "object.bin"
            path.write_bytes(data)
            manifest["objects"].append(
                {"key": item["Key"], **metadata, "payload": repository.payload(path)}
            )
        completion = repository.complete(manifest)
        return {
            "id": completion["id"],
            "kind": kind,
            "created_at": completion["created_at"],
            "objects": len(manifest["objects"]),
            "duration_seconds": round(time.monotonic() - start, 1),
            "storage_bytes": repository.used,
            "storage_warning": repository.used >= repository.budget * 0.8,
            "commit": commit,
        }
