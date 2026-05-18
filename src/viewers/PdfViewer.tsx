import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import * as pdfjsLib from "pdfjs-dist";
import "pdfjs-dist/web/pdf_viewer.css";
import { ListTree, Search, ChevronLeft, ChevronRight, GripVertical, Download, RotateCcw } from "lucide-react";
import { DocumentTocSidebar, type TocItem } from "@/components/DocumentTocSidebar";
import { ViewerToolbar } from "@/components/ViewerToolbar";
import { defaultSettings, type PdfSettings } from "@/components/PdfSettingsPanel";
import { PdfStatusBar, type DisplayMode } from "@/components/PdfStatusBar";
import { PdfSearchBar } from "@/components/PdfSearchBar";
import { PdfThumbnailPanel } from "@/components/PdfThumbnailPanel";
import { PdfContextMenu } from "@/components/PdfContextMenu";
import { BookmarkPanel } from "@/components/BookmarkPanel";
import { HighlightPanel } from "@/components/HighlightPanel";
import { SymbolPanel } from "@/components/SymbolPanel";
import { useSearchWorker } from "@/hooks/useSearchWorker";
import { Button } from "@/components/ui/button";
import {
  getHighlights, getSymbolAnnotations,
  type Highlight, type SymbolAnnotation,
} from "@/lib/annotationStore";
import { useAnnotationHistory } from "@/hooks/useAnnotationHistory";
import { usePdfStore } from "@/stores/usePdfStore";
import { usePdfRenderer } from "@/hooks/usePdfRenderer";
import { ExportDialog } from "@/components/ExportDialog";
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { toast } from "sonner";
import type { FileEntry } from "@/lib/fileStore";
import { updateProgress } from "@/lib/fileStore";
import { UnsavedChangesDialog } from "@/components/UnsavedChangesDialog";
import { DictionaryPopover } from "@/components/DictionaryPopover";
import { useAppSettings } from "@/lib/appSettings";
import { lookupWord } from "@/lib/dictionaryCore";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

/* ── TOC helpers ─────────────────────────────────────────────────── */

interface PdfTocItem extends TocItem {
  children?: PdfTocItem[];
  dest?: unknown;
  page?: number | null;
  url?: string | null;
}

type PdfPageRef = Parameters<pdfjsLib.PDFDocumentProxy["getPageIndex"]>[0];
type PdfTextContentItem = Awaited<ReturnType<pdfjsLib.PDFPageProxy["getTextContent"]>>["items"][number];
type PdfOutlineItem = {
  title?: string;
  dest?: unknown;
  url?: string | null;
  items?: PdfOutlineItem[];
};

function isPdfTextItem(item: PdfTextContentItem): item is pdfjsLib.TextItem {
  return "str" in item;
}

async function resolvePdfDestination(doc: pdfjsLib.PDFDocumentProxy, dest: unknown): Promise<number | null> {
  if (!dest) return null;
  const resolvedDest = typeof dest === "string" ? await doc.getDestination(dest) : dest;
  if (!Array.isArray(resolvedDest) || resolvedDest.length === 0) return null;
  const target = resolvedDest[0];
  if (typeof target === "number") return target + 1;
  if (target && typeof target === "object") return (await doc.getPageIndex(target as PdfPageRef)) + 1;
  return null;
}

async function mapPdfOutlineItems(
  doc: pdfjsLib.PDFDocumentProxy, outline: PdfOutlineItem[], prefix = "toc",
): Promise<PdfTocItem[]> {
  return Promise.all(
    outline.map(async (item, index) => {
      const id = `${prefix}-${index}`;
      const pageNumber = item.dest ? await resolvePdfDestination(doc, item.dest).catch(() => null) : null;
      return {
        id, label: item.title?.trim() || "Untitled section",
        hint: pageNumber ? `Page ${pageNumber}` : undefined,
        page: pageNumber, dest: item.dest, url: item.url ?? null,
        children: item.items?.length ? await mapPdfOutlineItems(doc, item.items, id) : [],
      };
    }),
  );
}

function flattenPdfTocItems(items: PdfTocItem[]): PdfTocItem[] {
  return items.flatMap((item) => [item, ...flattenPdfTocItems(item.children ?? [])]);
}

/* ── Link service ────────────────────────────────────────────────── */

function createPdfLinkService(doc: pdfjsLib.PDFDocumentProxy, setPage: PageSetter, totalPages: number) {
  const goToPage = (target: number) => setPage(Math.max(1, Math.min(totalPages, target)));
  return {
    addLinkAttributes(link: HTMLAnchorElement, url: string, newWindow?: boolean) {
      link.href = url; link.target = newWindow ? "_blank" : "_self"; link.rel = "noopener noreferrer";
    },
    eventBus: { dispatch: () => undefined },
    executeNamedAction(action: string) {
      switch (action) {
        case "NextPage": setPage((c) => Math.min(totalPages, c + 1)); break;
        case "PrevPage": setPage((c) => Math.max(1, c - 1)); break;
        case "FirstPage": goToPage(1); break;
        case "LastPage": goToPage(totalPages); break;
      }
    },
    executeSetOCGState() { return undefined; },
    getAnchorUrl(hash: string) { return hash || "#"; },
    getDestinationHash() { return "#"; },
    async goToDestination(dest: unknown) {
      const p = await resolvePdfDestination(doc, dest).catch(() => null);
      if (p) goToPage(p);
    },
  };
}

/* ── Filter helpers ──────────────────────────────────────────────── */

function getPageFilter(settings: PdfSettings): string {
  const parts: string[] = [];
  if (settings.brightness !== 100) parts.push(`brightness(${settings.brightness / 100})`);
  if (settings.invertColors) parts.push("invert(1) hue-rotate(180deg)");
  if (settings.pageBackground === "sepia") parts.push("sepia(0.3)");
  if (settings.pageBackground === "warm") parts.push("sepia(0.15) saturate(1.1)");
  if (settings.pageBackground === "cool") parts.push("hue-rotate(15deg) saturate(0.9)");
  return parts.length ? parts.join(" ") : "none";
}

/* ── Print helper ────────────────────────────────────────────────── */

function printPdf() {
  window.print();
}

/* ── Search helpers ──────────────────────────────────────────────── */

interface SearchResult { page: number; index: number; }

async function searchPdf(pdfDoc: pdfjsLib.PDFDocumentProxy, query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];
  const results: SearchResult[] = [];
  const lowerQuery = query.toLowerCase();
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.filter(isPdfTextItem).map((item) => item.str).join(" ").toLowerCase();
    let idx = 0;
    let pos = pageText.indexOf(lowerQuery, idx);
    while (pos !== -1) {
      results.push({ page: i, index: results.length });
      idx = pos + 1;
      pos = pageText.indexOf(lowerQuery, idx);
    }
  }
  return results;
}

