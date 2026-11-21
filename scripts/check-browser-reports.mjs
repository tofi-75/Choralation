/** Require all eight mode/profile reports before publishing the merged HTML report. */
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const contract = JSON.parse(
  readFileSync(
    resolve(root, "frontend/tests/contracts/browser-contract.json"),
    "utf8",
  ),
);
const reports =
  process.env.E2E_REPORT_ROOT ?? resolve(root, ".cache/browser-reports");
const blobs =
  process.env.E2E_BLOB_ROOT ?? resolve(root, ".cache/browser-blobs");
mkdirSync(blobs, { recursive: true });
const errors = [];
for (const profile of contract.profiles) {
  for (const mode of ["email", "simple"]) {
    const label = `${profile}-${mode}`;
    const folder = resolve(reports, label);
    try {
      const report = JSON.parse(
        readFileSync(resolve(folder, "coverage.json"), "utf8"),
      );
      assert.equal(report.mode, mode, `${label}: incorrect mode`);
      assert.equal(report.status, "passed", `${label}: browser run failed`);
      assert.deepEqual(report.errors, [], `${label}: coverage failed`);
      assert(
        report.cases.length > 0 &&
          report.cases.every((test) => test.project === profile),
        `${label}: missing/wrong profile`,
      );
      const files = readdirSync(resolve(folder, "blob")).filter((name) =>
        name.endsWith(".zip"),
      );
      assert.equal(files.length, 1, `${label}: expected one blob report`);
      copyFileSync(
        resolve(folder, "blob", files[0]),
        resolve(blobs, `${label}.zip`),
      );
      console.log(`${label}: ${report.cases.length} required results verified`);
    } catch (error) {
      errors.push(`${label}: ${error.message}`);
    }
  }
}
for (const error of errors) console.error(error);
if (errors.length) process.exitCode = 1;
