import { test } from '@playwright/test';
import { TEAM, expectAccessible, expectNoHorizontalScroll, signInAs, teamHome, unlockTeam } from './helpers';

const PUBLIC = ['/', '/search?q=Central', `/t/${TEAM.slug}`, '/for-teams', '/help', '/terms', '/privacy', '/guardian-consent', '/demo', '/report', '/sign-in', '/invite/demo-invite-athlete-owen'];

test.describe('accessibility', () => {
  for (const path of PUBLIC) {
    test(`public ${path}`, async ({ page }) => {
      await page.goto(path);
      await expectAccessible(page);
      await expectNoHorizontalScroll(page);
    });
  }

  test('unlocked roster and player page', async ({ page }) => {
    const players = await unlockTeam(page);
    await expectAccessible(page);
    await players.getByRole('link', { name: /Ethan D\./ }).click();
    await page.getByRole('heading', { name: 'Ethan D.', level: 1 }).waitFor();
    await expectAccessible(page);
    await expectNoHorizontalScroll(page);
    await page.getByRole('button', { name: 'Give to Helmet' }).click();
    await page.getByRole('dialog', { name: 'Give to this item' }).waitFor();
    await expectAccessible(page);
  });

  test('coach pages', async ({ page }) => {
    const home = await teamHome(page);
    for (const path of ['', '/roster', '/approvals', '/donations', '/purchases', '/templates', '/share', '/settings']) {
      await page.goto(`${home}${path}`);
      await expectAccessible(page);
      await expectNoHorizontalScroll(page);
    }
  });

  test('family, account and admin pages', async ({ page }) => {
    await signInAs(page, 'pat.smith@example.com', '/app');
    await expectAccessible(page);
    for (const path of ['/app/notifications', '/app/account']) {
      await page.goto(path);
      await expectAccessible(page);
      await expectNoHorizontalScroll(page);
    }
    await signInAs(page, 'admin@example.com', '/app/admin');
    await expectAccessible(page);
  });
});
