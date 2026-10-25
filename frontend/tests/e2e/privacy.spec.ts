import { expect, test } from '@playwright/test';

test('Public information is readable without JavaScript, authentication, or account API', async ({
  browser,
}, info) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: info.project.use.viewport,
  });
  const page = await context.newPage();
  try {
    await page.route('**/api/**', (route) => route.fulfill({ status: 503, body: 'Unavailable' }));
    for (const path of ['/about', '/privacy', '/terms']) {
      const response = await page.goto(`http://127.0.0.1:5174${path}`);
      expect(response?.status()).toBe(200);
      await expect(page.locator('h1')).toBeVisible();
      await expect(
        page.getByText('Operated by Toufic Lattouf · Lebanon', { exact: true }),
      ).toBeVisible();
      await expect(
        page
          .getByRole('navigation', { name: 'Information' })
          .getByRole('link', { name: 'Privacy policy' }),
      ).toBeVisible();
      expect(await page.locator('script').count()).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.reload();
      await expect(page.locator('h1')).toBeVisible();
    }
    await page.goto('http://127.0.0.1:5174/about');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('main')).toBeFocused();
    await page.screenshot({ path: info.outputPath('public-about.png'), fullPage: true });
  } finally {
    await context.close();
  }
});

test('Sign-in and recovery offer real public policy links', async ({ page }) => {
  for (const path of ['/login', '/register', '/forgot-password']) {
    await page.goto(path);
    await page
      .getByRole('navigation', { name: 'Information' })
      .getByRole('link', { name: 'Privacy policy' })
      .click();
    await expect(page.getByRole('heading', { name: 'Privacy policy', exact: true })).toBeVisible();
    await expect(page.getByText('Limited Use', { exact: false })).toBeVisible();
  }
});
