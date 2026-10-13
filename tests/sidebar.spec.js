const { test, expect } = require('@playwright/test');

test.describe('Sidebar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000/login');
    await page.fill('input[name="email"]', 'admin@test.com');
    await page.fill('input[name="password"]', 'password');
    await page.click('button[type="submit"]');
    await page.waitForURL('http://localhost:3000/admin/dashboard');
  });

  test('should toggle sidebar visibility', async ({ page }) => {
    // Check if the sidebar is initially expanded
    await expect(page.locator('aside')).toHaveClass(/w-64/);
    await expect(page.locator('text=Dashboard')).toBeVisible();

    // Click the minimize button
    await page.getByRole('button', { name: '«' }).click();
    await page.waitForTimeout(500);

    // Check if the sidebar is minimized
    await expect(page.locator('aside')).toHaveClass(/w-20/);
    await expect(page.locator('text=Dashboard')).not.toBeVisible();
    await page.screenshot({ path: 'jules-scratch/verification/sidebar_minimized.png' });

    // Click the expand button
    await page.getByRole('button', { name: '»' }).click();
    await page.waitForTimeout(500);

    // Check if the sidebar is expanded again
    await expect(page.locator('aside')).toHaveClass(/w-64/);
    await expect(page.locator('text=Dashboard')).toBeVisible();
    await page.screenshot({ path: 'jules-scratch/verification/sidebar_expanded.png' });
  });

  test('should navigate to dashboard', async ({ page }) => {
    // Click the dashboard link
    await page.getByRole('link', { name: '🏠 Dashboard' }).click();

    // Check if the URL is correct
    await expect(page).toHaveURL('http://localhost:3000/admin/dashboard');
    await page.screenshot({ path: 'jules-scratch/verification/dashboard.png' });
  });
});
