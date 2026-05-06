/**
 * Local annotation export utilities.
 * Exports bookmarks and highlights for a specific file to Markdown or CSV format.
 */
import { getBookmarks, getHighlights, type Bookmark, type Highlight } from "./annotationStore";

/**
 * Export annotations as a Markdown string.
 */
export async function exportToMarkdown(fileId: string, fileName: string): Promise<string> {
  const [bookmarks, highlights] = await Promise.all([
    getBookmarks(fileId),
    getHighlights(fileId),
  ]);

  const lines: string[] = [];
  lines.push(`# Annotations for "${fileName}"`);
  lines.push("");
  lines.push(`> Exported on ${new Date().toLocaleString()}`);
  lines.push("");

  // Summary
  lines.push(`**${bookmarks.length}** bookmarks · **${highlights.length}** highlights`);
  lines.push("");

  // Bookmarks
  if (bookmarks.length > 0) {
    lines.push("---");
    lines.push("");
    lines.push("## 🔖 Bookmarks");
    lines.push("");
    for (const bm of bookmarks) {
      const date = new Date(bm.createdAt).toLocaleDateString();
      lines.push(`- **Page ${bm.page}** — ${bm.label} _(${date})_`);
    }
    lines.push("");
  }

  // Highlights
  if (highlights.length > 0) {
    lines.push("---");
    lines.push("");
    lines.push("## 🖍️ Highlights");
    lines.push("");
    for (const hl of highlights) {
      const date = new Date(hl.createdAt).toLocaleDateString();
      const colorName = getColorName(hl.color);
      lines.push(`### Page ${hl.page} — ${colorName} highlight`);
      lines.push("");
      lines.push(`> ${hl.text}`);
      lines.push("");
      lines.push(`_Created: ${date}_`);
      lines.push("");
    }
  }

  if (bookmarks.length === 0 && highlights.length === 0) {
    lines.push("_No annotations found for this document._");
  }

  return lines.join("\n");
}

/**
 * Export annotations as a CSV string.
 */
export async function exportToCsv(fileId: string, fileName: string): Promise<string> {
  const [bookmarks, highlights] = await Promise.all([
    getBookmarks(fileId),
    getHighlights(fileId),
  ]);

  const rows: string[] = [];
  rows.push("Type,Page,Text,Color,Label,CreatedAt");

  for (const bm of bookmarks) {
    rows.push(csvRow("Bookmark", bm.page, "", "", bm.label, bm.createdAt));
  }

  for (const hl of highlights) {
    rows.push(csvRow("Highlight", hl.page, hl.text, hl.color, "", hl.createdAt));
  }

  return rows.join("\n");
}

/**
 * Trigger a browser download of a text blob.
 */
export function downloadBlob(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function csvRow(type: string, page: number, text: string, color: string, label: string, createdAt: number): string {
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const date = new Date(createdAt).toISOString();
  return [type, page, escape(text), escape(color), escape(label), date].join(",");
}

function getColorName(color: string): string {
  const map: Record<string, string> = {
    "rgb(255,235,59)": "Yellow",
    "rgb(239,83,80)": "Red",
    "rgb(102,187,106)": "Green",
    "rgb(66,165,245)": "Blue",
    "rgb(255,167,38)": "Orange",
    "rgb(171,71,188)": "Purple",
    "rgb(240,98,146)": "Pink",
    "rgb(38,198,218)": "Cyan",
  };
  return map[color] || color;
}
