import { test, expect } from '@playwright/test';

// Uses the seeded invite for Owen Jackson's guardian, which can be accepted once.
// Runs against fresh demo data (the default webServer starts from a clean database).
test.describe.configure({ mode: 'serial' });

test('a guardian signs in from the invite and gives consent', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'the invite can be accepted once per run');
  await page.goto('/invite/demo-invite-guardian-owen');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('added Owen');
  // Nothing about Owen is public yet.
  await expect(page.getByText(/Nothing about Owen is shown until a parent or guardian gives consent/)).toBeVisible();

  await page.getByRole('link', { name: "I'm Owen's parent or guardian" }).click();
  await page.getByRole('textbox', { name: 'Email' }).fill('owen.jackson.parent@example.com');
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await expect(page.getByRole('status')).toContainText('We sent a link and a 6-digit code');

  // Demo mode keeps email in the outbox; the newest sign-in code is first.
  const outbox = await (await page.request.get('/dev/outbox')).text();
  const code = outbox.match(/enter this code: (\d{6})/)?.[1];
  expect(code, 'sign-in code in the outbox').toBeTruthy();
  await page.getByRole('textbox', { name: 'Code' }).fill(code!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: 'Continue to consent' }).click();

  await expect(page.getByRole('heading', { name: "Consent for Owen's page", level: 1 })).toBeVisible();
  await expect(page.getByRole('region', { name: '2. What is never shown' })).toContainText('Home address or hometown');
  // Signing needs both the checkbox and a typed name.
  await page.getByRole('button', { name: 'Give consent' }).click();
  await expect(page).toHaveURL(/\/consent/);
  await page.getByRole('checkbox', { name: "I am Owen's parent or legal guardian" }).check();
  await page.getByRole('textbox', { name: /Type your full name to sign/ }).fill('Morgan Jackson');
  await page.getByRole('button', { name: 'Give consent' }).click();
  // Consent done: the guardian goes straight to setting up the page.
  await expect(page.getByRole('heading', { name: "Set up Owen's page", level: 1 })).toBeVisible();
});
