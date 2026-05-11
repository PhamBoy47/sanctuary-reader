import { describe, expect, it } from "vitest";
import { detectFileType, formatFileSize } from "./fileStore";

describe("fileStore utilities", () => {
  it("detects supported document types by extension", () => {
    expect(detectFileType("guide.PDF")).toBe("pdf");
    expect(detectFileType("novel.epub")).toBe("epub");
    expect(detectFileType("notes.txt")).toBeNull();
  });

  it("formats byte counts for library display", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(2 * 1024 * 1024)).toBe("2.0 MB");
  });
});
