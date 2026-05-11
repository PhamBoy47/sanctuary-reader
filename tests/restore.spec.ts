import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function createMultiPagePdfFixture(text: string): string {
  const content1 = `BT /F1 24 Tf 72 720 Td (${text} Page 1) Tj ET`;
  const content2 = `BT /F1 24 Tf 72 720 Td (${text} Page 2) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content1.length} >>\nstream\n${content1}\nendstream`,
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 7 0 R >>",
    `<< /Length ${content2.length} >>\nstream\n${content2}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return pdf;
}

async function createFixtures(outputDir: string) {
  await mkdir(outputDir, { recursive: true });
  const pdfPath = path.join(outputDir, "restore-test.pdf");
  await writeFile(pdfPath, createMultiPagePdfFixture("Restore Test"));
  return { pdfPath };
}

async function resetBrowserStorage(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.evaluate(async () => {
    await Promise.all([
      new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase("sanctuary-reader");
        req.onsuccess = req.onerror = req.onblocked = () => resolve();
      }),
      new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase("sanctuary-annotations");
        req.onsuccess = req.onerror = req.onblocked = () => resolve();
      }),
    ]);
    localStorage.clear();
  });
  await page.reload();
}

async function importDocument(page: import("@playwright/test").Page, filePath: string) {
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /open doc/i }).first().click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(filePath);
}

test.describe("restore tests", () => {
  test("restores a recent document from the library", async ({ page }, testInfo) => {
    const { pdfPath } = await createFixtures(testInfo.outputPath("fixtures"));
    await resetBrowserStorage(page);

    await importDocument(page, pdfPath);
    await expect(page.getByRole("heading", { name: /restore-test\.pdf/i })).toBeVisible({ timeout: 30000 });

    // Go back to library by clicking the first button in the toolbar
    await page.locator('button').first().click();

    // Verify it is in the recent list
    await expect(page.getByText("Recent")).toBeVisible();
    await expect(page.getByText("restore-test.pdf")).toBeVisible();

    // Reload page to simulate closing and opening app
    await page.reload();

    // Click it to reopen
    await page.getByText("restore-test.pdf").click();

    // Verify it opened again
    await expect(page.getByRole("heading", { name: /restore-test\.pdf/i })).toBeVisible({ timeout: 30000 });
  });

  test("restores reading progress for PDF", async ({ page }, testInfo) => {
    const { pdfPath } = await createFixtures(testInfo.outputPath("fixtures"));
    await resetBrowserStorage(page);

    await importDocument(page, pdfPath);
    await expect(page.getByRole("heading", { name: /restore-test\.pdf/i })).toBeVisible({ timeout: 30000 });
    
    // Check initial page
    await expect(page.getByText("Page 1 of 2")).toBeVisible();

    // Change page to 2
    const pageInput = page.locator('input[title="Go to page (Enter)"]');
    await pageInput.click();
    await pageInput.fill('2');
    await pageInput.press('Enter');

    // Wait for the UI to update to page 2
    await expect(page.getByText("Page 2 of 2")).toBeVisible();

    // Wait for the state propagation and local storage update
    await page.waitForTimeout(500);

    // Go back to library
    await page.locator('button').first().click();

    // Verify progress is 100% in the library
    const progressText = await page.locator('.text-muted-foreground.text-right').first().textContent();
    console.log("Progress in library is:", progressText);
    await expect(page.locator('.text-muted-foreground.text-right').filter({ hasText: '100%' })).toBeVisible();

    // Reload page to simulate closing and reopening the app
    await page.reload();

    // Reopen the document
    await page.getByText("restore-test.pdf").click();
    await expect(page.getByRole("heading", { name: /restore-test\.pdf/i })).toBeVisible({ timeout: 30000 });

    // Verify progress is restored (it should be on page 2)
    await expect(page.getByText("Page 2 of 2")).toBeVisible();
  });
});
