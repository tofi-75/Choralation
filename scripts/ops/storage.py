"""Encrypted backup payloads over RLS-scoped Supabase Storage REST access."""

import json
import os
import re
from datetime import UTC, datetime, timedelta
from pathlib import Path

from .core import OpsError, digest, file_digest, private_directory, process, required
from .supabase import Store as Store

CHUNK_SIZE = 32 * 1024 * 1024


class Repository:
    def __init__(self, store, recipient=None, identity=None, budget=None):
        self.store, self.recipient, self.identity = store, recipient, identity
        self.budget = budget or int(os.environ.get("BACKUP_BUDGET_BYTES") or "858993459")
        self.used = sum(item["Size"] for item in store.objects())

    def put_verified(self, key, data):
        if self.used + len(data) > self.budget:
            raise OpsError("Backup storage budget exceeded; retention was not reduced.")
        checksum = digest(data)
        self.store.put(key, data, {"cipher-sha256": checksum})
        stored, _ = self.store.get(key)
        if digest(stored) != checksum:
            raise OpsError("Backup upload verification failed.")
        self.used += len(data)
        return {"key": key, "sha256": checksum, "bytes": len(data)}

    def encrypt(self, data):
        if not self.recipient:
            raise OpsError("Encryption recipient is required.")
        return process(
            [os.environ.get("AGE", "age"), "--encrypt", "--recipient", self.recipient], stdin=data
        )

    def decrypt(self, data):
        if not self.identity:
            raise OpsError("Restore identity is required.")
        return process(
            [os.environ.get("AGE", "age"), "--decrypt", "--identity", str(self.identity)],
            stdin=data,
        )

    def payload(self, path):
        checksum = file_digest(path)
        parts = []
        with Path(path).open("rb") as stream:
            index = 0
            while data := stream.read(CHUNK_SIZE):
                key = f"payloads/{checksum}/part-{index:06d}.age"
                existing = self.store.head(key)
                if existing:
                    encrypted, details = self.store.get(key)
                    expected = details["metadata"].get("cipher-sha256")
                    if not expected or digest(encrypted) != expected:
                        raise OpsError("Existing backup payload failed integrity verification.")
                    part = {"key": key, "sha256": expected, "bytes": len(encrypted)}
                else:
                    part = self.put_verified(key, self.encrypt(data))
                parts.append(part)
                index += 1
        return {"sha256": checksum, "bytes": Path(path).stat().st_size, "parts": parts}

    def restore_payload(self, record, destination):
        with Path(destination).open("wb") as stream:
            for part in record["parts"]:
                encrypted, _ = self.store.get(part["key"])
                if digest(encrypted) != part["sha256"]:
                    raise OpsError("Encrypted backup chunk is corrupt.")
                stream.write(self.decrypt(encrypted))
        if (
            Path(destination).stat().st_size != record["bytes"]
            or file_digest(destination) != record["sha256"]
        ):
            raise OpsError("Restored payload failed integrity verification.")

    def complete(self, manifest):
        snapshot = manifest["id"]
        manifest_record = self.put_verified(
            f"snapshots/{snapshot}/manifest.age",
            self.encrypt(json.dumps(manifest, ensure_ascii=False).encode()),
        )
        completion = {
            "id": snapshot,
            "kind": manifest["kind"],
            "created_at": manifest["created_at"],
            "manifest": manifest_record,
        }
        self.put_verified(f"snapshots/{snapshot}/complete.json", json.dumps(completion).encode())
        return completion

    def snapshots(self):
        result = []
        for item in self.store.objects("snapshots/"):
            if item["Key"].endswith("/complete.json"):
                data, _ = self.store.get(item["Key"])
                record = json.loads(data)
                if (
                    item["Key"] != f"snapshots/{record['id']}/complete.json"
                    or record["kind"] not in {"daily", "predeploy"}
                    or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,119}", record["id"])
                    or record["manifest"]["key"] != f"snapshots/{record['id']}/manifest.age"
                    or not re.fullmatch(r"[a-f0-9]{64}", record["manifest"]["sha256"])
                ):
                    raise OpsError("Invalid snapshot completion record.")
                if datetime.fromisoformat(record["created_at"]).tzinfo is None:
                    raise OpsError("Snapshot timestamps must include a timezone.")
                result.append(record)
        return sorted(result, key=lambda record: record["created_at"], reverse=True)

    def manifest(self, completion):
        record = completion["manifest"]
        data, _ = self.store.get(record["key"])
        if digest(data) != record["sha256"]:
            raise OpsError("Backup manifest is corrupt.")
        manifest = json.loads(self.decrypt(data))
        if (
            manifest["id"] != completion["id"]
            or manifest["format"] != 1
            or manifest["kind"] != completion["kind"]
            or manifest["created_at"] != completion["created_at"]
        ):
            raise OpsError("Backup manifest does not match its completion marker.")
        return manifest

    def prune(self, *, protected=()):
        snapshots = self.snapshots()
        retained = set(protected)
        if not retained <= {item["id"] for item in snapshots}:
            raise OpsError("A protected backup is missing; refusing retention deletion.")
        for kind, count in (("daily", 7), ("predeploy", 5)):
            retained.update(
                item["id"] for item in [item for item in snapshots if item["kind"] == kind][:count]
            )
        # Read every retained manifest before deleting anything. Missing/corrupt data aborts pruning.
        referenced = set()
        for item in snapshots:
            if item["id"] in retained:
                manifest = self.manifest(item)
                for payload in [
                    manifest["database"],
                    *[row["payload"] for row in manifest["objects"]],
                ]:
                    referenced.update(part["key"] for part in payload["parts"])
        cutoff = datetime.now(UTC) - timedelta(hours=48)
        for item in snapshots:
            if item["id"] not in retained:
                self.store.delete(f"snapshots/{item['id']}/complete.json")
                self.store.delete(item["manifest"]["key"])
        for item in self.store.objects("payloads/"):
            if item["Key"] not in referenced and item["LastModified"] < cutoff:
                self.store.delete(item["Key"])
        complete_ids = {item["id"] for item in snapshots}
        for item in self.store.objects("snapshots/"):
            components = item["Key"].split("/")
            if (
                len(components) == 3
                and components[2] == "manifest.age"
                and components[1] not in complete_ids
                and item["LastModified"] < cutoff
            ):
                self.store.delete(item["Key"])


def independent_stores(source, destination):
    if source.project == destination.project:
        raise OpsError("Backup destination must be a separate Supabase project.")


def restore_identity():
    """Use only in the private ignored temporary cache; never retain or track the key."""
    key = required("BACKUP_AGE_IDENTITY")
    directory = private_directory("identity-")
    path = Path(directory.name) / "identity.txt"
    path.write_text(key + "\n", encoding="utf-8")
    path.chmod(0o600)
    return directory, path
