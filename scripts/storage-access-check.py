"""Run one identity's attended R10 checks; credentials never cross environments."""

import argparse
import json
import sys
from pathlib import Path

from ops.access import (
    BACKUP_PROJECT,
    SUBJECTS,
    Probe,
    audit_source,
    check_identity,
    check_private_bucket,
)
from ops.core import OpsError, required
from ops.supabase import Store


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase", choices=["source", "writer", "reader", "pruner", "cleanup"])
    parser.add_argument("--probe-id", required=True)
    args = parser.parse_args()
    if args.phase == "source":
        sql = (Path(__file__).resolve().parent / "ops/inspect-storage-permissions.sql").read_text()
        result = audit_source(Store("SOURCE"), required("BACKUP_DATABASE_URL"), sql)
    else:
        store = Store("BACKUP", allow_delete=args.phase in {"pruner", "cleanup"})
        probe = Probe(store, args.probe_id, project=BACKUP_PROJECT)
        check_identity(store, SUBJECTS["pruner" if args.phase == "cleanup" else args.phase])
        check_private_bucket(store)
        getattr(probe, args.phase)()
        result = {"status": "passed", "phase": args.phase, "probe_id": args.probe_id}
    print(json.dumps(result))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(
            str(error)
            if isinstance(error, OpsError)
            else "Storage acceptance failed; private details suppressed.",
            file=sys.stderr,
        )
        sys.exit(1)
