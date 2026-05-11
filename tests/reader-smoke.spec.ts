import { expect, test } from "@playwright/test";
import JSZip from "jszip";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function createPdfFixture(text: string): string {
  const content = `BT /F1 24 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
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

async function createEpubFixture(filePath: string) {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
  );
  zip.file(
    "OPS/content.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">sanctuary-smoke</dc:identifier>
    <dc:title>Sanctuary EPUB Smoke</dc:title>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="chapter-1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="chapter-1"/>
  </spine>
</package>`,
  );
  zip.file(
    "OPS/nav.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <body>
    <nav epub:type="toc"><ol><li><a href="chapter1.xhtml">Start</a></li></ol></nav>
  </body>
</html>`,
  );
  zip.file(
    "OPS/chapter1.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>Start</title></head>
  <body><h1>Sanctuary EPUB Smoke</h1><p>Searchable fixture text.</p></body>
</html>`,
  );

  await writeFile(filePath, await zip.generateAsync({ type: "nodebuffer" }));
}

async function createFixtures(outputDir: string) {
  await mkdir(outputDir, { recursive: true });
  const pdfPath = path.join(outputDir, "sanctuary-smoke.pdf");
  const epubPath = path.join(outputDir, "sanctuary-smoke.epub");
  await writeFile(pdfPath, createPdfFixture("Sanctuary PDF Smoke"));
  await createEpubFixture(epubPath);
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

test.describe("reader smoke flows", () => {
  test("opens a generated PDF fixture", async ({ page }, testInfo) => {
    const { pdfPath } = await createFixtures(testInfo.outputPath("fixtures"));
    await resetBrowserStorage(page);

    await importDocument(page, pdfPath);

    await expect(page.getByRole("heading", { name: /sanctuary-smoke\.pdf/i })).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByText("Page 1 of 1")).toBeVisible();
  });

  test("opens a generated EPUB fixture", async ({ page }, testInfo) => {
    const { epubPath } = await createFixtures(testInfo.outputPath("fixtures"));
    await resetBrowserStorage(page);

    await importDocument(page, epubPath);

    await expect(page.getByRole("heading", { name: /sanctuary-smoke\.epub/i })).toBeVisible({
      timeout: 30000,
    });
    await expect(page.locator('iframe[title="Book content"]')).toBeAttached();
  });
});
