/**
 * Hook for EPUB column-based pagination.
 * Uses CSS multi-column layout to divide a scrolling chapter into discrete "pages."
 */
import { useCallback, useEffect, useRef, useState } from "react";

interface UseEpubPaginationReturn {
  /** Current page within the chapter (1-based) */
  currentPage: number;
  /** Total pages in the current chapter */
  totalPages: number;
  /** Go to next page (within chapter). Returns true if there's a next page. */
  nextPage: () => boolean;
  /** Go to previous page (within chapter). Returns true if there's a prev page. */
  prevPage: () => boolean;
  /** Go to a specific page */
  goToPage: (page: number) => void;
  /** Apply pagination CSS to an iframe */
  applyPagination: (iframe: HTMLIFrameElement, viewportWidth: number, viewportHeight: number) => void;
  /** Remove pagination CSS from an iframe */
  removePagination: (iframe: HTMLIFrameElement) => void;
  /** Recalculate total pages (call after chapter load or resize) */
  recalculate: (iframe: HTMLIFrameElement, viewportWidth: number) => void;
}

const PAGINATION_STYLE_ID = "sanctuary-pagination-style";
const GAP = 40; // px gap between columns

export function useEpubPagination(): UseEpubPaginationReturn {
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const columnWidthRef = useRef(0);

  const applyPagination = useCallback((iframe: HTMLIFrameElement, viewportWidth: number, viewportHeight: number) => {
    const doc = iframe.contentDocument;
    if (!doc?.body) return;

    // Remove existing pagination style if any
    doc.getElementById(PAGINATION_STYLE_ID)?.remove();

    const colWidth = viewportWidth - GAP * 2;
    columnWidthRef.current = viewportWidth;

    const style = doc.createElement("style");
    style.id = PAGINATION_STYLE_ID;
    style.textContent = `
      html, body {
        margin: 0 !important;
        padding: 0 ${GAP}px !important;
        overflow: hidden !important;
        height: ${viewportHeight}px !important;
        max-height: ${viewportHeight}px !important;
      }
      body {
        column-width: ${colWidth}px !important;
        column-gap: ${GAP * 2}px !important;
        column-fill: auto !important;
        height: ${viewportHeight - 20}px !important;
        box-sizing: border-box !important;
      }
      img, svg, video, table {
        max-width: ${colWidth}px !important;
        max-height: ${viewportHeight - 40}px !important;
        break-inside: avoid !important;
      }
    `;
    doc.head.appendChild(style);

    // Reset to page 1
    doc.body.style.transform = "translateX(0)";
    setCurrentPage(1);

    // Calculate total pages after a frame (let layout settle)
    requestAnimationFrame(() => {
      const scrollW = doc.body.scrollWidth;
      const pages = Math.max(1, Math.ceil(scrollW / viewportWidth));
      setTotalPages(pages);
    });
  }, []);

  const removePagination = useCallback((iframe: HTMLIFrameElement) => {
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.getElementById(PAGINATION_STYLE_ID)?.remove();
    if (doc.body) {
      doc.body.style.transform = "";
    }
    setCurrentPage(1);
    setTotalPages(1);
  }, []);

  const recalculate = useCallback((iframe: HTMLIFrameElement, viewportWidth: number) => {
    const doc = iframe.contentDocument;
    if (!doc?.body) return;
    columnWidthRef.current = viewportWidth;
    requestAnimationFrame(() => {
      const scrollW = doc.body.scrollWidth;
      const pages = Math.max(1, Math.ceil(scrollW / viewportWidth));
      setTotalPages(pages);
      // Clamp current page
      setCurrentPage((c) => Math.min(c, pages));
    });
  }, []);

  const goToPage = useCallback((page: number) => {
    setCurrentPage((_, ) => {
      const clamped = Math.max(1, Math.min(totalPages, page));
      return clamped;
    });
  }, [totalPages]);

  // Apply transform whenever currentPage changes
  const iframeDocRef = useRef<Document | null>(null);

  const applyTransform = useCallback((page: number) => {
    // We need a reference to the iframe doc — we'll get it from the applyPagination call
    // For now, search for the iframe in the DOM
    const iframe = document.querySelector<HTMLIFrameElement>("iframe");
    const doc = iframe?.contentDocument;
    if (!doc?.body) return;
    const offset = -(page - 1) * columnWidthRef.current;
    doc.body.style.transform = `translateX(${offset}px)`;
  }, []);

  useEffect(() => {
    applyTransform(currentPage);
  }, [currentPage, applyTransform]);

  const nextPage = useCallback(() => {
    if (currentPage >= totalPages) return false;
    setCurrentPage((p) => p + 1);
    return true;
  }, [currentPage, totalPages]);

  const prevPage = useCallback(() => {
    if (currentPage <= 1) return false;
    setCurrentPage((p) => p - 1);
    return true;
  }, [currentPage]);

  return {
    currentPage,
    totalPages,
    nextPage,
    prevPage,
    goToPage,
    applyPagination,
    removePagination,
    recalculate,
  };
}
