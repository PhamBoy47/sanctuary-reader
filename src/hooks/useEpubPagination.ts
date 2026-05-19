import { useCallback, useEffect, useRef, useState } from "react";

interface UseEpubPaginationReturn {
  currentPage: number;
  totalPages: number;
  nextPage: () => boolean;
  prevPage: () => boolean;
  goToPage: (page: number) => void;
  applyPagination: (container: HTMLElement, viewportWidth: number, viewportHeight: number) => void;
  removePagination: (container: HTMLElement) => void;
  recalculate: (container: HTMLElement, viewportWidth: number) => void;
}

const PAGINATION_STYLE_ID = "sanctuary-pagination-style";
const GAP = 40;

export function useEpubPagination(): UseEpubPaginationReturn {
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const columnWidthRef = useRef(0);
  const containerRef = useRef<HTMLElement | null>(null);

  const applyPagination = useCallback((container: HTMLElement, viewportWidth: number, viewportHeight: number) => {
    containerRef.current = container;

    const root = container.getRootNode() as ShadowRoot | Document;
    root.getElementById(PAGINATION_STYLE_ID)?.remove();

    const colWidth = viewportWidth - GAP * 2;
    columnWidthRef.current = viewportWidth;

    const style = document.createElement("style");
    style.id = PAGINATION_STYLE_ID;
    style.textContent = `
      body {
        margin: 0 !important;
        padding: 0 ${GAP}px !important;
        overflow: hidden !important;
        height: ${viewportHeight}px !important;
        max-height: ${viewportHeight}px !important;
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
    root.appendChild(style);

    container.style.transform = "translateX(0)";
    setCurrentPage(1);

    requestAnimationFrame(() => {
      const scrollW = container.scrollWidth;
      const pages = Math.max(1, Math.ceil(scrollW / viewportWidth));
      setTotalPages(pages);
    });
  }, []);

  const removePagination = useCallback((container: HTMLElement) => {
    const root = container.getRootNode() as ShadowRoot | Document;
    root.getElementById(PAGINATION_STYLE_ID)?.remove();
    container.style.transform = "";
    containerRef.current = null;
    setCurrentPage(1);
    setTotalPages(1);
  }, []);

  const recalculate = useCallback((container: HTMLElement, viewportWidth: number) => {
    columnWidthRef.current = viewportWidth;
    requestAnimationFrame(() => {
      const scrollW = container.scrollWidth;
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
    const container = containerRef.current;
    if (!container) return;
    const offset = -(page - 1) * columnWidthRef.current;
    container.style.transform = `translateX(${offset}px)`;
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
