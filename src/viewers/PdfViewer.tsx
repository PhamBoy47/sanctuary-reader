import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import * as pdfjsLib from "pdfjs-dist";
import "pdfjs-dist/web/pdf_viewer.css";
import { ListTree, Search, ChevronLeft, ChevronRight, GripVertical } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  addBookmark, addHighlight, addSymbolAnnotation,
  getHighlights, getSymbolAnnotations,
  type Highlight, type SymbolAnnotation,
} from "@/lib/annotationStore";
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { toast } from "sonner";
import type { FileEntry } from "@/lib/fileStore";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

/* ── TOC helpers ─────────────────────────────────────────────────── */

interface PdfTocItem extends TocItem {
  children?: PdfTocItem[];
  dest?: unknown;
  page?: number | null;
  url?: string | null;
}

type PageSetter = Dispatch<SetStateAction<number>>;

async function resolvePdfDestination(doc: pdfjsLib.PDFDocumentProxy, dest: any): Promise<number | null> {
  if (!dest) return null;
  const resolvedDest = typeof dest === "string" ? await doc.getDestination(dest) : dest;
  if (!Array.isArray(resolvedDest) || resolvedDest.length === 0) return null;
  const target = resolvedDest[0];
  if (typeof target === "number") return target + 1;
  if (target && typeof target === "object") return (await doc.getPageIndex(target)) + 1;
  return null;
}