/* ── Component ───────────────────────────────────────────────────── */

interface PdfViewerProps { file: FileEntry; onBack: () => void; }

export function PdfViewer({ file, onBack }: PdfViewerProps) {
  const { settings: appSettings } = useAppSettings();
  const history = useAnnotationHistory(file.id);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pdfTexts = useRef<{ index: number; text: string }[]>([]);

  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dictionaryQuery, setDictionaryQuery] = useState<{ word: string, x: number, y: number, results: string[] } | null>(null);
  const [tocItems, setTocItems] = useState<PdfTocItem[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [symbolAnnotations, setSymbolAnnotations] = useState<SymbolAnnotation[]>([]);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);

  const { search: runWorkerSearch, results: workerResults, isSearching } = useSearchWorker();

  const {
    page, setPage,
    totalPages, setTotalPages,
    zoom, setZoom,
    rotation, setRotation,
    displayMode, setDisplayMode,
    settings, setSettings,
    sidebarTab, setSidebarTab,
    showSearch, setShowSearch,
    searchQuery, setSearchQuery,
    searchBarSeed, setSearchBarSeed,
    searchResults, setSearchResults,
    currentResultIdx, setCurrentResultIdx,
    highlightColor, setHighlightColor,
    activeSymbol, setActiveSymbol,
    placingSymbol, setPlacingSymbol,
    hasUnsavedChanges, setHasUnsavedChanges,
    navHistory, pushNavHistory,
    navIndex, setNavIndex,
    autoScroll, setAutoScroll,
    visiblePages, setVisiblePages,
    reset: resetStore
  } = usePdfStore();

  const [pageDimensions, setPageDimensions] = useState<Record<number, { width: number; height: number }>>({});

  useEffect(() => {
    if (!pdf) {
      setPageDimensions({});
      return;
    }
    let cancelled = false;
    const loadDims = async () => {
      let dims: Record<number, { width: number; height: number }> = {};
      for (let i = 1; i <= pdf.numPages; i++) {
        if (cancelled) return;
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 1 });
        dims = { ...dims, [i]: { width: vp.width, height: vp.height } };
        
        if (i <= 5 || i % 20 === 0 || i === pdf.numPages) {
          setPageDimensions(dims);
        }
      }
    };
    loadDims();
    return () => { cancelled = true; };
  }, [pdf]);

  useEffect(() => {
    setSearchResults(workerResults);
    if (workerResults.length > 0) setCurrentResultIdx(1);
  }, [workerResults, setSearchResults, setCurrentResultIdx]);

  const [textsExtracted, setTextsExtracted] = useState(false);

  useEffect(() => {
    if (!pdf) {
      pdfTexts.current = [];
      setTextsExtracted(false);
      return;
    }
    const extract = async () => {
      const texts: { index: number; text: string }[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const text = content.items.filter(isPdfTextItem).map((item) => item.str).join(" ");
        texts.push({ index: i, text });
      }
      pdfTexts.current = texts;
      setTextsExtracted(true);
    };
    extract();
  }, [pdf]);

  useEffect(() => {
    if (textsExtracted && searchQuery.trim()) {
      runWorkerSearch(searchQuery, pdfTexts.current);
    }
  }, [textsExtracted, searchQuery, runWorkerSearch]);

  const pageRef = useRef(page);
  const zoomBeforeFit = useRef<number | null>(null);
  const renderedPagesRef = useRef<Set<number>>(new Set());
  const scrollAnchorRef = useRef<{ pageNum: number; offsetFraction: number } | null>(null);
  const isNavJump = useRef(false);
  const isNavigating = useRef(false);
  const lastScrollTopRef = useRef(0);
  const lastScrollTimeRef = useRef(0);
  const scrollVelocityRef = useRef(0);
  const VELOCITY_THRESHOLD = 2000; // px/sec

  useEffect(() => { pageRef.current = page; }, [page]);

  const navigateToPage = useCallback((p: number | ((prev: number) => number)) => {
    isNavigating.current = true;
    setPage((prevPage) => {
      const newPage = typeof p === "function" ? p(prevPage) : p;
      if (!isNavJump.current && newPage !== prevPage) {
        pushNavHistory(newPage);
      }
      isNavJump.current = false;
      return newPage;
    });
  }, [pushNavHistory, setPage]);

  // Initialize renderer hook
  const { renderPage, cancelAllRenders } = usePdfRenderer({
    pdf, zoom, rotation, settings, symbolAnnotations, totalPages,
    navigateToPage,
  });

  const handleSave = useCallback(async () => {
    const percentage = Math.round((page / totalPages) * 100);
    await updateProgress(file.id, percentage);
    setHasUnsavedChanges(false);
    toast.success("Reading progress saved");
  }, [file.id, page, setHasUnsavedChanges, totalPages]);

  const reloadAnnotations = useCallback(async () => {
    const [hl, sa] = await Promise.all([
      getHighlights(file.id),
      getSymbolAnnotations(file.id),
    ]);
    setHighlights(hl);
    setSymbolAnnotations(sa);
  }, [file.id]);

  useEffect(() => { reloadAnnotations(); }, [reloadAnnotations, history.annotationVersion]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const handleBackWithCheck = useCallback(() => {
    if (hasUnsavedChanges) {
      setShowUnsavedDialog(true);
    } else {
      onBack();
    }
  }, [hasUnsavedChanges, onBack]);

  /* Load PDF — depends only on file.data so new-file changes are isolated */
  useEffect(() => {
    let cancelled = false;
    // Reset all per-document state when file changes
    renderedPagesRef.current.clear();
    cancelAllRenders();
    scrollAnchorRef.current = null;

    setError(null);
    const loadingTask = pdfjsLib.getDocument({ 
      data: new Uint8Array(file.data),
      standardFontDataUrl: `/pdfjs/standard_fonts/`,
      cMapUrl: `/pdfjs/cmaps/`,
      cMapPacked: true,
    });
    loadingTask.promise
      .then(async (doc) => {
        if (cancelled) return;
        setPdf(doc);
        setTotalPages(doc.numPages);
        
        if (file.progress && file.progress > 0) {
          const restoredPage = Math.max(1, Math.round((file.progress / 100) * doc.numPages));
          navigateToPage(restoredPage);
        } else {
          navigateToPage(1);
        }

        const outline = await doc.getOutline();
        if (!cancelled) setTocItems(outline ? await mapPdfOutlineItems(doc, outline) : []);
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("Failed to load PDF", error);
          setError(`Could not open this PDF file: ${(error as Error)?.message || "The file may be corrupt or uses unsupported features."}`);
        }
      });
    return () => { cancelled = true; loadingTask.destroy(); };
  }, [cancelAllRenders, file.data, navigateToPage, setTotalPages, file.progress]);

  /* Auto-save progress when page changes */
  useEffect(() => {
    if (!pdf || totalPages <= 1) return;
    const percentage = Math.round((page / totalPages) * 100);
    updateProgress(file.id, percentage).catch(console.error);
  }, [page, totalPages, file.id, pdf]);

  /* Navigation history */
  const handleDefine = useCallback(async (word: string, x: number, y: number) => {
    const results = await lookupWord(word); 
    setDictionaryQuery({ word, x, y, results });
  }, []);

  const navBack = useCallback(() => {
    if (navIndex > 0) {
      isNavJump.current = true;
      isNavigating.current = true;
      const newIdx = navIndex - 1;
      setNavIndex(newIdx);
      setPage(navHistory[newIdx]);
    }
  }, [navIndex, navHistory, setNavIndex, setPage]);

  const navForward = useCallback(() => {
    if (navIndex < navHistory.length - 1) {
      isNavJump.current = true;
      isNavigating.current = true;
      const newIdx = navIndex + 1;
      setNavIndex(newIdx);
      setPage(navHistory[newIdx]);
    }
  }, [navIndex, navHistory, setNavIndex, setPage]);

  /* TOC */
  const flatTocItems = useMemo(() => flattenPdfTocItems(tocItems), [tocItems]);
  const activeTocId = useMemo(() => {
    let id: string | null = null;
    for (const item of flatTocItems) { if (item.page && item.page <= page) id = item.id; }
    return id;
  }, [flatTocItems, page]);

  const handleTocSelect = useCallback(async (item: TocItem) => {
    const tocItem = item as PdfTocItem;
    if (tocItem.url) { window.open(tocItem.url, "_blank", "noopener,noreferrer"); return; }
    if (!pdf) return;
    const p = tocItem.page ?? (await resolvePdfDestination(pdf, tocItem.dest).catch(() => null));
    if (p) navigateToPage(p);
    if (window.innerWidth < 768) setSidebarTab(null);
  }, [pdf, navigateToPage, setSidebarTab]);

  /* Fit width */
  const handleFitWidth = useCallback(async () => {
    if (!pdf || !viewportRef.current) return;
    const currentPage = await pdf.getPage(page);
    const baseViewport = currentPage.getViewport({ scale: 1 });
    const availableWidth = Math.max(viewportRef.current.clientWidth - 32, 240);
    setZoom(Math.max(0.4, Math.min(3, availableWidth / baseViewport.width)));
  }, [page, pdf, setZoom]);

  const handleToggleAutoFitWidth = useCallback(() => {
    if (!settings.autoFitWidth) {
      zoomBeforeFit.current = zoom;
      setSettings((prev) => ({ ...prev, autoFitWidth: true }));
    } else {
      if (zoomBeforeFit.current !== null) {
        setZoom(zoomBeforeFit.current);
        zoomBeforeFit.current = null;
      }
      setSettings((prev) => ({ ...prev, autoFitWidth: false }));
    }
  }, [setSettings, setZoom, settings.autoFitWidth, zoom]);

  useEffect(() => { if (settings.autoFitWidth) handleFitWidth(); }, [settings.autoFitWidth, handleFitWidth]);

  useEffect(() => {
    if (!settings.autoFitWidth || !viewportRef.current) return;
    const ro = new ResizeObserver(() => handleFitWidth());
    ro.observe(viewportRef.current);
    return () => ro.disconnect();
  }, [settings.autoFitWidth, handleFitWidth]);

  /* Auto-scroll effect */
  useEffect(() => {
    if (!autoScroll || displayMode !== "continuous" || !viewportRef.current) return;
    const interval = setInterval(() => {
      if (viewportRef.current) viewportRef.current.scrollTop += 1;
    }, 50);
    return () => clearInterval(interval);
  }, [autoScroll, displayMode]);

  /* Search */
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (!pdf || !query.trim()) {
      setSearchResults([]);
      setCurrentResultIdx(0);
      return;
    }
    runWorkerSearch(query, pdfTexts.current);
  }, [pdf, runWorkerSearch, setSearchQuery, setSearchResults, setCurrentResultIdx]);

  const handleNextResult = useCallback(() => {
    if (searchResults.length === 0) return;
    const next = currentResultIdx >= searchResults.length ? 1 : currentResultIdx + 1;
    setCurrentResultIdx(next);
    navigateToPage(searchResults[next - 1].page);
  }, [searchResults, currentResultIdx, navigateToPage, setCurrentResultIdx]);

  const handlePrevResult = useCallback(() => {
    if (searchResults.length === 0) return;
    const prev = currentResultIdx <= 1 ? searchResults.length : currentResultIdx - 1;
    setCurrentResultIdx(prev);
    navigateToPage(searchResults[prev - 1].page);
  }, [searchResults, currentResultIdx, navigateToPage, setCurrentResultIdx]);

  const handleSearchFromContext = useCallback((text: string) => {
    setSearchBarSeed(text); // captured once by PdfSearchBar's open-time effect
    setShowSearch(true);
  }, [setSearchBarSeed, setShowSearch]);

  /* Highlight from context menu */
  const handleHighlightText = useCallback(async (text: string, rects: Highlight["rects"]) => {
    await history.doAddHighlight(page, highlightColor, text, rects);
    toast.success("Text highlighted");
    setHasUnsavedChanges(true);
  }, [history, page, highlightColor, setHasUnsavedChanges]);

  /* Bookmark from context menu */
  const handleBookmarkPage = useCallback(async () => {
    await history.doAddBookmark(page);
    toast.success(`Bookmarked page ${page}`);
    setHasUnsavedChanges(true);
  }, [history, page, setHasUnsavedChanges]);

  /* Symbol placement click handler */
  const handleViewportClick = useCallback(async (e: React.MouseEvent) => {
    if (!placingSymbol) return;
    const target = (e.target as HTMLElement).closest(".pdf-page") as HTMLElement | null;
    if (!target) return;
    const pageNum = Number(target.dataset.pageNumber);
    if (!pageNum) return;
    const rect = target.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    await history.doAddSymbol(pageNum, activeSymbol, x, y);
    toast.success("Symbol placed");
    setHasUnsavedChanges(true);
  }, [placingSymbol, history, activeSymbol, setHasUnsavedChanges]);

  /* Render pages (Structural & Canvas) */
  const renderTrigger = displayMode === "continuous" ? "all" : String(page);

  // Rendering logic is now managed by structural effect + usePdfRenderer hook.
  // The local renderPage function has been extracted to usePdfRenderer.ts.

  // ─── FIX 6: Save scroll anchor before a layout-affecting rebuild ──────────
  // Finds which page is currently at the top of the viewport and what fraction
  // of that page's height is above the fold, so we can restore the same visual
  // position after dimensions change.
  const saveScrollAnchor = useCallback(() => {
    if (!viewportRef.current || !containerRef.current) return;
    const scrollTop = viewportRef.current.scrollTop;
    const pages = containerRef.current.querySelectorAll<HTMLElement>(".pdf-page");
    for (const el of pages) {
      const top = el.offsetTop;
      const height = el.offsetHeight;
      if (top + height > scrollTop) {
        scrollAnchorRef.current = {
          pageNum: Number(el.dataset.pageNumber),
          offsetFraction: height > 0 ? (scrollTop - top) / height : 0,
        };
        return;
      }
    }
  }, []);

  // ─── Structural Effect ────────────────────────────────────────────────────
  // Runs when zoom / rotation / displayMode / pdf / totalPages change.
  // FIX 6: In continuous mode we NEVER call replaceChildren when wrappers
  // already exist at the right count. We update wrapper dimensions in-place
  // and invalidate only the canvases whose dimensions changed, then restore
  // the scroll offset via the anchor saved before the rebuild.
  useEffect(() => {
    if (!pdf || !containerRef.current) return;
    const container = containerRef.current;
    let cancelled = false;

    const buildStructure = async () => {
      const outputScale = window.devicePixelRatio || 1;

      if (displayMode === "continuous") {
        saveScrollAnchor();
        
        await new Promise(r => setTimeout(r, 0));
        if (cancelled) return;

        const isRotated = rotation === 90 || rotation === 270;
        const wrappers = container.querySelectorAll<HTMLElement>(".pdf-page");
        wrappers.forEach(wrapper => {
          const i = Number(wrapper.dataset.pageNumber);
          const dim = pageDimensions[i];
          if (dim) {
            const w = isRotated ? dim.height : dim.width;
            const h = isRotated ? dim.width : dim.height;
            const newW = `${w * zoom}px`;
            const newH = `${h * zoom}px`;
            const dimensionsChanged = wrapper.style.width !== newW || wrapper.style.height !== newH;

            const filter = getPageFilter(settings);
            wrapper.style.filter = filter !== "none" ? filter : "";

            if (dimensionsChanged) {
              wrapper.style.width = newW;
              wrapper.style.height = newH;
              const oldCanvas = wrapper.querySelector(".pdf-canvas") as HTMLCanvasElement;
              if (oldCanvas) {
                oldCanvas.style.width = newW;
                oldCanvas.style.height = newH;
              }
              wrapper.querySelectorAll('.textLayer, .annotationLayer, .symbol-layer').forEach(el => (el as HTMLElement).style.display = 'none');
              renderedPagesRef.current.delete(i);
            }
          }
        });

        if (scrollAnchorRef.current) {
          const { pageNum, offsetFraction } = scrollAnchorRef.current;
          requestAnimationFrame(() => {
            const anchorEl = container.querySelector<HTMLElement>(`[data-page-number="${pageNum}"]`);
            if (anchorEl && viewportRef.current) {
              viewportRef.current.scrollTop = anchorEl.offsetTop + anchorEl.offsetHeight * offsetFraction;
            }
            scrollAnchorRef.current = null;
          });
        }

        if (viewportRef.current) {
           viewportRef.current.dispatchEvent(new Event('scroll'));
        }

      } else {
        await new Promise(r => setTimeout(r, 0));
        if (cancelled) return;

        const wrappers = container.querySelectorAll<HTMLElement>(".pdf-page");
        wrappers.forEach(wrapper => {
          const pNum = Number(wrapper.dataset.pageNumber);
          if (renderedPagesRef.current.has(pNum)) {
            const hasCanvas = wrapper.querySelector('.pdf-canvas');
            if (!hasCanvas) {
              renderedPagesRef.current.delete(pNum);
            }
          }
        });

        const isRotated = rotation === 90 || rotation === 270;
        const renderSingleOrTwo = async (pNum: number) => {
          const wrapper = container.querySelector<HTMLElement>(`.pdf-page[data-page-number="${pNum}"]`);
          if (!wrapper) return;
          
          const dim = pageDimensions[pNum];
          let dimChanged = false;
          if (dim) {
            const w = isRotated ? dim.height : dim.width;
            const h = isRotated ? dim.width : dim.height;
            const newW = `${w * zoom}px`;
            const newH = `${h * zoom}px`;
            dimChanged = wrapper.style.width !== newW || wrapper.style.height !== newH;
            wrapper.style.width = newW;
            wrapper.style.height = newH;
          }
          
          const filter = getPageFilter(settings);
          wrapper.style.filter = filter !== "none" ? filter : "";

          if (dimChanged || !renderedPagesRef.current.has(pNum)) {
            wrapper.querySelectorAll('.pdf-canvas, .textLayer, .annotationLayer, .symbol-layer').forEach(el => el.remove());
            renderedPagesRef.current.delete(pNum);
            renderedPagesRef.current.add(pNum);
            renderPage(pNum, wrapper, outputScale).catch(() => {
              renderedPagesRef.current.delete(pNum);
            });
          }
        };

        if (displayMode === "twopage") {
          const startPage = page % 2 === 0 ? page - 1 : page;
          renderSingleOrTwo(startPage);
          if (startPage + 1 <= totalPages) renderSingleOrTwo(startPage + 1);
        } else {
          renderSingleOrTwo(page);
        }
      }
    };

    buildStructure();
    return () => { cancelled = true; };
  }, [displayMode, zoom, rotation, pdf, totalPages, renderTrigger, settings, renderPage, pageDimensions, page, saveScrollAnchor]);

  // ─── FIX 5: Isolated Search & Highlight Overlay Effect ───────────────────
  // This effect manages two absolutely-positioned overlay divs per page:
  //   • .highlight-layer  — user annotation highlights (stored in DB)
  //   • .search-highlight-layer — live search match highlights
  // It does NOT modify any span inside .textLayer, so pdf.js internal
  // coordinate mappings remain intact.
  useEffect(() => {
    if (!pdf || !containerRef.current) return;
    let cancelled = false;

    const drawOverlays = async () => {
      const container = containerRef.current;
      if (!container) return;
      const wrappers = container.querySelectorAll<HTMLElement>(".pdf-page");

      for (const wrapper of wrappers) {
        if (cancelled) return;
        const pageNum = Number(wrapper.dataset.pageNumber);

        // Remove stale overlay layers only — never touch canvas or textLayer
        wrapper.querySelectorAll('.highlight-layer, .search-highlight-layer').forEach(el => el.remove());

        // Skip off-screen pages in continuous mode to avoid unnecessary work
        if (displayMode === "continuous" && !visiblePages.has(pageNum)) continue;

        const pdfPage = await pdf.getPage(pageNum);
        const viewport = pdfPage.getViewport({ scale: zoom, rotation });

        // ── User annotation highlights ──
        const pageHighlights = highlights.filter((h) => h.page === pageNum);
        if (pageHighlights.length > 0) {
          const hlOverlay = document.createElement("div");
          hlOverlay.className = "highlight-layer absolute inset-0 pointer-events-none z-[4]";
          pageHighlights.forEach((hl) => {
            hl.rects.forEach((r) => {
              const el = document.createElement("div");
              el.className = "absolute rounded-sm";
              el.style.left = `${r.x * 100}%`;
              el.style.top = `${r.y * 100}%`;
              el.style.width = `${r.w * 100}%`;
              el.style.height = `${r.h * 100}%`;
              el.style.backgroundColor = hl.color;
              el.style.opacity = "0.35";
              el.style.mixBlendMode = "multiply";
              hlOverlay.appendChild(el);
            });
          });
          wrapper.appendChild(hlOverlay);
        }

        // ── Search match highlights ──
        // FIX 5: We compute bounding rectangles from the pdf.js text content
        // transform matrix and draw isolated <div> rectangles in a sibling
        // overlay — never touching or wrapping spans inside .textLayer.
        if (searchQuery.trim() !== "") {
          const searchOverlay = document.createElement("div");
          searchOverlay.className = "search-highlight-layer absolute inset-0 pointer-events-none z-[4]";
          let hasMatch = false;

          // Reusable canvas context for proportional text measurement
          const measureCtx = document.createElement("canvas").getContext("2d");

          const textContent = await pdfPage.getTextContent();
          if (cancelled) return;

          const textItems = textContent.items.filter(isPdfTextItem);
          const fullText = textItems.map((it) => it.str).join("");
          const lowerFull = fullText.toLowerCase();
          const lowerQ = searchQuery.toLowerCase();

          // Get the starting global match index for this page
          const pageResults = searchResults.filter((r) => r.page === pageNum);
          let currentGlobalMatchIdx = pageResults.length > 0 ? pageResults[0].index : -1;

          // Build item offset map once
          const offsets: number[] = [];
          let cursor = 0;
          textItems.forEach((it) => {
            offsets.push(cursor);
            cursor += (it.str || "").length;
          });

          let pos = lowerFull.indexOf(lowerQ);
          while (pos !== -1) {
            hasMatch = true;
            const matchEnd = pos + lowerQ.length;
            const isActiveMatch = currentGlobalMatchIdx !== -1 && currentGlobalMatchIdx === currentResultIdx - 1;

            // Find all items that intersect with this match [pos, matchEnd]
          for (let i = 0; i < textItems.length; i++) {
              const item = textItems[i];
              const itemStart = offsets[i];
              const itemEnd = itemStart + (item.str || "").length;

              // Check for intersection
              const overlapStart = Math.max(pos, itemStart);
              const overlapEnd = Math.min(matchEnd, itemEnd);

              if (overlapStart < overlapEnd) {
                // This item contains part of the match
                const [tx, ty] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
                const [tx2] = viewport.convertToViewportPoint(item.transform[4] + item.width, item.transform[5]);

                // Use transform[3] for height, but cap it to a reasonable ratio if needed
                // item.transform[3] is the vertical scale (font size)
                const itemH = Math.abs(item.transform[3] * viewport.scale);
                
                const relativeStart = overlapStart - itemStart;
                const relativeEnd = overlapEnd - itemStart;
                const spanW = Math.abs(tx2 - tx);

                // Use proportional measurement to accurately place highlights on non-monospace fonts
                let startFrac = 0;
                let widthFrac = 0;
                
                if (measureCtx && item.str) {
                  measureCtx.font = `${itemH}px sans-serif`;
                  const fullTextW = measureCtx.measureText(item.str).width;
                  const prefixW = measureCtx.measureText(item.str.substring(0, relativeStart)).width;
                  const matchTextW = measureCtx.measureText(item.str.substring(relativeStart, relativeEnd)).width;
                  
                  if (fullTextW > 0) {
                    startFrac = prefixW / fullTextW;
                    widthFrac = matchTextW / fullTextW;
                  }
                } else {
                  // Fallback
                  const totalLen = item.str.length || 1;
                  startFrac = relativeStart / totalLen;
                  widthFrac = (relativeEnd - relativeStart) / totalLen;
                }

                const rect = document.createElement("div");
                if (isActiveMatch) {
                  rect.className = "absolute bg-[#ff9632]/80 border border-[#ea580c] rounded-[3px] z-10 shadow-sm";
                } else {
                  rect.className = "absolute bg-yellow-400/40 border border-yellow-500/50 rounded-[3px]";
                }
                
                rect.style.left = `${Math.min(tx, tx2) + spanW * startFrac}px`;
                // ty is the baseline; we shift slightly to center the highlight on typical glyph heights
                // PDF.js coordinates can be tricky; 0.8-0.9 * height often looks better than full height shift
                rect.style.top = `${ty - itemH * 0.9}px`;
                rect.style.width = `${spanW * widthFrac}px`;
                rect.style.height = `${itemH * 1.0}px`;

                searchOverlay.appendChild(rect);
              }
            }
            pos = lowerFull.indexOf(lowerQ, pos + 1);
            if (currentGlobalMatchIdx !== -1) currentGlobalMatchIdx++;
          }

          if (hasMatch) wrapper.appendChild(searchOverlay);
        }
      }
    };

    drawOverlays();
    return () => { cancelled = true; };
  }, [searchQuery, searchResults, currentResultIdx, highlights, visiblePages, zoom, displayMode, rotation, pdf]);

  /* Scroll to page on external nav in continuous mode */
  useEffect(() => {
    if (displayMode === "continuous" && isNavigating.current && containerRef.current) {
      const pageEl = containerRef.current.querySelector(`.pdf-page[data-page-number="${page}"]`);
      if (pageEl) {
        pageEl.scrollIntoView({ behavior: "auto", block: "start" });
      }
    }
    const timer = setTimeout(() => { isNavigating.current = false; }, 500);
    return () => clearTimeout(timer);
  }, [page, displayMode]);

  // ─── FIX 3 & 4: Scroll-based page tracking with clean virtualization ──────
  // Decoupled from rendering state entirely. The observer:
  //   1. Tracks the most-visible page for the page indicator (no isRenderingRef gate)
  //   2. Computes a virtual window of currentPage +/- VIRTUAL_BUFFER pages
  //   3. Mounts canvases for pages inside the window, unmounts for pages outside
  //   4. Uses index-based buffer (not pixel distance) for predictable behavior
  const VIRTUAL_BUFFER = 3; // pages above and below viewport to keep mounted

  useEffect(() => {
    if (displayMode !== "continuous" || !viewportRef.current || !containerRef.current) return;
    const scrollContainer = viewportRef.current;
    const isHorizontal = settings.scrollDirection === "horizontal";
    let ticking = false;

    const updatePageNumber = () => {
      if (!containerRef.current || !viewportRef.current) return;
      const pages = containerRef.current.querySelectorAll<HTMLElement>(".pdf-page");
      if (!pages.length) { ticking = false; return; }

      const containerRect = scrollContainer.getBoundingClientRect();
      const containerCenterY = containerRect.top + containerRect.height / 2;

      let bestPage = pageRef.current;
      let maxVisibleHeight = 0;
      let minDistToCenter = Infinity;

      // FIX 3: Page detection is completely independent of rendering state.
      // We only skip scroll-driven setPage when isNavigating is true (programmatic jump).
      for (let i = 0; i < pages.length; i++) {
        const pageEl = pages[i];
        const rect = pageEl.getBoundingClientRect();
        const pageNum = Number(pageEl.dataset.pageNumber);

        const visibleTop = Math.max(containerRect.top, rect.top);
        const visibleBottom = Math.min(containerRect.bottom, rect.bottom);
        const visibleHeight = Math.max(0, visibleBottom - visibleTop);

        const pageCenterY = rect.top + rect.height / 2;
        const distToCenter = Math.abs(containerCenterY - pageCenterY);

        if (visibleHeight > maxVisibleHeight) {
          maxVisibleHeight = visibleHeight;
          bestPage = pageNum;
          minDistToCenter = distToCenter;
        } else if (visibleHeight > 0 && Math.abs(visibleHeight - maxVisibleHeight) < 2) {
          if (distToCenter < minDistToCenter) {
            bestPage = pageNum;
            minDistToCenter = distToCenter;
          }
        }
      }

      // FIX 4: Virtual window — keep +/- VIRTUAL_BUFFER pages around bestPage mounted
      const VIRTUAL_BUFFER = 3;
      const windowMin = Math.max(1, bestPage - VIRTUAL_BUFFER);
      const windowMax = Math.min(totalPages, bestPage + VIRTUAL_BUFFER);

      const newVisiblePages = new Set<number>();
      for (let p = windowMin; p <= windowMax; p++) newVisiblePages.add(p);

      // Pages outside the virtual window keep their canvases cached.
      // We don't remove canvases here - they remain in the DOM and are
      // hidden by the scroll container's overflow. This prevents a blank
      // flash when scrolling back to a previously-viewed page.
      // On zoom/rotation changes, the structural effect handles cleanup via
      // renderedPagesRef invalidation.

      setVisiblePages(prev => {
        if (prev.size === newVisiblePages.size && [...newVisiblePages].every(p => prev.has(p))) return prev;
        return newVisiblePages;
      });

      // Mount canvases for newly visible pages
      const outputScale = window.devicePixelRatio || 1;
      const isFastScrolling = scrollVelocityRef.current > VELOCITY_THRESHOLD;

      // When fast scrolling, we only render the 'bestPage' immediately
      // Visible neighbors will be rendered once scrolling slows down
      newVisiblePages.forEach(p => {
        const shouldRenderNow = !isFastScrolling || p === bestPage;
        if (shouldRenderNow && !renderedPagesRef.current.has(p)) {
          const wrapper = containerRef.current!.querySelector<HTMLElement>(`[data-page-number="${p}"]`);
          if (wrapper) {
            renderedPagesRef.current.add(p);
            renderPage(p, wrapper, outputScale).catch(() => {
              renderedPagesRef.current.delete(p);
            });
          }
        }
      });


      // FIX 3: Update page indicator only when scroll is user-driven
      if (bestPage && bestPage !== pageRef.current && !isNavigating.current) {
        setPage(bestPage);
      }

      ticking = false;
    };

    let scrollStopTimer: ReturnType<typeof setTimeout>;

    const handleScroll = () => {
      const now = performance.now();
      const scrollPos = isHorizontal ? scrollContainer.scrollLeft : scrollContainer.scrollTop;
      const dt = (now - lastScrollTimeRef.current) / 1000;
      if (dt > 0) {
        scrollVelocityRef.current = Math.abs(scrollPos - lastScrollTopRef.current) / dt;
      }
      lastScrollTopRef.current = scrollPos;
      lastScrollTimeRef.current = now;

      if (!ticking) {
        ticking = true;
        requestAnimationFrame(updatePageNumber);
      }

      if (scrollStopTimer) clearTimeout(scrollStopTimer);
      scrollStopTimer = setTimeout(() => {
        scrollVelocityRef.current = 0;
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(updatePageNumber);
        }
      }, 150);
    };

    scrollContainer.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      scrollContainer.removeEventListener("scroll", handleScroll);
      if (scrollStopTimer) clearTimeout(scrollStopTimer);
    };
  }, [displayMode, totalPages, setVisiblePages, setPage, renderPage, settings.scrollDirection]);

  /* Keyboard nav & Shortcuts */
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditable = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable;
      if (isEditable && e.key !== "Escape" && !(e.ctrlKey || e.metaKey)) return;

      const ctrlOrMeta = e.ctrlKey || e.metaKey;

      if (ctrlOrMeta && e.key === "f") { e.preventDefault(); setShowSearch(true); return; }
      if (e.key === "Escape" && showSearch) { setShowSearch(false); setSearchResults([]); setCurrentResultIdx(0); return; }

      // Undo
      if (ctrlOrMeta && e.key === "z") {
        e.preventDefault();
        history.undo();
        return;
      }
      // Redo
      if (ctrlOrMeta && (e.key === "y" || (e.shiftKey && e.key === "Z"))) {
        e.preventDefault();
        history.redo();
        return;
      }

      // Save
      if (ctrlOrMeta && e.key === "s") {
        e.preventDefault();
        handleSave();
        return;
      }

      // Sidebar
      if (ctrlOrMeta && e.key === "b") {
        e.preventDefault();
        setSidebarTab((prev) => (prev ? null : "toc"));
        return;
      }

      // Settings
      if (ctrlOrMeta && e.key === ",") {
        e.preventDefault();
        setSidebarTab("bookmarks");
        return;
      }

      // Fullscreen
      if (ctrlOrMeta && e.key === "l") {
        e.preventDefault();
        viewportRef.current?.requestFullscreen();
        return;
      }

      // Zoom Fit toggle
      if (ctrlOrMeta && e.key === "\\") {
        e.preventDefault();
        handleToggleAutoFitWidth();
        return;
      }

      // Zoom In/Out
      if (ctrlOrMeta && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        setZoom((z) => Math.min(3, z + 0.1));
        return;
      }
      if (ctrlOrMeta && (e.key === "-" || e.key === "_")) {
        e.preventDefault();
        setZoom((z) => Math.max(0.4, z - 0.1));
        return;
      }

      // Print
      if (ctrlOrMeta && e.key === "p") {
        e.preventDefault();
        printPdf();
        return;
      }

      // Rotation
      if (ctrlOrMeta && (e.key === "r" || e.key === "R")) {
        e.preventDefault();
        if (e.shiftKey) setRotation((r) => (r - 90) % 360);
        else setRotation((r) => (r + 90) % 360);
        return;
      }

      // Display modes
      if (e.key === "d") {
        const modes: DisplayMode[] = ["single", "continuous", "twopage"];
        const nextIdx = (modes.indexOf(displayMode) + 1) % modes.length;
        setDisplayMode(modes[nextIdx]);
        return;
      }

      // Auto-scroll toggle
      if (ctrlOrMeta && e.shiftKey && e.key === "H") {
        e.preventDefault();
        setAutoScroll((a) => {
          toast(`Auto-scroll ${!a ? "enabled" : "disabled"}`);
          return !a;
        });
        return;
      }

      // Highlighting / Symbols
      if (e.shiftKey && e.key === "H") {
        const selection = window.getSelection();
        if (selection && selection.toString()) handleHighlightText(selection.toString(), []);
        return;
      }
      if (e.shiftKey && e.key === "S") {
        setPlacingSymbol(!placingSymbol);
        return;
      }

      // Navigation
      if (e.key === "ArrowRight") {
        if (e.shiftKey) navigateToPage((p) => Math.min(totalPages, p + 5));
        else navigateToPage((p) => Math.min(totalPages, p + 1));
      } else if (e.key === "ArrowLeft") {
        if (e.shiftKey) navigateToPage((p) => Math.max(1, p - 5));
        else navigateToPage((p) => Math.max(1, p - 1));
      } else if (e.key === "Home") {
        navigateToPage(1);
      } else if (e.key === "End") {
        navigateToPage(totalPages);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [
    totalPages, displayMode, navigateToPage, showSearch, autoScroll,
    handleToggleAutoFitWidth, handleHighlightText, placingSymbol, history,
    handleSave, setAutoScroll, setCurrentResultIdx, setDisplayMode,
    setPlacingSymbol, setRotation, setSearchResults, setShowSearch,
    setSidebarTab, setZoom,
  ]);

  /* Ctrl+scroll zoom */
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setZoom((z) => Math.max(0.4, Math.min(3, z - e.deltaY * 0.002)));
        zoomBeforeFit.current = null;
      }
    };
    document.addEventListener("wheel", handleWheel, { passive: false });
    return () => document.removeEventListener("wheel", handleWheel);
  }, [setZoom]);

  const handlePrint = useCallback(() => { printPdf(); }, []);
  const handleRotate = useCallback(() => { setRotation((r) => (r + 90) % 360); }, [setRotation]);

  const scrollClass = settings.scrollDirection === "horizontal"
    ? "flex flex-row items-center overflow-x-auto overflow-y-hidden"
    : "flex flex-1 flex-col items-center overflow-auto";

  return (
    <div className="flex h-screen flex-col bg-background">
      <ViewerToolbar
        title={file.name}
        onBack={handleBackWithCheck}
        currentPage={page}
        totalPages={totalPages}
        onPrevPage={navBack}
        onNextPage={navForward}
        onPageJump={navigateToPage}
        zoom={zoom}
        onZoomIn={() => {
          setZoom((z) => Math.min(3, z + 0.2));
          if (settings.autoFitWidth) {
            zoomBeforeFit.current = null;
            setSettings((prev) => ({ ...prev, autoFitWidth: false }));
          }
        }}
        onZoomOut={() => {
          setZoom((z) => Math.max(0.4, z - 0.2));
          if (settings.autoFitWidth) {
            zoomBeforeFit.current = null;
            setSettings((prev) => ({ ...prev, autoFitWidth: false }));
          }
        }}
        onFitWidth={handleFitWidth}
        onToggleAutoFitWidth={handleToggleAutoFitWidth}
        settings={settings}
        onSettingsChange={setSettings}
        onPrint={handlePrint}
        onRotatePage={handleRotate}
        onToggleBookmarks={() => setSidebarTab(sidebarTab === "bookmarks" ? null : "bookmarks")}
        onToggleHighlights={() => setSidebarTab(sidebarTab === "highlights" ? null : "highlights")}
        onToggleSymbols={() => setSidebarTab(sidebarTab === "symbols" ? null : "symbols")}
        bookmarksOpen={sidebarTab === "bookmarks"}
        highlightsOpen={sidebarTab === "highlights"}
        symbolsOpen={sidebarTab === "symbols"}
      >
        <div className="w-px h-5 bg-border mx-1" />

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={(e) => { e.preventDefault(); setShowSearch(!showSearch); }}
          title="Find (Ctrl+F)"
        >
          <Search className="h-4 w-4" />
        </Button>
        <Button
          variant={sidebarTab === "toc" ? "secondary" : "ghost"}
          size="icon" className="h-8 w-8"
          onClick={() => setSidebarTab(sidebarTab === "toc" ? null : "toc")}
          title="Table of contents"
        >
          <ListTree className="h-4 w-4" />
        </Button>
        <Button
          variant={sidebarTab === "thumbs" ? "secondary" : "ghost"}
          size="icon" className="h-8 w-8"
          onClick={() => setSidebarTab(sidebarTab === "thumbs" ? null : "thumbs")}
          title="Page thumbnails"
        >
          <GripVertical className="h-4 w-4" />
        </Button>
        <div className="w-px h-5 bg-border mx-1" />
        <Button
          variant="ghost" size="icon" className="h-8 w-8"
          onClick={() => setShowExportDialog(true)}
          title="Export Annotations"
        >
          <Download className="h-4 w-4" />
        </Button>
      </ViewerToolbar>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Left Sidebar */}
        {sidebarTab === "toc" && (
          <DocumentTocSidebar
            title="PDF contents" items={tocItems} isOpen={true}
            activeId={activeTocId} onClose={() => setSidebarTab(null)} onSelect={handleTocSelect}
          />
        )}
        {sidebarTab === "thumbs" && (
          <aside className="absolute inset-y-0 left-0 z-30 flex w-44 max-w-[85vw] flex-col border-r border-border glass-surface md:relative md:max-w-none md:shrink-0">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-xs font-medium text-foreground">Thumbnails</span>
              <Button variant="ghost" size="icon" className="h-6 w-6 md:hidden" onClick={() => setSidebarTab(null)}>
                <span className="text-xs">✕</span>
              </Button>
            </div>
            <PdfThumbnailPanel pdf={pdf} currentPage={page} onPageSelect={(p) => navigateToPage(p)} isOpen={true} />
          </aside>
        )}
        {sidebarTab === "bookmarks" && (
          <aside className="absolute inset-y-0 left-0 z-30 flex w-56 max-w-[85vw] flex-col border-r border-border glass-surface md:relative md:max-w-none md:shrink-0">
            <BookmarkPanel
              fileId={file.id} currentPage={page}
              onPageSelect={(p) => navigateToPage(p)}
              version={history.annotationVersion}
              onAdd={(pg, label) => history.doAddBookmark(pg, label).then(() => { setHasUnsavedChanges(true); })}
              onRemove={(id, bm) => history.doRemoveBookmark(id, bm).then(() => { setHasUnsavedChanges(true); })}
            />
          </aside>
        )}
        {sidebarTab === "highlights" && (
          <aside className="absolute inset-y-0 left-0 z-30 flex w-56 max-w-[85vw] flex-col border-r border-border glass-surface md:relative md:max-w-none md:shrink-0">
            <HighlightPanel
              fileId={file.id} currentPage={page}
              onPageSelect={(p) => navigateToPage(p)}
              activeColor={highlightColor} onColorChange={setHighlightColor}
              version={history.annotationVersion}
              onAnnotationChange={() => { /* version auto-bumped by hook */ }}
              onRemoveHighlight={(id, hl) => history.doRemoveHighlight(id, hl).then(() => { setHasUnsavedChanges(true); })}
            />
          </aside>
        )}
        {sidebarTab === "symbols" && (
          <aside className="absolute inset-y-0 left-0 z-30 flex w-56 max-w-[85vw] flex-col border-r border-border glass-surface md:relative md:max-w-none md:shrink-0">
            <SymbolPanel
              fileId={file.id} currentPage={page}
              onPageSelect={(p) => navigateToPage(p)}
              activeSymbol={activeSymbol} onSymbolChange={setActiveSymbol}
              placingSymbol={placingSymbol}
              onTogglePlacing={() => setPlacingSymbol((p) => !p)}
              version={history.annotationVersion}
              onAnnotationChange={() => { /* version auto-bumped by hook */ }}
            />
          </aside>
        )}

        <div className="relative flex-1 overflow-hidden">
          {error && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/95 px-8 text-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center">
                <ListTree className="h-6 w-6 text-destructive/60" />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-sm text-destructive font-medium">{error}</p>
                <p className="text-xs text-muted-foreground">Try opening another file.</p>
              </div>
              <Button variant="outline" size="sm" onClick={onBack}>
                Go Back
              </Button>
            </div>
          )}
          <div
            ref={viewportRef}
            className={`absolute inset-0 block ${scrollClass} ${placingSymbol ? "cursor-crosshair" : ""} p-4 md:p-8`}
            onClick={handleViewportClick}
          >
            <div ref={containerRef} className={`shrink-0 ${displayMode === "continuous" ? "space-y-4" : displayMode === "twopage" ? "flex flex-row justify-center gap-4" : ""}`}>
              {/* FIX: Render placeholders so scroll height is correct and virtualization has targets */}
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                <div
                  key={pageNum}
                  data-page-number={pageNum}
                  className="pdf-page relative mx-auto bg-white shadow-md transition-shadow hover:shadow-lg"
                  style={{
                    width: pageDimensions[pageNum]?.width ? `${(rotation === 90 || rotation === 270 ? pageDimensions[pageNum].height : pageDimensions[pageNum].width) * zoom}px` : "auto",
                    height: pageDimensions[pageNum]?.height ? `${(rotation === 90 || rotation === 270 ? pageDimensions[pageNum].width : pageDimensions[pageNum].height) * zoom}px` : (displayMode === "continuous" ? "800px" : "auto"),
                    display: displayMode === "continuous" ? "block" : 
                             displayMode === "single" ? (page === pageNum ? "block" : "none") : 
                             ((pageNum === (page % 2 === 0 ? page - 1 : page)) || (pageNum === (page % 2 === 0 ? page - 1 : page) + 1)) ? "block" : "none",
                  }}
                />
              ))}
            </div>
          </div>

          <PdfContextMenu
            containerRef={viewportRef}
            onSearchText={handleSearchFromContext}
            onHighlightText={handleHighlightText}
            onDefineText={handleDefine}
            onBookmarkPage={handleBookmarkPage}
            highlightColor={highlightColor}
          />
          <PdfSearchBar
            isOpen={showSearch}
            onClose={() => {
              setShowSearch(false);
              setSearchBarSeed("");
              setSearchResults([]);
              setCurrentResultIdx(0);
              setSearchQuery("");
            }}
            onSearch={handleSearch}
            onNextResult={handleNextResult}
            onPrevResult={handlePrevResult}
            currentResult={currentResultIdx}
            totalResults={searchResults.length}
            seed={searchBarSeed}
          />
        </div>
      </div>

      <PdfStatusBar
        currentPage={page} totalPages={totalPages}
        displayMode={displayMode} onDisplayModeChange={setDisplayMode}
        zoom={zoom}
        hasUnsavedChanges={hasUnsavedChanges}
      />

      <UnsavedChangesDialog
        isOpen={showUnsavedDialog}
        onClose={() => setShowUnsavedDialog(false)}
        onSave={() => {
          handleSave();
          setShowUnsavedDialog(false);
          onBack();
        }}
        onDiscard={() => {
          setHasUnsavedChanges(false);
          setShowUnsavedDialog(false);
          onBack();
        }}
      />

      {dictionaryQuery && (
        <DictionaryPopover
          word={dictionaryQuery.word}
          definitions={dictionaryQuery.results}
          position={{ x: dictionaryQuery.x, y: dictionaryQuery.y }}
          onClose={() => setDictionaryQuery(null)}
        />
      )}

      <ExportDialog
        isOpen={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        fileId={file.id}
        fileName={file.name}
      />
    </div>
  );
}
