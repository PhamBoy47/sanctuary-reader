import { useCallback, useEffect, useRef, useState } from "react";

interface UseEpubPaginationReturn {
  currentPage: number;
  totalPages: number;
  nextPage: () => boolean;
  prevPage: () => boolean;
  goToPage: (page: number) => void;
  applyPagination: (iframe: HTMLIFrameElement, viewportWidth: number, viewportHeight: number) => void;
  removePagination: (iframe: HTMLIFrameElement) => void;
  recalculate: (iframe: HTMLIFrameElement, viewportWidth: number) => void;
}

const PAGINATION_STYLE_ID = "sanctuary-pagination-style";
const GAP = 40;

export function useEpubPagination(iframeRef: React.RefObject<HTMLIFrameElement | null>): UseEpubPaginationReturn {
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const columnWidthRef = useRef(0);
  const docRef = useRef<Document | null>(null);

  const applyPagination = useCallback((iframe: HTMLIFrameElement, viewportWidth: number, viewportHeight: number) => {
    const doc = iframe.contentDocument;
    if (!doc?.body) return;

    doc.getElementById(PAGINATION_STYLE_ID)?.remove();
    docRef.current = doc;

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

    doc.body.style.transform = "translateX(0)";
    setCurrentPage(1);

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
    docRef.current = null;
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
      setCurrentPage((c) => Math.min(c, pages));
    });
  }, []);

  const goToPage = useCallback((page: number) => {
    setCurrentPage((_, ) => {
      const clamped = Math.max(1, Math.min(totalPages, page));
      return clamped;
    });
  }, [totalPages]);

  const applyTransform = useCallback((page: number) => {
    const doc = docRef.current;
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
