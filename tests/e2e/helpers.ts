import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

export const TEAM = { slug: 'central-high-football', name: 'Central High Varsity Football', code: 'KX7P2Q' };

/** One-tap demo sign-in (demo mode only), landing on `next`. */
export async function signInAs(page: Page, email: string, next = '/app') {
  await page.goto('/demo');
  await page.evaluate(
    async ({ email, next }) => {
      const body = new FormData();
      body.set('email', email);
      body.set('next', next);
      await fetch('/api/auth/demo', { method: 'POST', body, redirect: 'manual' });
    },
    { email, next },
  );
  await page.goto(next);
}

export async function unlockTeam(page: Page) {
  await page.goto(`/t/${TEAM.slug}`);
  const players = page.getByRole('region', { name: /^Players/ });
  await players.getByRole('textbox', { name: 'Team code' }).fill(TEAM.code);
  await players.getByRole('button', { name: 'Unlock' }).click();
  await expect(players.getByText('Unlocked on this device')).toBeVisible();
  return players;
}

/** The manager home of the demo team, found from the coach's app chooser redirect. */
export async function teamHome(page: Page) {
  await signInAs(page, 'coach.alex@example.com', '/app');
  await page.waitForURL(/\/app\/manager\/[0-9a-f-]{36}/);
  return page.url().match(/(\/app\/manager\/[0-9a-f-]{36})/)![1];
}

/** WCAG 2.2 AA checks. Serious and critical violations fail the test. */
export async function expectAccessible(page: Page) {
  // @axe-core/playwright is typed against its own playwright-core copy; the page is the same object.
  const results = await new AxeBuilder({ page } as unknown as ConstructorParameters<typeof AxeBuilder>[0]).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(bad.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')})`)).toEqual([]);
}

/** Nothing wider than the viewport (spec: no horizontal scroll at 390px). */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}
