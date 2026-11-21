/** Exercise the coverage gate itself, including failures that must block the aggregate. */
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";
import { test } from "node:test";
import CoverageReporter from "../../frontend/tests/contracts/reporter.ts";

const root = resolve(import.meta.dirname, "../..");
const contract = JSON.parse(
  readFileSync(
    resolve(root, "frontend/tests/contracts/browser-contract.json"),
    "utf8",
  ),
);

function check(mutate = () => {}, mode = "email", profile = "desktop") {
  const cache = resolve(root, ".cache");
  mkdirSync(cache, { recursive: true });
  const folder = mkdtempSync(resolve(cache, "coverage-gate-"));
  const before = { ...process.env };
  const cwd = process.cwd();
  const originalError = console.error;
  return (async () => {
    try {
      process.chdir(resolve(root, "frontend"));
      Object.assign(process.env, {
        E2E_REPORT_DIR: folder,
        E2E_ENFORCE_COVERAGE: "true",
        E2E_PROJECT: profile,
        E2E_SIMPLE_ACCOUNTS: String(mode === "simple"),
      });
      console.error = () => {};
      const cases = contract.cases
        .filter((entry) => mode === "email" || entry.simple)
        .flatMap((entry) =>
          entry.successors.map((title) => {
            const skipped =
              entry.skip === "disabled-email-journey" ||
              (entry.skip === "email-mode" && mode === "email") ||
              (entry.skip === "desktop" && profile === "desktop");
            return {
              id: `${entry.file}:${title}`,
              title,
              location: { file: entry.file },
              parent: { project: () => ({ name: profile }) },
              expectedStatus: skipped ? "skipped" : "passed",
              annotations: skipped
                ? [{ type: "skip", description: entry.skip }]
                : [],
              result: {
                status: skipped ? "skipped" : "passed",
                duration: 1,
                retry: 0,
              },
            };
          }),
        );
      mutate(cases);
      const reporter = new CoverageReporter();
      reporter.onBegin({}, { allTests: () => cases });
      for (const item of cases) reporter.onTestEnd(item, item.result);
      const result = await reporter.onEnd({ status: "passed" });
      const saved = JSON.parse(
        readFileSync(resolve(folder, "coverage.json"), "utf8"),
      );
      return { result, saved };
    } finally {
      console.error = originalError;
      process.chdir(cwd);
      process.env = before;
      rmSync(folder, { recursive: true });
    }
  })();
}

test("accepts every required mode/profile and records runtime skip reasons", async () => {
  for (const profile of contract.profiles)
    for (const mode of ["email", "simple"]) {
      const { result, saved } = await check(undefined, mode, profile);
      assert.equal(result, undefined);
      assert.deepEqual(saved.errors, []);
      assert(
        saved.cases.some(
          (entry) =>
            entry.status === "skipped" && entry.annotations[0].description,
        ),
      );
    }
});
test("missing required case fails the gate", async () => {
  assert.equal((await check((cases) => cases.pop())).result.status, "failed");
});
test("new runtime skip fails the gate", async () => {
  assert.equal(
    (
      await check((cases) => {
        cases.find((item) => item.result.status === "passed").result.status =
          "skipped";
      })
    ).result.status,
    "failed",
  );
});
test("retry fails even if the case eventually passes", async () => {
  assert.equal(
    (
      await check((cases) => {
        cases[0].result.retry = 1;
      })
    ).result.status,
    "failed",
  );
});
test("a wrong-profile result fails the gate", async () => {
  assert.equal(
    (
      await check((cases) => {
        cases[0].parent.project = () => ({ name: "unknown" });
      })
    ).result.status,
    "failed",
  );
});
test("skips without reasons fail the gate", async () => {
  assert.equal(
    (
      await check((cases) => {
        cases.find((item) => item.result.status === "skipped").annotations = [];
      })
    ).result.status,
    "failed",
  );
});

test("aggregate requires all eight successful profile/mode reports", () => {
  const folder = mkdtempSync(resolve(root, ".cache/coverage-aggregate-"));
  const run = () =>
    spawnSync(
      process.execPath,
      [resolve(root, "scripts/check-browser-reports.mjs")],
      {
        env: {
          ...process.env,
          E2E_REPORT_ROOT: folder,
          E2E_BLOB_ROOT: resolve(folder, "merged"),
        },
        encoding: "utf8",
      },
    );
  const target = resolve(folder, "mobile-430-simple/coverage.json");
  const data = (profile) => ({
    mode: "simple",
    status: "passed",
    errors: [],
    cases: [{ project: profile }],
  });
  try {
    for (const profile of contract.profiles)
      for (const mode of ["email", "simple"]) {
        const dir = resolve(folder, `${profile}-${mode}`);
        mkdirSync(resolve(dir, "blob"), { recursive: true });
        writeFileSync(
          resolve(dir, "coverage.json"),
          JSON.stringify({ ...data(profile), mode }),
        );
        writeFileSync(
          resolve(dir, "blob/report.zip"),
          "coverage-gate fixture; merge uses real reports",
        );
      }
    assert.equal(run().status, 0);
    writeFileSync(
      target,
      JSON.stringify({ ...data("mobile-430"), status: "failed" }),
    );
    assert.equal(run().status, 1, "one failed profile must fail the aggregate");
    rmSync(target);
    assert.equal(run().status, 1, "one absent profile must fail the aggregate");
  } finally {
    rmSync(folder, { recursive: true });
  }
});
