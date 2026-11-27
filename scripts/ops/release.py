"""Exact-commit deployment. Once a request may have reached Render, fail closed."""

import re
import time
from datetime import UTC, datetime, timedelta

from .core import OpsError, http_json, https_url, now, required
from .database import connect
from .snapshot import create_snapshot, snapshot_id

TERMINAL = {"live", "build_failed", "update_failed", "pre_deploy_failed", "canceled", "deactivated"}


def validate_ci(event, repository, sha):
    run = event.get("workflow_run", {})
    if (
        run.get("conclusion") != "success"
        or run.get("event") != "push"
        or run.get("head_branch") != "main"
        or run.get("head_sha") != sha
        or run.get("repository", {}).get("full_name") != repository
        or run.get("head_repository", {}).get("full_name") != repository
        or run.get("name") != "Application checks"
    ):
        raise OpsError("Only successful same-repository main-push CI can release production.")


class GitHub:
    def __init__(self):
        self.repository = required("GITHUB_REPOSITORY")
        if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", self.repository):
            raise OpsError("Invalid repository.")
        self.token = required("GH_TOKEN")

    def get(self, path):
        return http_json(f"https://api.github.com/repos/{self.repository}/{path}", token=self.token)

    def latest(self):
        return self.get("commits/main")["sha"]

    def checks(self, sha, run_id):
        jobs = []
        page = 1
        while True:
            batch = self.get(f"actions/runs/{run_id}/jobs?per_page=100&page={page}")
            jobs.extend(batch["jobs"])
            if len(jobs) >= batch["total_count"]:
                break
            page += 1
        names = {job["name"] for job in jobs}
        required_jobs = {
            "backend",
            "frontend",
            "production",
            "browser-report",
            "checks",
            "operations",
        }
        required_jobs.update(
            f"browser ({profile})" for profile in ("desktop", "mobile", "mobile-360", "mobile-430")
        )
        if not required_jobs <= names:
            raise OpsError("Required CI jobs are missing.")
        if not all(
            job.get("conclusion") == "success" and job.get("head_sha") == sha for job in jobs
        ):
            raise OpsError("Every CI job must succeed for the exact release commit.")
        run = self.get(f"actions/runs/{run_id}")
        validate_ci({"workflow_run": run}, self.repository, sha)


class Render:
    def __init__(self):
        self.token = required("RENDER_API_KEY")
        self.service_id = required("RENDER_SERVICE_ID")
        self.workspace_id = required("RENDER_WORKSPACE_ID")
        if not re.fullmatch(r"srv-[a-z0-9]+", self.service_id):
            raise OpsError("Invalid Render service ID.")

    def get(self, path):
        return http_json("https://api.render.com/v1/" + path, token=self.token)

    def preflight(self):
        service = self.get(f"services/{self.service_id}")
        if (
            service.get("ownerId") != self.workspace_id
            or service.get("autoDeployTrigger") != "off"
            or service.get("branch") != "main"
            or service.get("serviceDetails", {}).get("healthCheckPath") != "/health/ready/"
        ):
            raise OpsError(
                "Render workspace, branch, native auto-deploy, or readiness configuration does not match the runbook."
            )
        recent = self.get(f"services/{self.service_id}/deploys?limit=20")
        if any(row["deploy"]["status"] not in TERMINAL for row in recent):
            raise OpsError("A Render deployment is already active.")

    def trigger(self, sha):
        return http_json(
            f"https://api.render.com/v1/services/{self.service_id}/deploys",
            token=self.token,
            method="POST",
            body={"commitId": sha, "clearCache": "do_not_clear"},
        )

    def deployment(self, identifier):
        if not re.fullmatch(r"dep-[a-z0-9]+", identifier):
            raise OpsError("Invalid deployment ID.")
        return self.get(f"services/{self.service_id}/deploys/{identifier}")

    def wait(self, identifier, sha, timeout=1800):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            record = self.deployment(identifier)
            if record.get("commit", {}).get("id") != sha:
                raise OpsError("Render deployment commit differs from the tested commit.")
            if record["status"] in TERMINAL:
                return record["status"]
            time.sleep(15)
        raise OpsError("Render deployment timed out; editing stays paused pending reconciliation.")


def readiness(base, expected=None, *, require_operations=True):
    # Free Render sleeps when idle. Retry safe reads through its cold start.
    endpoint = https_url(base) + "/health/ready/"
    deadline = time.monotonic() + 120
    while True:
        try:
            record = http_json(endpoint, timeout=10)
        except OpsError:
            record = {}
        if record.get("status") == "ok" and (not expected or record.get("commit") == expected):
            if require_operations and not record.get("operations_enabled"):
                raise OpsError(
                    "Production write protection is not enabled; attended bootstrap required."
                )
            return record
        if time.monotonic() >= deadline:
            raise OpsError("Production readiness or deployed commit verification failed.")
        time.sleep(5)


