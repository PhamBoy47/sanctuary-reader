import { test, expect } from '@playwright/test';

test('PDF Viewer E2E Test', async ({ page }) => {
  // Navigate to the app
  await page.goto('http://localhost:8080/');

  // Upload the user's specific PDF
  const testFilePath = "D:\\Documents\\PDF's\\CEH v10 Certified Ethical Hacker Study Guide by Ric Messier.pdf";
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Import/ }).first().click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(testFilePath);

  // Wait for the file card to appear
  const firstCard = page.locator('.group.relative.cursor-pointer').first();
  await expect(firstCard).toBeVisible({ timeout: 15000 });
  await firstCard.click();

  // Wait for the PDF viewer to load by checking for the canvas
  const canvas = page.locator('canvas.pdf-canvas').first();
  await expect(canvas).toBeVisible({ timeout: 30000 });

  // Verify page numbers are displayed (e.g. input with "1" and text "/ X")
  const pageInput = page.locator('div.font-mono input').first();
  const totalPagesText = page.locator('div.font-mono').first();
  await expect(pageInput).toBeVisible();
  
  const initialPage = await pageInput.inputValue();
  console.log(`Initial page: ${initialPage} ${await totalPagesText.textContent()}`);

  // Forward browser logs to CLI
  page.on('console', msg => console.log(`[BROWSER] ${msg.text()}`));

  // Give some time for initial renders and nav flags to clear
  await page.waitForTimeout(2000);

  // Test scroll-based page tracking
  const viewport = page.locator('.overflow-auto').filter({ has: page.locator('canvas.pdf-canvas') }).first();
  await expect(viewport).toBeVisible();
  
  console.log('Scrolling down with mouse wheel...');
  // Hover over the viewport first
  await viewport.hover();
  await page.mouse.wheel(0, 10000); 

  // Wait for page number to update
  await expect(async () => {
    const updatedPage = await pageInput.inputValue();
    const currentScroll = await viewport.evaluate(el => el.scrollTop);
    console.log(`Current page: ${updatedPage}, ScrollTop: ${currentScroll}`);
    expect(Number(updatedPage)).toBeGreaterThan(1);
  }).toPass({ timeout: 15000 });

  console.log('PDF Viewer scroll test passed!');
});
