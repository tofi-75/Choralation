import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/** Legacy scenarios run explicitly in their fixture workspace, never a global tenant. */
export async function initialChoirId(page: Page): Promise<string> {
  const response = await page.request.get('/api/v1/choirs/');
  if (response.status() !== 200)
    throw new Error('Sign in before requesting fixture choir context.');
  const rows = (await response.json()) as { id: number; name: string }[];
  const choir = rows.find((c) => c.name === 'Initial choir');
  if (!choir) throw new Error('Initial choir fixture is missing.');
  return String(choir.id);
}

export async function selectInitialChoir(page: Page) {
  const id = await initialChoirId(page);
  const selector = page.getByLabel('Active choir');
  await expect(selector).toBeVisible();
  if ((await selector.inputValue()) !== id) {
    await selector.selectOption(id);
    await expect(page.getByRole('heading', { name: 'Masses', exact: true })).toBeVisible();
  }
}
