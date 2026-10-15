import { test, expect } from '@playwright/test';
import { TEAM, unlockTeam, expectNoHorizontalScroll } from './helpers';

test.describe('finding a team', () => {
  test('search finds teams by name only, never players', async ({ page }) => {
    await page.goto('/search?q=Central');
    await expect(page.getByRole('link', { name: new RegExp(TEAM.name) }).first()).toBeVisible();
    // A player's name is not searchable (privacy model).
    await page.goto('/search?q=Ethan');
    await expect(page.getByRole('link', { name: /Ethan/ })).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  });

  test('the roster stays locked until the team code is entered', async ({ page }) => {
    await page.goto(`/t/${TEAM.slug}`);
    await expect(page.getByRole('heading', { name: TEAM.name, level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Enter the team code to see players' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Ethan D\./ })).toHaveCount(0);

    const players = page.getByRole('region', { name: /^Players/ });
    await players.getByRole('textbox', { name: 'Team code' }).fill('WRONG1');
    await players.getByRole('button', { name: 'Unlock' }).click();
    await expect(players.getByText(/doesn't match|not right|isn't right|check the code|try again/i)).toBeVisible();

    await players.getByRole('textbox', { name: 'Team code' }).fill(TEAM.code);
    await players.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByRole('link', { name: /Ethan D\./ })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('a player page without the code does not show the player', async ({ page }) => {
    await page.goto(`/t/${TEAM.slug}/ethan-d-3`);
    await expect(page.getByRole('heading', { name: 'Ethan D.', level: 1 })).toHaveCount(0);
  });
});

test.describe('giving', () => {
  test('a donor gives to one item and gets a receipt', async ({ page }) => {
    const players = await unlockTeam(page);
    await players.getByRole('link', { name: /Ethan D\./ }).click();
    await expect(page.getByRole('heading', { name: 'Ethan D.', level: 1 })).toBeVisible();

    await page.getByRole('button', { name: 'Give to Helmet' }).click();
    const dialog = page.getByRole('dialog', { name: 'Give to this item' });
    await dialog.getByRole('radio', { name: '$25' }).check();
    await dialog.getByRole('textbox', { name: /^Email/ }).fill('e2e.donor@example.com');
    await dialog.getByRole('textbox', { name: /^Name/ }).fill('Casey Rivera');
    // $25 gift, fees covered: $1 + 1% platform fee plus card fees on top.
    await expect(dialog.getByRole('button', { name: /^Pay \$27\.\d\d$/ })).toBeVisible();
    await dialog.getByRole('button', { name: /^Pay/ }).click();

    await page.waitForURL(/\/give\/success\//);
    await expect(page.getByRole('heading', { name: /Thank you/, level: 1 })).toBeVisible();
    await expect(page.getByText("$25.00 toward Ethan D.'s Helmet")).toBeVisible();
    await page.getByRole('link', { name: 'View receipt' }).click();
    await page.waitForURL(/\/receipt\//);
    await expect(page.getByText('$25.00').first()).toBeVisible();
    // Default receipt copy makes no tax-deductibility claim.
    await expect(page.getByText(/is tax[- ]deductible/i)).toHaveCount(0);
  });

  test('a declined card shows an error and charges nothing', async ({ page }) => {
    const players = await unlockTeam(page);
    await players.getByRole('link', { name: /Ethan D\./ }).click();
    await page.getByRole('button', { name: 'Give to Cleats' }).click();
    const dialog = page.getByRole('dialog', { name: 'Give to this item' });
    await dialog.getByRole('textbox', { name: /^Email/ }).fill('declined.donor@example.com');
    await dialog.getByRole('textbox', { name: /^Name/ }).fill('Sam Declined');
    await dialog.getByRole('textbox', { name: 'Card number' }).fill('4000 0000 0000 0002');
    await dialog.getByRole('button', { name: /^Pay/ }).click();
    await expect(dialog.getByText(/declined/i).first()).toBeVisible();
    await expect(page).not.toHaveURL(/\/give\/success\//);
  });
});

test('public pages fit a 375px phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  for (const path of ['/', '/search?q=Central', `/t/${TEAM.slug}`, '/for-teams', '/sign-in', '/demo']) {
    await page.goto(path);
    await expectNoHorizontalScroll(page);
  }
  // The home hero clips its overflow, so check that its search controls are on screen.
  await page.goto('/');
  const button = await page.getByRole('main').getByRole('button', { name: 'Search', exact: true }).boundingBox();
  expect(button!.x + button!.width).toBeLessThanOrEqual(375);
});
