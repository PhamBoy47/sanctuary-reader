import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

function createPdfSearchFixture(text1: string, text2: string): string {
  const content1 = `BT /F1 24 Tf 72 720 Td (${text1}) Tj ET`;
  const content2 = `BT /F1 24 Tf 72 720 Td (${text2}) Tj ET`;
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

async function createEpubSearchFixture(): Promise<Buffer> {
  const zip = new JSZip();

  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  );

  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">search-test</dc:identifier>
    <dc:title>Search Test EPUB</dc:title>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ch1" href="ch1.html" media-type="application/xhtml+xml"/>
    <item id="ch2" href="ch2.html" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
    <itemref idref="ch2"/>
  </spine>
</package>`;
  zip.file("OEBPS/content.opf", opf);

  zip.file(
    "OEBPS/nav.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <body>
    <nav epub:type="toc"><ol><li><a href="ch1.html">Chapter 1</a></li></ol></nav>
  </body>
</html>`
  );

  zip.file(
    "OEBPS/ch1.html",
    `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chapter 1</title></head>
<body><h1>Chapter 1</h1><p>This is a unique keyword apple in chapter one.</p></body>
</html>`
  );

  zip.file(
    "OEBPS/ch2.html",
    `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chapter 2</title></head>
<body><h1>Chapter 2</h1><p>This is another unique keyword apple in chapter two.</p></body>
</html>`
  );

  return zip.generateAsync({ type: "nodebuffer" });
}

async function createFixtures(outputDir: string) {
  await mkdir(outputDir, { recursive: true });
  const pdfPath = path.join(outputDir, "search-test.pdf");
  await writeFile(pdfPath, createPdfSearchFixture("TargetKeywordOne", "TargetKeywordTwo"));

  const epubPath = path.join(outputDir, "search-test.epub");
  const epubData = await createEpubSearchFixture();
  await writeFile(epubPath, epubData);

  return { pdfPath, epubPath };
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

test.describe("search tests", () => {
  test("searches text across multiple pages in PDF", async ({ page }, testInfo) => {
    const { pdfPath } = await createFixtures(testInfo.outputPath("fixtures"));
    await resetBrowserStorage(page);
    page.on("console", msg => console.log(msg.text()));

    await importDocument(page, pdfPath);
    await expect(page.getByRole("heading", { name: /search-test\.pdf/i })).toBeVisible({ timeout: 30000 });

    // Open search bar using Ctrl+F
    await page.keyboard.press("Control+f");

    const searchInput = page.getByPlaceholder("Find in document…");
    await searchInput.fill("TargetKeyword");

    // Press enter to trigger search
    await searchInput.press("Enter");

    // There should be 2 results total
    await expect(page.getByText("1/2")).toBeVisible();

    // The current page should be 1
    await expect(page.getByText("Page 1 of 2")).toBeVisible();

    // Click next result
    await page.getByRole("button", { name: "Next match" }).click();

    // It should navigate to page 2
    await expect(page.getByText("Page 2 of 2")).toBeVisible();
    await expect(page.getByText("2/2")).toBeVisible();
  });

  test("searches text across chapters in EPUB", async ({ page }, testInfo) => {
    const { epubPath } = await createFixtures(testInfo.outputPath("fixtures"));
    await resetBrowserStorage(page);
    page.on("console", msg => console.log(msg.text()));

    await importDocument(page, epubPath);
    await expect(page.getByRole("heading", { name: /search-test\.epub/i })).toBeVisible({ timeout: 30000 });

    // Ensure we are on Chapter 1 initially
    await expect(page.getByText("1 / 2")).toBeVisible();

    // Open search bar using Ctrl+F
    await page.keyboard.press("Control+f");

    const searchInput = page.getByPlaceholder("Find in document…");
    await searchInput.fill("apple");

    // Press enter to trigger search
    await searchInput.press("Enter");

    // Wait for worker search to complete (there should be 2 results)
    await expect(page.getByText("1/2")).toBeVisible();

    // Click next result
    await page.getByRole("button", { name: "Next match" }).click();

    // It should navigate to chapter 2
    await expect(page.getByText("2 / 2")).toBeVisible();
    await expect(page.getByText("2/2")).toBeVisible();
  });
});
