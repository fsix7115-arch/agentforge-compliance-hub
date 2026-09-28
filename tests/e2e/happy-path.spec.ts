import { test, expect, type Page } from '@playwright/test';

/**
 * Helper: call an API from inside the page so the browser's auth cookie is
 * sent. Playwright's `request` fixture uses an isolated APIRequestContext that
 * does NOT share the page's cookie jar, so `request.get('/api/…')` would 401
 * even while the browser session is signed in.
 */
async function api(page: Page, method: string, path: string, body?: unknown) {
  return page.evaluate(
    async ({ method, path, body }) => {
      const res = await fetch(path, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined
      });
      const text = await res.text();
      let parsed: any = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
      return { status: res.status, data: parsed };
    },
    { method, path, body }
  );
}

/**
 * Happy path: sign in → dashboard → register an agent → log an action →
 * confirm the audit chain verifies → export the audit log.
 */
test('compliance happy path', async ({ page }) => {
  // 1. Sign in
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@acme.ai');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard');

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText('Total agents')).toBeVisible();

  // 2. Register an agent through the wizard
  await page.getByRole('link', { name: 'Register an agent' }).first().click();
  await page.waitForURL('**/agents/new');

  await page.getByLabel('Agent name').fill('E2E Compliance Agent');
  await page.getByLabel('What does it do?').fill('Created by the Playwright happy-path test.');
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByLabel('Model').fill('gpt-4o-mini');
  await page.getByRole('button', { name: 'Continue' }).click();

  // Attach the first policy if any exist, then move on
  const firstPolicyCheckbox = page.locator('li button[role="checkbox"]').first();
  if ((await firstPolicyCheckbox.count()) > 0) {
    await firstPolicyCheckbox.click();
  }
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Register agent' }).click();

  // Exclude the wizard's own /agents/new route, which also matches /agents/<id>.
  await page.waitForURL((url) => /\/agents\/[A-Za-z0-9]+$/.test(url.pathname) && url.pathname !== '/agents/new');
  const agentId = new URL(page.url()).pathname.split('/').filter(Boolean).pop()!;
  await expect(page.getByRole('heading', { name: 'E2E Compliance Agent' })).toBeVisible();

  // 3. Log an action through the API (this is what a real agent does)
  const logged = await api(page, 'POST', `/api/agents/${agentId}/actions`, {
    actionType: 'e2e_probe',
    input: { probe: true, note: 'no sensitive data' },
    output: { ok: true },
    status: 'SUCCESS',
    tokenCost: 0.001,
    model: 'gpt-4o-mini'
  });
  console.log('DEBUG logged=', JSON.stringify(logged).slice(0,500));
  expect(logged.status, 'action log should succeed').toBeLessThan(400);
  expect(logged.data.data.hash).toMatch(/^[0-9a-f]{64}$/);

  // 4. The chain must verify
  const verification = await api(page, 'GET', `/api/agents/${agentId}/audit/verify`);
  expect(verification.status).toBe(200);
  expect(verification.data.data.valid).toBe(true);
  expect(verification.data.data.breaks).toHaveLength(0);

  // 5. The action shows up in the audit log with an intact chain indicator
  await page.goto('/audit');
  await expect(page.getByText('chain(s) verified intact').first()).toBeVisible();
  await expect(page.getByText('e2e_probe').first()).toBeVisible();

  // 6. Audit export responds with a CSV attachment containing hash columns
  const exportResponse = await page.request.get('/api/audit/export?format=csv');
  expect(exportResponse.status()).toBe(200);
  const csv = await exportResponse.text();
  expect(csv).toContain('actionId');
  expect(csv).toContain('previousHash');
});

test('unauthenticated API access is rejected', async ({ page }) => {
  await page.context().clearCookies();
  await page.goto('/login');

  const response = await api(page, 'GET', '/api/agents');
  expect(response.status).toBe(401);
});

test('unauthenticated visitor is redirected to login', async ({ page }) => {
  await page.context().clearCookies();
  await page.goto('/dashboard');
  await page.waitForURL('**/login');
});