def operational_check(base, sha, database_id, *, read_only):
    """Verify the runtime's dependencies without creating or signing in an app user."""
    base = https_url(base)
    token = required("DEPLOY_CHECK_TOKEN")
    if not re.fullmatch(r"[A-Za-z0-9_-]{43,128}", token):
        raise OpsError("DEPLOY_CHECK_TOKEN must be a strong URL-safe token.")
    record = http_json(
        base + "/health/operations/",
        token=token,
        headers={"X-Operations-Database-ID": str(database_id)},
        timeout=45,
    )
    if (
        not isinstance(record, dict)
        or record.get("status") != "ok"
        or record.get("commit") != sha
        or record.get("operations_enabled") is not True
        or record.get("read_only") is not read_only
    ):
        raise OpsError("Production operational verification failed; editing remains protected.")
    return record


def run_operation(
    control,
    reader_url,
    source,
    repository,
    *,
    deploy=False,
    sha="",
    github=None,
    render=None,
    base=None,
    run_id=None,
):
    """Known pre-deploy failures reopen writes; ambiguous post-request failures do not."""
    identifier = snapshot_id()
    with control.lock():
        with connect(reader_url) as reader:
            identity = reader.execute(
                "SELECT database_id FROM public.common_operationsstate WHERE id=1"
            ).fetchone()
        if not identity or identity[0] != control.state()["database_id"]:
            raise OpsError("Backup reader and maintenance control must address the same database.")
        previous_sha = readiness(base).get("commit")
        if not re.fullmatch(r"[a-f0-9]{40}", previous_sha or ""):
            raise OpsError("Production must report its full source commit before a snapshot.")
        if deploy:
            if restore_overdue(control.state()):
                raise OpsError(
                    "A successful restore rehearsal within eight days is required before deployment."
                )
            github.checks(sha, run_id)
            if github.latest() != sha:
                return {"skipped": "superseded"}
            render.preflight()
            if previous_sha == sha:
                return {"skipped": "already_live"}
            # Validate token, schema, source DB identity, gate and actual PDF read
            # before pausing anyone or requesting a deployment.
            operational_check(base, previous_sha, control.state()["database_id"], read_only=False)
        requested = False
        try:
            control.begin(
                identifier, "Installing an update" if deploy else "Taking a verified backup", sha
            )
            control.update(snapshot_id=identifier)
            result = create_snapshot(
                reader_url,
                source,
                repository,
                kind="predeploy" if deploy else "daily",
                commit=previous_sha,
                identifier=identifier,
            )
            control.update(last_backup=result, phase="snapshot_complete")
            if not deploy:
                control.finish()
                return result
            if github.latest() != sha:
                control.finish(phase="superseded")
                return {**result, "skipped": "superseded"}
            # Persist intent BEFORE the HTTP request: timeout cannot cause an unsafe retry/unlock.
            control.update(phase="deploy_requested")
            requested = True
            record = render.trigger(sha)
            control.update(deployment_id=record["id"], phase="deploying")
            status = render.wait(record["id"], sha)
            if status == "build_failed":
                readiness(base, previous_sha)
                control.update(
                    last_release={
                        "commit": sha,
                        "status": status,
                        "created_at": now(),
                        "deployment_id": record["id"],
                    }
                )
                control.finish(phase="build_failed")
                raise OpsError(
                    "Render build failed before startup; previous service remains available."
                )
            if status != "live":
                raise OpsError(
                    "Deployment did not become live; inspect migrations before reopening editing."
                )
            control.update(phase="verifying")
            readiness(base, sha)
            operational_check(base, sha, control.state()["database_id"], read_only=True)
            control.update(
                last_release={
                    "commit": sha,
                    "status": "live",
                    "created_at": now(),
                    "deployment_id": record["id"],
                    "snapshot_id": identifier,
                }
            )
            control.finish()
            return result
        except BaseException:
            if control.owner and not requested:
                control.finish(phase="backup_failed")
            raise


def recover(control, render, base, identifier, *, schema_reviewed=False):
    with control.lock():
        state = control.state()
        if not state["read_only"] or state["operation_id"] != identifier:
            raise OpsError("Recovery operation ID does not own the active maintenance window.")
        # Even if trigger timed out before returning an ID, preflight rejects active deploys.
        render.preflight()
        ready = readiness(base)
        if state["phase"] in {"deploy_requested", "deploying", "verifying"}:
            if not schema_reviewed:
                raise OpsError(
                    "Release may have migrated the database; explicitly review schema before recovery."
                )
            if state["deployment_id"]:
                record = render.deployment(state["deployment_id"])
                if record["status"] not in TERMINAL:
                    raise OpsError("Deployment is still active.")
        control.owner = identifier
        control.update(
            last_release={"status": "recovered", "commit": ready.get("commit"), "created_at": now()}
        )
        control.finish(phase="recovered")


def overdue(state):
    stamp = state["last_backup"].get("created_at")
    return not stamp or datetime.now(UTC) - datetime.fromisoformat(stamp) > timedelta(hours=24)


def restore_overdue(state):
    restore = state.get("last_restore", {})
    stamp = restore.get("created_at")
    return (
        restore.get("status") != "passed"
        or not stamp
        or datetime.now(UTC) - datetime.fromisoformat(stamp) > timedelta(days=8)
    )


def check_idle_health(state):
    if state["read_only"] or state["operation_id"]:
        raise OpsError("Production maintenance is unresolved; inspect the recorded operation.")
    if restore_overdue(state):
        raise OpsError("Restore rehearsal is failed, missing, interrupted, or overdue.")
