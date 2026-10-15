import { test, expect } from '@playwright/test';
import { signInAs } from './helpers';

test('admin pages load for an admin', async ({ page }) => {
  await signInAs(page, 'admin@example.com', '/app/admin');
  for (const path of ['', '/verification', '/teams', '/donations', '/moderation', '/catalog', '/outbox']) {
    const res = await page.goto(`/app/admin${path}`);
    expect(res?.status(), path || '/').toBeLessThan(400);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
});

test('admin pages are closed to everyone else', async ({ page }) => {
  await signInAs(page, 'coach.alex@example.com', '/app/admin');
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(/Admin|Overview/);
});
