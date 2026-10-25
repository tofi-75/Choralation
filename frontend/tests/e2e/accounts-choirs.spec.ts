/** Real account verification, approval, tenant isolation and choir-scoped counts. */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const suffix = process.env.E2E_USER_SUFFIX;
const password = process.env.E2E_PASSWORD;
if (!suffix || !password) throw new Error('Use the isolated browser launcher.');
function emailToken(email: string, purpose: string) {
  const folder = resolve(process.env.EMAIL_FILE_PATH ?? '../.cache/e2e-emails');
  const messages = readdirSync(folder)
    .map((file) => readFileSync(resolve(folder, file), 'utf8'))
    .filter((text) => text.includes(`To: ${email}`) && text.includes(purpose));
  const token = messages.at(-1)?.match(/#token=([^\s]+)/)?.[1];
  if (!token) throw new Error('The expected local test email was not captured.');
  return token;
}
async function headers(page: Page, choir?: number, revision?: number) {
  const csrf = (await (await page.request.get('/api/v1/auth/csrf/')).json()).csrf_token;
  return {
    'X-CSRFToken': csrf,
    ...(choir ? { 'X-Choir-ID': String(choir) } : {}),
    ...(revision ? { 'X-Expected-Mass-Revision': String(revision) } : {}),
  };
}
test('self-service verification, private approval, scoped counts, rotation and recovery', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(150000);
  const username = `e2e-${suffix}-signup-${info.project.name}`;
  const email = `${username}@example.test`;
  await page.goto('/register');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password!);
  await page.getByLabel('Confirm password', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Verify your email', exact: true })).toBeVisible();
  expect((await page.request.get('/api/v1/hymns/')).status()).toBe(403);
  const token = emailToken(email, 'Verify your Choralation email');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();
  await page.goto(`/verify-email#token=${token}`);
  await expect(page.getByRole('heading', { name: 'Masses', exact: true })).toBeVisible();
  await expect((await page.request.get('/api/v1/auth/me/')).json()).resolves.toMatchObject({
    username,
    email_verified: true,
  });
  await expect(page.getByText('Choose your choir', { exact: true })).toBeVisible();

  const plannerContext = await browser.newContext({
    viewport: info.project.use.viewport,
    baseURL: 'http://127.0.0.1:5174',
  });
  const planner = await plannerContext.newPage();
  try {
    await planner.goto('/login');
    await planner.getByLabel('Email or username').fill(`e2e-${suffix}-planner`);
    await planner.getByLabel('Password', { exact: true }).fill(password!);
    await planner.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(planner.getByRole('heading', { name: 'Masses', exact: true })).toBeVisible();
    await planner.goto('/choirs/new');
    const choirName = `e2e-${suffix}-private-${info.project.name}`;
    await planner.getByRole('textbox', { name: /Choir name/ }).fill(choirName);
    await planner.getByLabel('Show member count to people outside this choir').uncheck();
    await planner.getByRole('button', { name: 'Create choir', exact: true }).click();
    await expect(planner.getByRole('heading', { name: choirName, exact: true })).toBeVisible();
    const choirA = Number(planner.url().split('/').at(-1));
    const oldCode = (await planner.locator('.choir-code').innerText()).trim();
    expect(oldCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    await page.goto('/choirs/join');
    await expect(page.getByRole('heading', { name: choirName, exact: true })).toHaveCount(0);
    await page.getByLabel('Choir code', { exact: true }).fill(oldCode);
    await page.getByRole('button', { name: 'Find choir', exact: true }).click();
    const card = page.locator('.choir-card').filter({ hasText: choirName });
    await expect(card).toBeVisible();
    await expect(card).not.toContainText('members');
    await card.getByRole('button', { name: 'Request to join' }).click();
    await expect(card.getByRole('button', { name: 'Request pending' })).toBeDisabled();
    expect((await page.request.get(`/api/v1/choirs/${choirA}/`)).status()).toBe(404);
    await planner.reload();
    await planner.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(planner.getByText('Member approved.', { exact: true })).toBeVisible();
    await page.goto('/choirs');

    await expect(page.getByLabel('Active choir')).toHaveValue(String(choirA));

    const second = await planner.request.post('/api/v1/choirs/', {
      headers: await headers(planner),
      data: { name: `e2e-${suffix}-public-${info.project.name}`, is_public: true },
    });
    expect(second.status()).toBe(201);
    const choirB = (await second.json()).id;
    const language = (await (await planner.request.get('/api/v1/languages/')).json())[0].id;
    const placement = (await (await planner.request.get('/api/v1/mass-placements/')).json())[0].id;
    const hymnResult = await planner.request.post('/api/v1/hymns/', {
      headers: await headers(planner),
      data: {
        title: `Shared count ${suffix}-${info.project.name}`,
        language_id: language,
        placement_ids: [placement],
        is_season_neutral: true,
      },
    });
    expect(hymnResult.status()).toBe(201);
    const hymn = (await hymnResult.json()).id;
    let secretB = 0;
    for (const [choir, total] of [
      [choirA, 2],
      [choirB, 1],
    ]) {
      const created = await planner.request.post('/api/v1/masses/', {
        headers: await headers(planner, choir),
        data: { date: '2026-10-25', title: `Choir-only ${choir}` },
      });
      expect(created.status()).toBe(201);
      const mass = await created.json();
      if (choir === choirB) secretB = mass.id;
      const program = await planner.request.put(`/api/v1/masses/${mass.id}/program/`, {
        headers: await headers(planner, choir, 1),
        data: {
          selections: Array.from({ length: total }, (_, position) => ({
            hymn_id: hymn,
            placement_id: placement,
            position,
          })),
        },
      });
      expect(program.status()).toBe(200);
      expect(
        (
          await planner.request.post(`/api/v1/masses/${mass.id}/finalize/`, {
            headers: await headers(planner, choir, 2),
            data: {},
          })
        ).status(),
      ).toBe(200);
    }
    await planner.reload();
    await planner.getByLabel('Active choir').selectOption(String(choirA));
    await planner.goto(`/hymns/${hymn}`);
    await expect(planner.locator('.usage-summary')).toContainText('2 finalized selections');
    await planner.getByLabel('Active choir').selectOption(String(choirB));
    await planner.goto(`/hymns/${hymn}`);
    await expect(planner.locator('.usage-summary')).toContainText('1 finalized selection');
    await page.goto(`/hymns/${hymn}`);
    await expect(page.locator('.usage-summary')).toContainText('2 finalized selections');
    expect((await page.request.get(`/api/v1/masses/${secretB}/`)).status()).toBe(404);

    await planner.goto(`/choirs/${choirA}`);
    await planner.getByRole('button', { name: 'Generate new code' }).click();
    await expect(planner.getByRole('dialog')).toContainText('current code will stop working');
    await planner.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(planner.locator('.choir-code')).toHaveText(oldCode);
    await planner.getByRole('button', { name: 'Generate new code' }).click();
    await planner.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(planner.locator('.choir-code')).not.toHaveText(oldCode);
    expect(
      (
        await page.request.post('/api/v1/choirs/lookup-code/', {
          headers: await headers(page),
          data: { code: oldCode },
        })
      ).status(),
    ).toBe(404);
    await page.goto(`/choirs/${choirA}`);
    await expect(page.getByRole('heading', { name: choirName, exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Members', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Join code', exact: true })).toHaveCount(0);
    await page.screenshot({
      path: `test-results/${info.project.name}-choir-members.png`,
      fullPage: true,
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );

    await page.goto('/forgot-password');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('status')).toContainText('reset link has been sent');
    const reset = emailToken(email, 'Reset your Choralation password');
    await page.goto(`/reset-password#token=${reset}`);
    const next = password + 'New';
    await page.getByLabel('New password', { exact: true }).fill(next);
    await page.getByLabel('Confirm new password', { exact: true }).fill(next);
    await page.getByRole('button', { name: 'Update password' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('status')).toContainText('Password updated');
    await page.getByLabel('Email or username').fill(email.toUpperCase());
    await page.getByLabel('Password', { exact: true }).fill(next);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Masses', exact: true })).toBeVisible();
  } finally {
    await plannerContext.close();
  }
});
