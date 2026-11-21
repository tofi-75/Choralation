/** Fail CI if a mode/profile silently drops a required case or introduces a skip. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import type { FullResult, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';

type ContractCase = {
  file: string;
  successors: string[];
  simple: boolean;
  skip: 'email-mode' | 'desktop' | 'disabled-email-journey' | null;
};
type Result = {
  id: string;
  file: string;
  title: string;
  project: string;
  expectedStatus: string;
  status?: string;
  duration?: number;
  retry?: number;
  annotations: TestCase['annotations'];
};

export default class CoverageReporter implements Reporter {
  private results = new Map<string, Result>();

  onBegin(_config: unknown, suite: Suite) {
    for (const test of suite.allTests()) {
      this.results.set(test.id, {
        id: test.id,
        file: basename(test.location.file),
        title: test.title,
        project: test.parent.project()!.name,
        expectedStatus: test.expectedStatus,
        annotations: test.annotations,
      });
    }
  }

  onTestEnd(test: TestCase, result: TestResult) {
    Object.assign(this.results.get(test.id)!, {
      expectedStatus: test.expectedStatus,
      status: result.status,
      duration: result.duration,
      retry: result.retry,
      // Runtime test.skip() annotations only exist after the test has run.
      annotations: [...test.annotations],
    });
  }

  async onEnd(result: FullResult) {
    const mode = process.env.E2E_SIMPLE_ACCOUNTS === 'true' ? 'simple' : 'email';
    const cases = [...this.results.values()];
    const errors: string[] = [];
    if (process.env.E2E_ENFORCE_COVERAGE === 'true') {
      const project = process.env.E2E_PROJECT;
      const contract = JSON.parse(
        readFileSync(resolve('tests/contracts/browser-contract.json'), 'utf8'),
      ) as { profiles: string[]; cases: ContractCase[] };
      if (!project || !contract.profiles.includes(project))
        errors.push('Unknown required profile.');
      const required = contract.cases
        .filter((entry) => mode === 'email' || entry.simple)
        .flatMap((entry) => entry.successors.map((title) => ({ ...entry, title })));
      for (const entry of required) {
        const found = cases.filter(
          (test) =>
            test.project === project && test.file === entry.file && test.title === entry.title,
        );
        const skip =
          entry.skip === 'disabled-email-journey' ||
          (entry.skip === 'email-mode' && mode === 'email') ||
          (entry.skip === 'desktop' && project === 'desktop');
        if (found.length !== 1 || found[0].status !== (skip ? 'skipped' : 'passed')) {
          errors.push(
            `${entry.file}: ${entry.title}: expected one ${skip ? 'skipped' : 'passed'} case.`,
          );
        }
        if (
          skip &&
          !found[0]?.annotations.some(
            (annotation) => annotation.type === 'skip' && annotation.description,
          )
        ) {
          errors.push(`${entry.title}: missing recorded skip reason.`);
        }
      }
      if (
        cases.length !== required.length ||
        cases.some((test) => test.project !== project || test.retry !== 0)
      ) {
        errors.push('Unexpected cases, profiles, missing results or retries.');
      }
    }
    const folder = process.env.E2E_REPORT_DIR ?? resolve('test-results');
    mkdirSync(folder, { recursive: true });
    writeFileSync(
      resolve(folder, 'coverage.json'),
      JSON.stringify({ mode, status: result.status, errors, cases }, null, 2),
    );
    for (const error of errors) console.error(`[browser coverage] ${error}`);
    if (errors.length) return { status: 'failed' as const };
  }
}
