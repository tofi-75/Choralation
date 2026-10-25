import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
const suffix = process.env.E2E_USER_SUFFIX;
const password = process.env.E2E_PASSWORD;
if (!suffix || !password) throw new Error('Use the isolated browser launcher.');
async function login(page: Page, role: string) {
  await page.goto('/login');
  await page.getByLabel('Email or username').fill(`e2e-${suffix}-${role}`);
  await page.getByLabel('Password', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Masses', exact: true })).toBeVisible();
}
async function headers(page: Page) {
  return {
    'X-CSRFToken': (await (await page.request.get('/api/v1/auth/csrf/')).json())
      .csrf_token as string,
  };
}
test('Admins approve and decline private choir requests directly on Choirs without membership', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(90000);
  const ownerContext = await browser.newContext({ baseURL: 'http://127.0.0.1:5174' });
  const memberContext = await browser.newContext({ baseURL: 'http://127.0.0.1:5174' });
  try {
    const owner = await ownerContext.newPage();
    const applicant = await memberContext.newPage();
    await login(owner, 'planner');
    await login(applicant, 'viewer');
    const choirs: { id: number; name: string }[] = [];
    for (const name of ['Approve', 'Decline']) {
      const created = await owner.request.post('/api/v1/choirs/', {
        headers: await headers(owner),
        data: { name: `Inbox ${name} ${suffix}-${info.project.name}`, is_public: false },
      });
      expect(created.status()).toBe(201);
      const choir = await created.json();
      choirs.push(choir);
      const detail = await (await owner.request.get(`/api/v1/choirs/${choir.id}/`)).json();
      expect(
        (
          await applicant.request.post('/api/v1/choirs/requests/', {
            headers: await headers(applicant),
            data: { choir_id: choir.id, code: detail.code },
          })
        ).status(),
      ).toBe(201);
    }
    expect(
      (await (await applicant.request.get('/api/v1/choirs/pending-requests/')).json()).count,
    ).toBe(0);
    await login(page, 'admin');
    if (!(await page.getByRole('link', { name: 'Choirs', exact: true }).isVisible()))
      await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByRole('link', { name: 'Choirs', exact: true }).click();
    const inbox = page.getByRole('region', { name: 'Join requests (2)', exact: true });
    await expect(inbox).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath('admin-choir-requests.png'), fullPage: true });
    await inbox
      .getByRole('button', {
        name: `Approve e2e-${suffix}-viewer for ${choirs[0].name}`,
        exact: true,
      })
      .click();
    await expect(page.getByText('Member approved.', { exact: true })).toBeVisible();
    await page
      .getByRole('button', {
        name: `Decline e2e-${suffix}-viewer for ${choirs[1].name}`,
        exact: true,
      })
      .click();
    await expect(page.getByText('No pending join requests.', { exact: true })).toBeVisible();
    const memberChoirs = await (await applicant.request.get('/api/v1/choirs/')).json();
    expect(memberChoirs.some((choir: { id: number }) => choir.id === choirs[0].id)).toBe(true);
    expect(memberChoirs.some((choir: { id: number }) => choir.id === choirs[1].id)).toBe(false);
    const card = page
      .locator('.choir-card')
      .filter({ has: page.getByRole('heading', { name: choirs[0].name, exact: true }) });
    await card.getByRole('link', { name: 'Manage choir', exact: true }).click();
    await expect(page.getByRole('heading', { name: choirs[0].name, exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Join requests', exact: true })).toBeVisible();
  } finally {
    await ownerContext.close();
    await memberContext.close();
  }
});