async function mapPdfOutlineItems(
  doc: pdfjsLib.PDFDocumentProxy, outline: any[], prefix = "toc",
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

async function printPdf(pdfDoc: pdfjsLib.PDFDocumentProxy) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.write("<html><head><title>Print PDF</title><style>@media print { @page { margin: 0; } body { margin: 0; } canvas { page-break-after: always; display: block; width: 100%; } canvas:last-child { page-break-after: auto; } } body { margin: 0; background: white; }</style></head><body></body></html>");
  printWindow.document.close();
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = printWindow.document.createElement("canvas");
    canvas.width = viewport.width; canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    printWindow.document.body.appendChild(canvas);
  }
  setTimeout(() => { printWindow.focus(); printWindow.print(); }, 500);
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
    const pageText = content.items.map((item: any) => item.str).join(" ").toLowerCase();
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
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const pageRef = useRef(1);
  const [totalPages, setTotalPages] = useState(0);
  const [zoom, setZoom] = useState(1.2);
  const [rotation, setRotation] = useState(0);
  const [sidebarTab, setSidebarTab] = useState<"toc" | "thumbs" | "bookmarks" | "highlights" | "symbols" | null>(null);
  const [tocItems, setTocItems] = useState<PdfTocItem[]>([]);
  const [settings, setSettings] = useState<PdfSettings>(defaultSettings);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("continuous");
  const zoomBeforeFit = useRef<number | null>(null);

  // FIX 3 & 4: Removed isRenderingRef entirely — it was gating the scroll observer
  // and causing the race condition. All rendering is now fire-and-forget; the
  // scroll observer only gates on isNavigating.current for programmatic jumps.

  // FIX 4: Single canonical set of refs (duplicates removed from below)
  const renderedPagesRef = useRef<Set<number>>(new Set());
  const abortControllersRef = useRef<Map<number, AbortController>>(new Map());

  // FIX 4: Initialize with first 3 pages so initial render isn't blank
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set([1, 2, 3]));

  // FIX 6: Scroll anchor — saves which page + fractional offset within that page
  // so we can restore the visual scroll position after a zoom/rotation rebuild.
  const scrollAnchorRef = useRef<{ pageNum: number; offsetFraction: number } | null>(null);

  // Reading progress persistence
  useEffect(() => {
    if (pdf && file.id) {
      const savedPage = localStorage.getItem(`pdf-progress-${file.id}`);
      if (savedPage) {
        const p = parseInt(savedPage, 10);
        if (p > 0 && p <= pdf.numPages) {
          setPage(p);
          isNavigating.current = true;
        }
      }
    }
  }, [pdf, file.id]);

  useEffect(() => {
    if (file.id && page > 0) {
      localStorage.setItem(`pdf-progress-${file.id}`, page.toString());
    }
  }, [file.id, page]);

  // Keep pageRef in sync with page state
  useEffect(() => { pageRef.current = page; }, [page]);

  // Navigation history
  const [navHistory, setNavHistory] = useState<number[]>([1]);
  const [navIndex, setNavIndex] = useState(0);
  const isNavJump = useRef(false);
  const isNavigating = useRef(false);

  // FIX 1: showSearch is pure UI state — toggling it must NOT trigger any
  // effect that touches containerRef or resetss scroll. We ensure this by
  // keeping it out of every effect dependency array that touches the DOM.
  const [showSearch, setShowSearch] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [currentResultIdx, setCurrentResultIdx] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");

  // Annotation state
  const [highlightColor, setHighlightColor] = useState("rgb(255,235,59)");
  const [activeSymbol, setActiveSymbol] = useState("⭐");
  const [placingSymbol, setPlacingSymbol] = useState(false);

  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [symbolAnnotations, setSymbolAnnotations] = useState<SymbolAnnotation[]>([]);
  const [annotationVersion, setAnnotationVersion] = useState(0);
  const [placeholdersVersion, setPlaceholdersVersion] = useState(0);

  const reloadAnnotations = useCallback(async () => {
    const [hl, sa] = await Promise.all([
      getHighlights(file.id),
      getSymbolAnnotations(file.id),
    ]);
    setHighlights(hl);
    setSymbolAnnotations(sa);
  }, [file.id]);

  useEffect(() => { reloadAnnotations(); }, [reloadAnnotations, annotationVersion]);

  /* Load PDF — depends only on file.data so new-file changes are isolated */
  useEffect(() => {
    let cancelled = false;
    // Reset all per-document state when file changes
    renderedPagesRef.current.clear();
    abortControllersRef.current.forEach(c => c.abort());
    abortControllersRef.current.clear();
    scrollAnchorRef.current = null;

    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(file.data) });
    loadingTask.promise
      .then(async (doc) => {
        if (cancelled) return;
        setPdf(doc);
        setTotalPages(doc.numPages);
        setPage(1);
        const outline = await doc.getOutline();
        if (!cancelled) setTocItems(outline ? await mapPdfOutlineItems(doc, outline) : []);
      })
      .catch((error) => { if (!cancelled) console.error("Failed to load PDF", error); });
    return () => { cancelled = true; loadingTask.destroy(); };
  }, [file.data]);

  /* Navigation history */
  const navigateToPage = useCallback((p: number | ((prev: number) => number)) => {
    isNavigating.current = true;
    setPage((prevPage) => {
      const newPage = typeof p === "function" ? p(prevPage) : p;
      if (!isNavJump.current && newPage !== prevPage) {
        setNavHistory((h) => { const newH = h.slice(0, navIndex + 1); newH.push(newPage); return newH; });
        setNavIndex((i) => i + 1);
      }
      isNavJump.current = false;
      return newPage;
    });
  }, [navIndex]);

  const navBack = useCallback(() => {
    if (navIndex > 0) {
      isNavJump.current = true;
      isNavigating.current = true;
      const newIdx = navIndex - 1;
      setNavIndex(newIdx);
      setPage(navHistory[newIdx]);
    }
  }, [navIndex, navHistory]);

  const navForward = useCallback(() => {
    if (navIndex < navHistory.length - 1) {
      isNavJump.current = true;
      isNavigating.current = true;
      const newIdx = navIndex + 1;
      setNavIndex(newIdx);
      setPage(navHistory[newIdx]);
    }
  }, [navIndex, navHistory]);

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
  }, [pdf, navigateToPage]);

  /* Fit width */
  const handleFitWidth = useCallback(async () => {
    if (!pdf || !viewportRef.current) return;
    const currentPage = await pdf.getPage(page);
    const baseViewport = currentPage.getViewport({ scale: 1 });
    const availableWidth = Math.max(viewportRef.current.clientWidth - 32, 240);
    setZoom(Math.max(0.4, Math.min(3, availableWidth / baseViewport.width)));
  }, [page, pdf]);

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
  }, [settings.autoFitWidth, zoom]);

  useEffect(() => { if (settings.autoFitWidth) handleFitWidth(); }, [settings.autoFitWidth, handleFitWidth]);

  useEffect(() => {
    if (!settings.autoFitWidth || !viewportRef.current) return;
    const ro = new ResizeObserver(() => handleFitWidth());
    ro.observe(viewportRef.current);
    return () => ro.disconnect();
  }, [settings.autoFitWidth, handleFitWidth]);

  /* Search */
  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (!pdf || !query.trim()) { setSearchResults([]); setCurrentResultIdx(0); return; }
    const results = await searchPdf(pdf, query);
    setSearchResults(results);
    setCurrentResultIdx(results.length > 0 ? 1 : 0);
    // Only navigate if the first result is on a DIFFERENT page to prevent reset loops
    if (results.length > 0 && results[0].page !== pageRef.current) {
      navigateToPage(results[0].page);
    }
  }, [pdf, navigateToPage]);

  const handleNextResult = useCallback(() => {
    if (searchResults.length === 0) return;
    const next = currentResultIdx >= searchResults.length ? 1 : currentResultIdx + 1;
    setCurrentResultIdx(next);
    navigateToPage(searchResults[next - 1].page);
  }, [searchResults, currentResultIdx, navigateToPage]);

  const handlePrevResult = useCallback(() => {
    if (searchResults.length === 0) return;
    const prev = currentResultIdx <= 1 ? searchResults.length : currentResultIdx - 1;
    setCurrentResultIdx(prev);
    navigateToPage(searchResults[prev - 1].page);
  }, [searchResults, currentResultIdx, navigateToPage]);

  // FIX 1 + FIX 5: When the search query changes we only need to redraw the
  // highlight overlay — we must NOT clear renderedPagesRef (that would cause
  // the structural effect to re-render all page canvases and jump scroll to
  // the top). The overlay effect below is the sole owner of search highlights.
  // (Removed the old `renderedPagesRef.current.clear()` call that was here.)
  useEffect(() => {
    // Only bump annotation version to trigger overlay redraw, nothing else.
    setAnnotationVersion(v => v + 1);
  }, [searchQuery]);

  const handleSearchFromContext = useCallback((text: string) => {
    setShowSearch(true);
    handleSearch(text);
  }, [handleSearch]);

  /* Highlight from context menu */
  const handleHighlightText = useCallback(async (text: string, rects: Highlight["rects"]) => {
    await addHighlight(file.id, page, highlightColor, text, rects);
    toast.success("Text highlighted");
    setAnnotationVersion((v) => v + 1);
  }, [file.id, page, highlightColor]);

  /* Bookmark from context menu */
  const handleBookmarkPage = useCallback(async () => {
    await addBookmark(file.id, page);
    toast.success(`Bookmarked page ${page}`);
    setAnnotationVersion((v) => v + 1);
  }, [file.id, page]);

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
    await addSymbolAnnotation(file.id, pageNum, activeSymbol, x, y);
    toast.success("Symbol placed");
    setAnnotationVersion((v) => v + 1);
  }, [placingSymbol, file.id, activeSymbol]);

  /* Render pages (Structural & Canvas) */
  const renderTrigger = displayMode === "continuous" ? "all" : String(page);

  // ─── Core Render Function (Imperative) ──────────────────────────────────────
  // FIX 2: Text layer spans get explicit inline styles for line-height,
  // transform-origin, and color so Tailwind's global resets can't override
  // the pdf.js coordinate system. This prevents multi-line selection bleed.
  const renderPage = useCallback(async (pageNum: number, wrapper: HTMLElement, outputScale: number) => {
    if (!pdf) return;

    // Cancel any in-flight render for this page
    if (abortControllersRef.current.has(pageNum)) {
      abortControllersRef.current.get(pageNum)?.abort();
    }
    const controller = new AbortController();
    abortControllersRef.current.set(pageNum, controller);

    try {
      const pdfPage = await pdf.getPage(pageNum);
      const viewport = pdfPage.getViewport({ scale: zoom, rotation });

      // FIX 6: Only remove canvas/layer children — never remove the wrapper itself
      wrapper.querySelectorAll('.pdf-canvas, .textLayer, .annotationLayer, .symbol-layer').forEach(el => el.remove());

      const canvas = document.createElement("canvas");
      canvas.className = "pdf-canvas";
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return;
      wrapper.appendChild(canvas);

      if (settings.enableTextSelection) {
        const textDiv = document.createElement("div");
        textDiv.className = "textLayer";
        // FIX 2: Explicit dimensions so the layer matches the canvas pixel-perfect
        textDiv.style.width = `${viewport.width}px`;
        textDiv.style.height = `${viewport.height}px`;
        textDiv.style.setProperty("--scale-factor", String(viewport.scale));
        textDiv.style.setProperty("--total-scale-factor", String(viewport.scale));
        wrapper.appendChild(textDiv);
      }

      if (settings.showAnnotations) {
        const annotationDiv = document.createElement("div");
        annotationDiv.className = "annotationLayer";
        annotationDiv.style.setProperty("--scale-factor", `${viewport.scale}`);
        wrapper.appendChild(annotationDiv);
      }

      // Symbol overlays
      const pageSymbols = symbolAnnotations.filter((s) => s.page === pageNum);
      if (pageSymbols.length > 0) {
        const symOverlay = document.createElement("div");
        symOverlay.className = "symbol-layer absolute inset-0 pointer-events-none z-[5]";
        pageSymbols.forEach((s) => {
          const el = document.createElement("div");
          el.className = "absolute text-lg";
          el.style.left = `${s.x * 100}%`;
          el.style.top = `${s.y * 100}%`;
          el.style.transform = "translate(-50%, -50%)";
          el.textContent = s.symbol;
          symOverlay.appendChild(el);
        });
        wrapper.appendChild(symOverlay);
      }

      if (controller.signal.aborted) return;

      const renderTask = pdfPage.render({
        annotationMode: settings.showAnnotations ? pdfjsLib.AnnotationMode.ENABLE_FORMS : pdfjsLib.AnnotationMode.DISABLE,
        canvasContext: ctx,
        canvas,
        transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
        viewport,
      });
      await renderTask.promise;

      if (controller.signal.aborted) return;

      if (settings.enableTextSelection) {
        const textDiv = wrapper.querySelector(".textLayer") as HTMLDivElement;
        if (textDiv) {
          const textContent = await pdfPage.getTextContent();
          if (controller.signal.aborted) return;

          const textLayer = new pdfjsLib.TextLayer({
            container: textDiv,
            textContentSource: textContent,
            viewport,
          });
          await textLayer.render();

          // FIX 2: After pdf.js renders span elements, enforce critical styles
          // inline so Tailwind base resets (which set line-height on * or body)
          // cannot bleed through and misalign the hit-boxes. These must be
          // applied AFTER render() because pdf.js creates the spans during render.
          textDiv.querySelectorAll<HTMLElement>("span, br").forEach((span) => {
            span.style.lineHeight = "1";
            span.style.transformOrigin = "0% 0%";
            span.style.color = "transparent";
            span.style.whiteSpace = "pre";
            span.style.cursor = "text";
            span.style.position = "absolute";
          });
        }
      }

      if (settings.showAnnotations) {
        const annotationDiv = wrapper.querySelector(".annotationLayer") as HTMLDivElement;
        if (annotationDiv) {
          const annotations = await pdfPage.getAnnotations();
          if (controller.signal.aborted || annotations.length === 0) {
            annotationDiv.hidden = annotations.length === 0;
          } else {
            const linkService = createPdfLinkService(pdf!, navigateToPage as any, totalPages) as any;
            const annotationLayer = new pdfjsLib.AnnotationLayer({
              div: annotationDiv,
              page: pdfPage,
              viewport: viewport.clone({ dontFlip: true }),
              linkService,
              annotationStorage: (pdf as any).annotationStorage,
            } as any);
            await annotationLayer.render({
              annotations,
              viewport: viewport.clone({ dontFlip: true }),
              div: annotationDiv,
              page: pdfPage,
              linkService,
              renderForms: true,
            } as any);
          }
        }
      }

      renderedPagesRef.current.add(pageNum);
    } catch (err) {
      if ((err as Error).name !== 'RenderingCancelledException') {
        console.error(`Error rendering page ${pageNum}:`, err);
      }
    }
  }, [pdf, zoom, rotation, settings, symbolAnnotations, navigateToPage, totalPages]);

  // Synchronize a stable ref for callbacks that run outside the React cycle (virtualization)
  const renderPageRef = useRef(renderPage);
  useEffect(() => { renderPageRef.current = renderPage; }, [renderPage]);

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
        // Save position BEFORE any layout mutation
        saveScrollAnchor();

        // Build a map of existing wrappers so we can reuse them
        const existingMap = new Map<number, HTMLElement>();
        container.querySelectorAll<HTMLElement>(".pdf-page").forEach(el => {
          existingMap.set(Number(el.dataset.pageNumber), el);
        });

        // Only nuke and rebuild from scratch if page-count changed (new file)
        if (existingMap.size !== totalPages) {
          container.replaceChildren();
          renderedPagesRef.current.clear();
          abortControllersRef.current.forEach(c => c.abort());
          abortControllersRef.current.clear();
          existingMap.clear();
        }

        // Update/create wrappers for every page
        for (let i = 1; i <= totalPages; i++) {
          if (cancelled) return;
          const pdfPage = await pdf.getPage(i);
          const viewport = pdfPage.getViewport({ scale: zoom, rotation });

          let wrapper = existingMap.get(i);
          const isNew = !wrapper;
          if (!wrapper) {
            wrapper = document.createElement("div");
            wrapper.className = "pdf-page relative overflow-hidden bg-muted/5";
            wrapper.dataset.pageNumber = String(i);
            container.appendChild(wrapper);
          }

          const newW = `${viewport.width}px`;
          const newH = `${viewport.height}px`;
          const dimensionsChanged = wrapper.style.width !== newW || wrapper.style.height !== newH;

          wrapper.style.width = newW;
          wrapper.style.height = newH;
          wrapper.style.setProperty("--scale-factor", String(viewport.scale));
          wrapper.style.setProperty("--total-scale-factor", String(viewport.scale));
          wrapper.style.setProperty("--user-unit", "1");

          const filter = getPageFilter(settings);
          wrapper.style.filter = filter !== "none" ? filter : "";

          // FIX 6: If dimensions changed (zoom/rotation), invalidate canvases
          // for this wrapper so the scroll handler re-renders them. We do NOT
          // destroy the wrapper itself — the DOM node stays, preserving layout.
          if (!isNew && dimensionsChanged) {
            wrapper.querySelectorAll('.pdf-canvas, .textLayer, .annotationLayer, .symbol-layer').forEach(el => el.remove());
            renderedPagesRef.current.delete(i);
            if (abortControllersRef.current.has(i)) {
              abortControllersRef.current.get(i)?.abort();
              abortControllersRef.current.delete(i);
            }
          }
        }

        setPlaceholdersVersion((v) => v + 1);

        // FIX 6: Restore scroll position synchronously in the next frame
        // (after the browser has applied the new layout dimensions)
        if (scrollAnchorRef.current) {
          const { pageNum, offsetFraction } = scrollAnchorRef.current;
          requestAnimationFrame(() => {
            const anchorEl = container.querySelector<HTMLElement>(`[data-page-number="${pageNum}"]`);
            if (anchorEl && viewportRef.current) {
              viewportRef.current.scrollTop =
                anchorEl.offsetTop + anchorEl.offsetHeight * offsetFraction;
            }
            scrollAnchorRef.current = null;
          });
        }

        // Render pages that are already in the virtual window
        const wrappers = container.querySelectorAll<HTMLElement>(".pdf-page");
        for (const p of visiblePages) {
          if (cancelled) return;
          const w = wrappers[p - 1];
          if (w && !renderedPagesRef.current.has(p)) {
            renderPage(p, w, outputScale);
          }
        }

      } else {
        // Single / two-page mode: always rebuild (small DOM, no perf concern)
        container.replaceChildren();
        renderedPagesRef.current.clear();
        abortControllersRef.current.forEach(c => c.abort());
        abortControllersRef.current.clear();

        if (displayMode === "twopage") {
          const row = document.createElement("div");
          row.className = "flex gap-4 items-start";
          container.appendChild(row);
          const startPage = page % 2 === 0 ? page - 1 : page;

          const p1 = await pdf.getPage(startPage);
          const vp1 = p1.getViewport({ scale: zoom, rotation });
          const wrapper1 = document.createElement("div");
          wrapper1.className = "pdf-page relative overflow-hidden bg-muted/5";
          wrapper1.dataset.pageNumber = String(startPage);
          wrapper1.style.width = `${vp1.width}px`;
          wrapper1.style.height = `${vp1.height}px`;
          row.appendChild(wrapper1);
          renderPage(startPage, wrapper1, outputScale);

          if (startPage + 1 <= totalPages) {
            const p2 = await pdf.getPage(startPage + 1);
            const vp2 = p2.getViewport({ scale: zoom, rotation });
            const wrapper2 = document.createElement("div");
            wrapper2.className = "pdf-page relative overflow-hidden bg-muted/5";
            wrapper2.dataset.pageNumber = String(startPage + 1);
            wrapper2.style.width = `${vp2.width}px`;
            wrapper2.style.height = `${vp2.height}px`;
            row.appendChild(wrapper2);
            renderPage(startPage + 1, wrapper2, outputScale);
          }
        } else {
          const p = await pdf.getPage(page);
          const vp = p.getViewport({ scale: zoom, rotation });
          const wrapper = document.createElement("div");
          wrapper.className = "pdf-page relative overflow-hidden bg-muted/5";
          wrapper.dataset.pageNumber = String(page);
          wrapper.style.width = `${vp.width}px`;
          wrapper.style.height = `${vp.height}px`;
          container.appendChild(wrapper);
          renderPage(page, wrapper, outputScale);
        }
      }
    };

    buildStructure();
    return () => { cancelled = true; };
  }, [displayMode, zoom, rotation, pdf, totalPages, renderTrigger, settings.brightness, settings.invertColors, settings.pageBackground]);

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

          const textContent = await pdfPage.getTextContent();
          if (cancelled) return;

          const fullText = textContent.items.map((it: any) => it.str).join("");
          const lowerFull = fullText.toLowerCase();
          const lowerQ = searchQuery.toLowerCase();

          // Build item offset map once
          const offsets: number[] = [];
          let cursor = 0;
          textContent.items.forEach((it: any) => {
            offsets.push(cursor);
            cursor += (it.str || "").length;
          });

          let pos = lowerFull.indexOf(lowerQ);
          while (pos !== -1) {
            hasMatch = true;
            const matchEnd = pos + lowerQ.length;

            // Find all items that intersect with this match [pos, matchEnd]
            for (let i = 0; i < textContent.items.length; i++) {
              const item = textContent.items[i] as any;
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
                const totalLen = item.str.length || 1;
                
                const relativeStart = overlapStart - itemStart;
                const relativeEnd = overlapEnd - itemStart;
                
                const startFrac = relativeStart / totalLen;
                const widthFrac = (relativeEnd - relativeStart) / totalLen;
                const spanW = Math.abs(tx2 - tx);

                const rect = document.createElement("div");
                rect.className = "absolute bg-yellow-400/40 border border-yellow-500/50 rounded-sm";
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
          }

          if (hasMatch) wrapper.appendChild(searchOverlay);
        }
      }
    };

    drawOverlays();
    return () => { cancelled = true; };
  }, [searchQuery, highlights, visiblePages, zoom, displayMode, rotation, pdf]);

  /* Scroll to page on external nav in continuous mode */
  useEffect(() => {
    if (displayMode === "continuous" && isNavigating.current && containerRef.current) {
      const pageEl = containerRef.current.querySelector(`.pdf-page[data-page-number="${page}"]`);
      if (pageEl) {
        pageEl.scrollIntoView({ behavior: "auto", block: "start" });
      }
    }
    const timer = setTimeout(() => { isNavigating.current = false; }, 150);
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
      const windowMin = Math.max(1, bestPage - VIRTUAL_BUFFER);
      const windowMax = Math.min(totalPages, bestPage + VIRTUAL_BUFFER);

      const newVisiblePages = new Set<number>();
      for (let p = windowMin; p <= windowMax; p++) newVisiblePages.add(p);

      // Unmount pages outside the virtual window
      for (let i = 0; i < pages.length; i++) {
        const pageEl = pages[i];
        const pageNum = Number(pageEl.dataset.pageNumber);
        if (!newVisiblePages.has(pageNum) && renderedPagesRef.current.has(pageNum)) {
          pageEl.querySelectorAll('.pdf-canvas, .textLayer, .annotationLayer, .symbol-layer').forEach(el => el.remove());
          renderedPagesRef.current.delete(pageNum);
          if (abortControllersRef.current.has(pageNum)) {
            abortControllersRef.current.get(pageNum)?.abort();
            abortControllersRef.current.delete(pageNum);
          }
        }
      }

      setVisiblePages(prev => {
        if (prev.size === newVisiblePages.size && [...newVisiblePages].every(p => prev.has(p))) return prev;
        return newVisiblePages;
      });

      // Mount canvases for newly visible pages
      const outputScale = window.devicePixelRatio || 1;
      newVisiblePages.forEach(p => {
        if (!renderedPagesRef.current.has(p)) {
          const wrapper = containerRef.current!.querySelector<HTMLElement>(`[data-page-number="${p}"]`);
          if (wrapper) renderPageRef.current(p, wrapper, outputScale);  // ← ref call
        }
      });

      // FIX 3: Update page indicator only when scroll is user-driven
      if (bestPage && bestPage !== pageRef.current && !isNavigating.current) {
        setPage(bestPage);
      }

      ticking = false;
    };

    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(updatePageNumber);
        ticking = true;
      }
    };

    scrollContainer.addEventListener("scroll", handleScroll, { passive: true });
    // Run once on mount / dependency change to bootstrap the virtual window
    handleScroll();

    return () => scrollContainer.removeEventListener("scroll", handleScroll);
  }, [displayMode, totalPages, placeholdersVersion]);

  /* Keyboard nav */
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditable = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable;
      if (isEditable && e.key !== "Escape" && !(e.ctrlKey || e.metaKey)) return;

      // FIX 1: e.preventDefault() on Ctrl+F prevents any form-like default
      if ((e.ctrlKey || e.metaKey) && e.key === "f") { e.preventDefault(); setShowSearch(true); return; }
      if (e.key === "Escape" && showSearch) { setShowSearch(false); setSearchResults([]); setCurrentResultIdx(0); return; }

      const step = displayMode === "twopage" ? 2 : 1;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        navigateToPage((p) => Math.min(totalPages, p + step));
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        navigateToPage((p) => Math.max(1, p - step));
      } else if (e.key === "Home") {
        navigateToPage(1);
      } else if (e.key === "End") {
        navigateToPage(totalPages);
      } else if (e.key === "PageDown" || e.key === " ") {
        if (e.key === " ") e.preventDefault();
        navigateToPage((p) => Math.min(totalPages, p + step));
      } else if (e.key === "PageUp") {
        navigateToPage((p) => Math.max(1, p - step));
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [totalPages, displayMode, navigateToPage, showSearch]);

  /* Ctrl+scroll zoom */
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setZoom((z) => Math.max(0.4, Math.min(3, z - e.deltaY * 0.002)));
        if (settings.autoFitWidth) {
          zoomBeforeFit.current = null;
          setSettings((prev) => ({ ...prev, autoFitWidth: false }));
        }
      }
    };
    document.addEventListener("wheel", handleWheel, { passive: false });
    return () => document.removeEventListener("wheel", handleWheel);
  }, [settings.autoFitWidth]);

  const handlePrint = useCallback(() => { if (pdf) printPdf(pdf); }, [pdf]);
  const handleRotate = useCallback(() => { setRotation((r) => (r + 90) % 360); }, []);

  const scrollClass = settings.scrollDirection === "horizontal"
    ? "flex flex-row items-center overflow-x-auto overflow-y-hidden"
    : "flex flex-1 flex-col items-center overflow-auto";

  return (
    <div className="flex h-screen flex-col bg-background">
      <ViewerToolbar
        title={file.name}
        onBack={onBack}
        currentPage={page}
        totalPages={totalPages}
        onPrevPage={() => {
          const step = displayMode === "twopage" ? 2 : 1;
          navigateToPage((prev) => Math.max(1, prev - step));
        }}
        onNextPage={() => {
          const step = displayMode === "twopage" ? 2 : 1;
          navigateToPage((prev) => Math.min(totalPages, prev + step));
        }}
        onPageJump={(p) => navigateToPage(p)}
        zoom={zoom}
        onZoomIn={() => {
          setZoom((z) => Math.min(3, z + 0.2));
          if (settings.autoFitWidth) {
            zoomBeforeFit.current = null;
            setSettings({ ...settings, autoFitWidth: false });
          }
        }}
        onZoomOut={() => {
          setZoom((z) => Math.max(0.4, z - 0.2));
          if (settings.autoFitWidth) {
            zoomBeforeFit.current = null;
            setSettings({ ...settings, autoFitWidth: false });
          }
        }}
        onFitWidth={handleFitWidth}
        onToggleAutoFitWidth={handleToggleAutoFitWidth}
        settings={settings}
        onSettingsChange={setSettings}
        onPrint={handlePrint}
        onRotatePage={handleRotate}
        onToggleBookmarks={() => setSidebarTab((t) => t === "bookmarks" ? null : "bookmarks")}
        onToggleHighlights={() => setSidebarTab((t) => t === "highlights" ? null : "highlights")}
        onToggleSymbols={() => setSidebarTab((t) => t === "symbols" ? null : "symbols")}
        bookmarksOpen={sidebarTab === "bookmarks"}
        highlightsOpen={sidebarTab === "highlights"}
        symbolsOpen={sidebarTab === "symbols"}
      >
        {/* Nav history */}
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={navBack} disabled={navIndex <= 0} title="Previous view">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={navForward} disabled={navIndex >= navHistory.length - 1} title="Next view">
          <ChevronRight className="h-4 w-4" />
        </Button>

        <div className="w-px h-5 bg-border mx-1" />

        {/* FIX 1: type="button" prevents any ancestor <form> from treating
            this as a submit trigger. onClick with setShowSearch is pure UI
            state — it does not affect any PDF rendering effect. */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={(e) => { e.preventDefault(); setShowSearch((o) => !o); }}
          title="Find (Ctrl+F)"
        >
          <Search className="h-4 w-4" />
        </Button>
        <Button
          variant={sidebarTab === "toc" ? "secondary" : "ghost"}
          size="icon" className="h-8 w-8"
          onClick={() => setSidebarTab((t) => t === "toc" ? null : "toc")}
          title="Table of contents"
        >
          <ListTree className="h-4 w-4" />
        </Button>
        <Button
          variant={sidebarTab === "thumbs" ? "secondary" : "ghost"}
          size="icon" className="h-8 w-8"
          onClick={() => setSidebarTab((t) => t === "thumbs" ? null : "thumbs")}
          title="Page thumbnails"
        >
          <GripVertical className="h-4 w-4" />
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
            <BookmarkPanel fileId={file.id} currentPage={page} onPageSelect={(p) => navigateToPage(p)} version={annotationVersion} />
          </aside>
        )}
        {sidebarTab === "highlights" && (
          <aside className="absolute inset-y-0 left-0 z-30 flex w-56 max-w-[85vw] flex-col border-r border-border glass-surface md:relative md:max-w-none md:shrink-0">
            <HighlightPanel
              fileId={file.id} currentPage={page}
              onPageSelect={(p) => navigateToPage(p)}
              activeColor={highlightColor} onColorChange={setHighlightColor}
              version={annotationVersion}
              onAnnotationChange={() => setAnnotationVersion((v) => v + 1)}
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
              version={annotationVersion}
              onAnnotationChange={() => setAnnotationVersion((v) => v + 1)}
            />
          </aside>
        )}

        {/* Canvas */}
        <div
          ref={viewportRef}
          className={`relative flex-1 ${scrollClass} ${placingSymbol ? "cursor-crosshair" : ""} p-4 md:p-8`}
          onClick={handleViewportClick}
        >
          <div ref={containerRef} className={`shrink-0 ${displayMode === "continuous" ? "space-y-4" : ""}`} />
          <PdfContextMenu
            containerRef={viewportRef}
            onSearchText={handleSearchFromContext}
            onHighlightText={handleHighlightText}
            onBookmarkPage={handleBookmarkPage}
            highlightColor={highlightColor}
          />
          <PdfSearchBar
            isOpen={showSearch}
            onClose={() => { setShowSearch(false); setSearchResults([]); setCurrentResultIdx(0); setSearchQuery(""); }}
            onSearch={handleSearch}
            onNextResult={handleNextResult}
            onPrevResult={handlePrevResult}
            currentResult={currentResultIdx}
            totalResults={searchResults.length}
          />
        </div>
      </div>

      <PdfStatusBar
        currentPage={page} totalPages={totalPages}
        displayMode={displayMode} onDisplayModeChange={setDisplayMode}
        zoom={zoom}
      />
    </div>
  );
}