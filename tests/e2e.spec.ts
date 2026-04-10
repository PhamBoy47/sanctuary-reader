import { test, expect } from '@playwright/test';
import path from 'path';

const PDF_PATH = 'C:\\Users\\phani\\.gemini\\antigravity\\brain\\fd1240ac-b6c3-414e-bf72-39547dbbb85a\\sample.pdf';
const EPUB_PATH = 'C:\\Users\\phani\\.gemini\\antigravity\\brain\\fd1240ac-b6c3-414e-bf72-39547dbbb85a\\sample.epub';

test.describe('Sanctuary Reader E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080/');
  });

  test('should import and view a PDF file', async ({ page }) => {
    // Import PDF
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /Import/i }).first().click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(PDF_PATH);

    // Wait for the file card to appear and click it
    const fileCard = page.locator('text=sample.pdf');
    await expect(fileCard).toBeVisible({ timeout: 10000 });
    await fileCard.click();

    // Verify PDF viewer is loaded
    const canvas = page.locator('.pdf-canvas').first();
    await expect(canvas).toBeVisible({ timeout: 20000 });

    // Zoom in
    await page.getByRole('button', { name: /Zoom In/i }).click();
    
    // Go back to library
    await page.getByRole('button', { name: /Back/i }).click();
    await expect(page.getByText('Sanctuary Reader')).toBeVisible();
  });

  test('should import and view an EPUB file', async ({ page }) => {
    // Import EPUB
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /Import/i }).first().click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(EPUB_PATH);

    // Wait for file card
    const fileCard = page.locator('text=sample.epub');
    await expect(fileCard).toBeVisible({ timeout: 10000 });
    await fileCard.click();

    // Verify EPUB viewer is loaded
    await expect(page.locator('text=Loading book…')).not.toBeVisible({ timeout: 20000 });

    // Check if some text is rendered in iframe
    const iframe = page.frameLocator('iframe');
    await expect(iframe.locator('body')).not.toBeEmpty();

    // Test theme change - using the first theme button (usually Original or Light)
    await page.locator('button[title="Sepia"]').click();
    
    // Go back to library
    await page.getByRole('button', { name: /Back/i }).click();
    await expect(page.getByText('Sanctuary Reader')).toBeVisible();
  });
});
