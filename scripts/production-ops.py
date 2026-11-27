"""Production backup/release entry point. Secrets come only from the environment.

No command deploys by default. Automatic operations additionally require the
repository's PRODUCTION_AUTOMATION_ENABLED environment/repository variable.
"""

import argparse
import json
import os
import re
import sys

from ops.core import OpsError, required
from ops.database import Control
from ops.release import (
    GitHub,
    Render,
    check_idle_health,
    operational_check,
    overdue,
    readiness,
    recover,
    run_operation,
    validate_ci,
)
from ops.snapshot import create_snapshot
from ops.storage import Repository, Store, independent_stores, restore_identity


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "command",
        choices=[
            "backup",
            "deploy",
            "bootstrap-backup",
            "status",
            "verify",
            "recover",
            "restore-check",
            "prune",
            "freshness",
            "restore-export",
        ],
    )
    parser.add_argument("--sha", default="")
    parser.add_argument("--run-id", type=int)
    parser.add_argument("--operation-id")
    parser.add_argument("--schema-reviewed", action="store_true")
    parser.add_argument("--snapshot")
    parser.add_argument(
        "--output-dir",
        help="Explicit plaintext export into a new .local/backups directory; omitted means inventory only",
    )
    parser.add_argument(
        "--attended",
        action="store_true",
        help="Bootstrap restore only, before automation is enabled",
    )
    args = parser.parse_args()
    if args.command in {"deploy", "bootstrap-backup"} and not re.fullmatch(
        r"[a-f0-9]{40}", args.sha
    ):
        raise OpsError(
            "Supply the exact full source SHA; bootstrap uses the currently deployed commit."
        )
    if (
        args.command in {"deploy", "backup", "freshness", "restore-check", "prune"}
        and os.environ.get("PRODUCTION_AUTOMATION_ENABLED") != "true"
        and not (args.command == "restore-check" and args.attended)
    ):
        raise OpsError("Automation is disabled until attended backup and restore acceptance.")
    if args.command == "restore-export":
        from ops.restore import export_snapshot

        if not args.snapshot:
            raise OpsError("Restore export requires an explicit completed snapshot ID.")
        directory, identity = restore_identity()
        try:
            print(
                json.dumps(
                    export_snapshot(
                        Repository(Store("BACKUP"), identity=identity),
                        args.snapshot,
                        args.output_dir,
                    )
                )
            )
        finally:
            directory.cleanup()
        return
    if args.command == "restore-check" and args.attended:
        from ops.restore import checked_rehearsal

        directory, identity = restore_identity()
        control = Control(required("OPERATIONS_DATABASE_URL"))
        try:
            print(
                json.dumps(
                    checked_rehearsal(
                        control,
                        Repository(Store("BACKUP"), identity=identity),
                        args.snapshot,
                        attended=True,
                    )
                )
            )
        finally:
            directory.cleanup()
            control.close()
        return
    if args.command == "bootstrap-backup":
        source, destination = Store("SOURCE"), Store("BACKUP")
        independent_stores(source, destination)
        result = create_snapshot(
            required("BACKUP_DATABASE_URL"),
            source,
            Repository(destination, recipient=required("BACKUP_AGE_RECIPIENT")),
            kind="predeploy",
            commit=args.sha,
        )
        print(json.dumps(result))
        return
    control = Control(required("OPERATIONS_DATABASE_URL"))
    try:
        if args.command == "status":
            state = control.state()
            print(
                json.dumps(
                    {
                        key: state[key]
                        for key in (
                            "read_only",
                            "phase",
                            "operation_id",
                            "deployment_id",
                            "snapshot_id",
                            "last_backup",
                            "last_release",
                            "last_restore",
                        )
                    },
                    default=str,
                )
            )
            return
        if args.command == "recover":
            if not args.operation_id:
                raise OpsError("Recovery requires the recorded operation ID.")
            recover(
                control,
                Render(),
                required("PRODUCTION_URL"),
                args.operation_id,
                schema_reviewed=args.schema_reviewed,
            )
            print("Editing reopened after verified recovery.")
            return
        if args.command == "verify":
            with control.lock():
                state = control.state()
                if state["read_only"] or state["operation_id"]:
                    raise OpsError("Resolve the active operation before idle verification.")
                base = required("PRODUCTION_URL")
                ready = readiness(base, args.sha or None)
                operational_check(base, ready["commit"], state["database_id"], read_only=False)
                print("Runtime version, migrations, database/gate and existing PDF read verified.")
            return
        if args.command in {"prune", "restore-check"}:
            directory, identity = restore_identity()
            try:
                repository = Repository(
                    Store("BACKUP", allow_delete=args.command == "prune"), identity=identity
                )
                if args.command == "restore-check":
                    from ops.restore import checked_rehearsal

                    print(json.dumps(checked_rehearsal(control, repository, args.snapshot)))
                    return
                with control.lock():
                    state = control.state()
                    if state["operation_id"] or state["read_only"]:
                        raise OpsError(
                            "Resolve the active release before restore testing or pruning."
                        )
                    if args.command == "prune":
                        if not state["last_backup"]:
                            raise OpsError(
                                "No successful backup recorded; refusing retention deletion."
                            )
                        repository.prune(protected=[state["last_backup"]["id"]])
                        print("Retention checked successfully.")
            finally:
                directory.cleanup()
            return
        if args.command == "freshness" and not overdue(control.state()):
            check_idle_health(control.state())
            print("Verified backup is current; no editing pause needed.")
            return
        base = required("PRODUCTION_URL")
        ready = readiness(base)
        if not args.sha:
            args.sha = ready.get("commit", "")
        github = render = None
        if args.command == "deploy":
            github, render = GitHub(), Render()
            if not args.sha or not args.run_id:
                raise OpsError("Deployment requires an exact SHA and successful CI run ID.")
            if os.environ.get("GITHUB_EVENT_NAME") == "workflow_run":
                with open(required("GITHUB_EVENT_PATH"), encoding="utf-8") as stream:
                    validate_ci(json.load(stream), github.repository, args.sha)
        source, destination = Store("SOURCE"), Store("BACKUP")
        independent_stores(source, destination)
        result = run_operation(
            control,
            required("BACKUP_DATABASE_URL"),
            source,
            Repository(destination, recipient=required("BACKUP_AGE_RECIPIENT")),
            deploy=args.command == "deploy",
            sha=args.sha,
            github=github,
            render=render,
            base=base,
            run_id=args.run_id,
        )
        print(json.dumps(result))
        if result.get("id") and os.environ.get("GITHUB_OUTPUT"):
            with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as stream:
                stream.write("snapshot_created=true\n")
    finally:
        control.close()


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # Suppress raw database URLs, S3 response bodies, SQL/private data and keys.
        error = sys.exception()
        print(
            str(error)
            if isinstance(error, OpsError)
            else "Operation failed safely; inspect sanitized status and the recovery guide.",
            file=sys.stderr,
        )
        sys.exit(1)
