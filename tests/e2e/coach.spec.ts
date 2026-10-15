import { test, expect } from '@playwright/test';
import { teamHome, signInAs, expectNoHorizontalScroll } from './helpers';

test.describe('coach', () => {
  test('overview shows totals and what needs action', async ({ page }) => {
    await teamHome(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('Available to spend')).toBeVisible();
    await expect(page.getByText('Raised', { exact: true }).first()).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('roster filters by search and shows each athlete', async ({ page }) => {
    const home = await teamHome(page);
    await page.goto(`${home}/roster`);
    await expect(page.getByRole('heading', { name: 'Roster', level: 1 })).toBeVisible();
    const search = page.getByRole('searchbox').first();
    await search.fill('Jayden');
    // Desktop shows a table and phones show cards; check whichever is on screen.
    await expect(page.getByText(/Jayden/).locator('visible=true').first()).toBeVisible();
    await expect(page.getByText(/Ethan/).locator('visible=true')).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  });

  test('approvals queue shows the pending profile change side by side', async ({ page }) => {
    const home = await teamHome(page);
    await page.goto(`${home}/approvals`);
    await expect(page.getByRole('heading', { name: 'Approvals', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: /Mason Brown Edits to a live page/ }).click();
    await expect(page.getByText('Live now').first()).toBeVisible();
    await expect(page.getByText('After approval').first()).toBeVisible();
    // The diff marks the words Mason added to his bio.
    await expect(page.locator('ins').first()).toBeVisible();
  });

  test('every manager page loads without an error', async ({ page }) => {
    const home = await teamHome(page);
    for (const path of ['', '/roster', '/roster/import', '/approvals', '/donations', '/purchases', '/payouts', '/templates', '/share', '/settings']) {
      const res = await page.goto(`${home}${path}`);
      expect(res?.status(), path || '/').toBeLessThan(400);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByText(/Something went wrong|Application error/)).toHaveCount(0);
    }
  });
});

test('a new coach picks up team setup where they left off', async ({ page }) => {
  await signInAs(page, 'coach.riley@example.com', '/app/manager/new');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText('Hillcrest Varsity Football').first()).toBeVisible();
  await expectNoHorizontalScroll(page);
});
