/**
 * Minimal PDF Link Service for Sanctuary Reader.
 * Maps PDF internal destinations (GoTo) to our internal navigateToPage calls.
 */
import * as pdfjsLib from "pdfjs-dist";

type PdfDestination = string | unknown[];
type PdfPageRef = Parameters<pdfjsLib.PDFDocumentProxy["getPageIndex"]>[0];

export function createPdfLinkService(
  doc: pdfjsLib.PDFDocumentProxy,
  navigateToPage: (page: number) => void,
  totalPages: number
) {
  return {
    externalLinkTarget: null,
    externalLinkRel: "noopener noreferrer nofollow",
    externalLinkEnabled: true,

    get destination() { return null; },
    set destination(_) { },

    async goToDestination(dest: PdfDestination | null | undefined) {
      if (!dest) return;
      let pageNum: number | null = null;
      
      if (typeof dest === "string") {
        const resolved = await doc.getDestination(dest);
        if (resolved && resolved.length > 0) {
          const target = resolved[0];
          if (typeof target === "number") pageNum = target + 1;
          else if (target && typeof target === "object") {
            pageNum = (await doc.getPageIndex(target as PdfPageRef)) + 1;
          }
        }
      } else if (Array.isArray(dest) && dest.length > 0) {
        const target = dest[0];
        if (typeof target === "number") pageNum = target + 1;
        else if (target && typeof target === "object") {
          pageNum = (await doc.getPageIndex(target as PdfPageRef)) + 1;
        }
      }

      if (pageNum !== null && pageNum >= 1 && pageNum <= totalPages) {
        navigateToPage(pageNum);
      }
    },

    getHash(dest: unknown) { return JSON.stringify(dest); },
    setHash(_) { },
    executeNamedAction(_) { },
    cachePageRef(_) { },
    isPageVisible(_) { return true; },
    isPageCached(_) { return true; },
  };
}
