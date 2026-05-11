import { describe, expect, it, vi } from "vitest";
import type { Bookmark, Highlight } from "./annotationStore";
import { exportToCsv, exportToMarkdown } from "./exportAnnotations";

const bookmarks: Bookmark[] = [
  {
    id: "bookmark-1",
    fileId: "file-1",
    page: 3,
    label: "Important page",
    createdAt: Date.UTC(2026, 0, 2),
  },
];

const highlights: Highlight[] = [
  {
    id: "highlight-1",
    fileId: "file-1",
    page: 4,
    color: "rgb(255,235,59)",
    text: 'Quoted "highlight" text',
    rects: [{ x: 0.1, y: 0.2, w: 0.3, h: 0.04 }],
    createdAt: Date.UTC(2026, 0, 3),
  },
];

vi.mock("./annotationStore", () => ({
  getBookmarks: vi.fn(async () => bookmarks),
  getHighlights: vi.fn(async () => highlights),
}));

describe("annotation export", () => {
  it("exports bookmarks and highlights as Markdown", async () => {
    const markdown = await exportToMarkdown("file-1", "sample.pdf");

    expect(markdown).toContain('# Annotations for "sample.pdf"');
    expect(markdown).toContain("**1** bookmarks");
    expect(markdown).toContain("**1** highlights");
    expect(markdown).toContain("Important page");
    expect(markdown).toContain('> Quoted "highlight" text');
  });

  it("exports bookmarks and highlights as escaped CSV", async () => {
    const csv = await exportToCsv("file-1", "sample.pdf");

    expect(csv).toContain("Type,Page,Text,Color,Label,CreatedAt");
    expect(csv).toContain('Bookmark,3,"","","Important page"');
    expect(csv).toContain('Highlight,4,"Quoted ""highlight"" text","rgb(255,235,59)",""');
  });
});
