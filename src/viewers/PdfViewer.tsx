import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { ListTree, Search, ChevronLeft, ChevronRight, Hand, MousePointer2, GripVertical } from "lucide-react";
import { DocumentTocSidebar, type TocItem } from "@/components/DocumentTocSidebar";
import { ViewerToolbar } from "@/components/ViewerToolbar";
import { PdfSettingsPanel, defaultSettings, type PdfSettings } from "@/components/PdfSettingsPanel";
import { PdfStatusBar, type DisplayMode } from "@/components/PdfStatusBar";
import { PdfSearchBar } from "@/components/PdfSearchBar";
import { PdfThumbnailPanel } from "@/components/PdfThumbnailPanel";
import { PdfContextMenu } from "@/components/PdfContextMenu";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { FileEntry } from "@/lib/fileStore";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

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
  doc: pdfjsLib.PDFDocumentProxy,
  outline: any[],
  prefix = "toc",
): Promise<PdfTocItem[]> {
  return Promise.all(
    outline.map(async (item, index) => {
      const id = `${prefix}-${index}`;
      const pageNumber = item.dest ? await resolvePdfDestination(doc, item.dest).catch(() => null) : null;
      return {
        id,
        label: item.title?.trim() || "Untitled section",
        hint: pageNumber ? `Page ${pageNumber}` : undefined,
        page: pageNumber,
        dest: item.dest,
        url: item.url ?? null,
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
      link.href = url;
      link.target = newWindow ? "_blank" : "_self";
      link.rel = "noopener noreferrer";
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
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport }).promise;
    printWindow.document.body.appendChild(canvas);
  }
  setTimeout(() => { printWindow.focus(); printWindow.print(); }, 500);
}

/* ── Search helpers ──────────────────────────────────────────────── */

interface SearchResult { page: number; index: number; }

async function searchPdf(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  query: string,
): Promise<SearchResult[]> {
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

interface PdfViewerProps {
  file: FileEntry;
  onBack: () => void;
}

export function PdfViewer({ file, onBack }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [zoom, setZoom] = useState(1.2);
  const [rotation, setRotation] = useState(0);
  const [sidebarTab, setSidebarTab] = useState<"toc" | "thumbs" | null>(null);
  const [tocItems, setTocItems] = useState<PdfTocItem[]>([]);
  const [settings, setSettings] = useState<PdfSettings>(defaultSettings);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("single");
  const [tool, setTool] = useState<"select" | "hand">("select");

  // Navigation history
  const [navHistory, setNavHistory] = useState<number[]>([1]);
  const [navIndex, setNavIndex] = useState(0);
  const isNavJump = useRef(false);

  // Search state
  const [showSearch, setShowSearch] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [currentResultIdx, setCurrentResultIdx] = useState(0);

  /* Load PDF */
  useEffect(() => {
    let cancelled = false;
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(file.data) });
    loadingTask.promise
      .then(async (doc) => {
        if (cancelled) return;
        setPdf(doc);
        setTotalPages(doc.numPages);
        const outline = await doc.getOutline();
        if (!cancelled) setTocItems(outline ? await mapPdfOutlineItems(doc, outline) : []);
      })
      .catch((error) => { if (!cancelled) console.error("Failed to load PDF", error); });
    return () => { cancelled = true; loadingTask.destroy(); };
  }, [file.data]);

  /* Navigation history tracking */
  const navigateToPage = useCallback((p: number) => {
    setPage(p);
    if (!isNavJump.current) {
      setNavHistory((h) => {
        const newH = h.slice(0, navIndex + 1);
        newH.push(p);
        return newH;
      });
      setNavIndex((i) => i + 1);
    }
    isNavJump.current = false;
  }, [navIndex]);

  const navBack = useCallback(() => {
    if (navIndex > 0) {
      isNavJump.current = true;
      const newIdx = navIndex - 1;
      setNavIndex(newIdx);
      setPage(navHistory[newIdx]);
    }
  }, [navIndex, navHistory]);

  const navForward = useCallback(() => {
    if (navIndex < navHistory.length - 1) {
      isNavJump.current = true;
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

  useEffect(() => {
    if (settings.autoFitWidth) handleFitWidth();
  }, [settings.autoFitWidth, handleFitWidth]);

  /* Search */
  const handleSearch = useCallback(async (query: string) => {
    if (!pdf || !query.trim()) { setSearchResults([]); setCurrentResultIdx(0); return; }
    const results = await searchPdf(pdf, query);
    setSearchResults(results);
    setCurrentResultIdx(results.length > 0 ? 1 : 0);
    if (results.length > 0) navigateToPage(results[0].page);
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

  const handleSearchFromContext = useCallback((text: string) => {
    setShowSearch(true);
    handleSearch(text);
  }, [handleSearch]);

  /* Render pages */
  useEffect(() => {
    if (!pdf || !containerRef.current) return;
    let cancelled = false;

    const renderPage = async (pageNum: number, container: HTMLElement) => {
      const pdfPage = await pdf.getPage(pageNum);
      const viewport = pdfPage.getViewport({ scale: zoom, rotation });
      const outputScale = window.devicePixelRatio || 1;

      const wrapper = document.createElement("div");
      wrapper.className = "pdf-page";
      wrapper.style.width = `${viewport.width}px`;
      wrapper.style.height = `${viewport.height}px`;
      wrapper.style.setProperty("--scale-factor", `${viewport.scale}`);
      wrapper.dataset.pageNumber = String(pageNum);

      const filter = getPageFilter(settings);
      if (filter !== "none") wrapper.style.filter = filter;

      const canvas = document.createElement("canvas");
      canvas.className = "pdf-canvas";
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return;
      wrapper.appendChild(canvas);

      /* Text layer */
      if (settings.enableTextSelection) {
        const textDiv = document.createElement("div");
        textDiv.className = "textLayer";
        textDiv.style.setProperty("--scale-factor", `${viewport.scale}`);
        wrapper.appendChild(textDiv);
      }

      /* Annotation layer */
      if (settings.showAnnotations) {
        const annotationDiv = document.createElement("div");
        annotationDiv.className = "annotationLayer";
        annotationDiv.style.setProperty("--scale-factor", `${viewport.scale}`);
        wrapper.appendChild(annotationDiv);
      }

      container.appendChild(wrapper);
      if (cancelled) return;

      const renderTask = pdfPage.render({
        annotationMode: settings.showAnnotations ? pdfjsLib.AnnotationMode.ENABLE_FORMS : pdfjsLib.AnnotationMode.DISABLE,
        canvasContext: ctx,
        transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
        viewport,
      });
      await renderTask.promise;

      /* Render text layer */
      if (settings.enableTextSelection) {
        const textDiv = wrapper.querySelector(".textLayer") as HTMLDivElement;
        if (textDiv) {
          const textContent = await pdfPage.getTextContent();
          if (cancelled) return;
          const textLayerTask = (pdfjsLib as any).renderTextLayer({
            container: textDiv,
            textContentSource: textContent,
            textContentItemsStr: [],
            textDivs: [],
            viewport,
          });
          await textLayerTask?.promise;
        }
      }

      /* Render annotation layer */
      if (settings.showAnnotations) {
        const annotationDiv = wrapper.querySelector(".annotationLayer") as HTMLDivElement;
        if (annotationDiv) {
          const annotations = await pdfPage.getAnnotations();
          if (cancelled || annotations.length === 0) {
            annotationDiv.hidden = annotations.length === 0;
            return;
          }
          const annotationLayer = new (pdfjsLib as any).AnnotationLayer({
            div: annotationDiv,
            page: pdfPage,
            viewport: viewport.clone({ dontFlip: true }),
          });
          await annotationLayer.render({
            annotations,
            linkService: createPdfLinkService(pdf, setPage, totalPages),
            renderForms: true,
          });
        }
      }
    };

    const render = async () => {
      const container = containerRef.current;
      if (!container) return;
      container.replaceChildren();

      if (displayMode === "continuous") {
        // Render all pages
        for (let i = 1; i <= totalPages; i++) {
          if (cancelled) return;
          await renderPage(i, container);
        }
      } else if (displayMode === "double" || displayMode === "facing") {
        // Render current page and next page side by side
        const row = document.createElement("div");
        row.className = "flex gap-4 items-start";
        container.appendChild(row);

        const startPage = displayMode === "facing"
          ? (page % 2 === 0 ? page - 1 : page)
          : page;
        
        await renderPage(Math.max(1, startPage), row);
        if (startPage + 1 <= totalPages) {
          await renderPage(startPage + 1, row);
        }
      } else {
        // Single page
        await renderPage(page, container);
      }
    };

    render().catch((error) => { if (!cancelled) console.error("Failed to render PDF page", error); });

    return () => {
      cancelled = true;
      containerRef.current?.replaceChildren();
    };
  }, [page, pdf, totalPages, zoom, rotation, settings, displayMode]);

  /* Keyboard nav */
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setShowSearch(true);
        return;
      }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        const step = (displayMode === "double" || displayMode === "facing") ? 2 : 1;
        setPage((p) => Math.min(totalPages, p + step));
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        const step = (displayMode === "double" || displayMode === "facing") ? 2 : 1;
        setPage((p) => Math.max(1, p - step));
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [totalPages, displayMode]);

  /* Ctrl+scroll zoom */
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setZoom((z) => Math.max(0.4, Math.min(3, z - e.deltaY * 0.002)));
      }
    };
    document.addEventListener("wheel", handleWheel, { passive: false });
    return () => document.removeEventListener("wheel", handleWheel);
  }, []);

  /* Print */
  const handlePrint = useCallback(() => { if (pdf) printPdf(pdf); }, [pdf]);
  const handleRotate = useCallback(() => { setRotation((r) => (r + 90) % 360); }, []);

  /* Scroll class */
  const scrollClass = settings.scrollDirection === "horizontal"
    ? "flex flex-row items-center overflow-x-auto overflow-y-hidden"
    : "flex flex-1 flex-col items-center overflow-auto";

  const cursorClass = tool === "hand" ? "cursor-grab active:cursor-grabbing" : "";

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Top Command Bar */}
      <ViewerToolbar
        title={file.name}
        onBack={onBack}
        currentPage={page}
        totalPages={totalPages}
        onPrevPage={() => {
          const step = (displayMode === "double" || displayMode === "facing") ? 2 : 1;
          navigateToPage(Math.max(1, page - step));
        }}
        onNextPage={() => {
          const step = (displayMode === "double" || displayMode === "facing") ? 2 : 1;
          navigateToPage(Math.min(totalPages, page + step));
        }}
        zoom={zoom}
        onZoomIn={() => setZoom((z) => Math.min(3, z + 0.2))}
        onZoomOut={() => setZoom((z) => Math.max(0.4, z - 0.2))}
        onFitWidth={handleFitWidth}
      >
        {/* Nav history back/forward */}
        <Button variant="ghost" size="icon" onClick={navBack} disabled={navIndex <= 0} title="Previous view">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={navForward} disabled={navIndex >= navHistory.length - 1} title="Next view">
          <ChevronRight className="h-4 w-4" />
        </Button>

        <div className="w-px h-5 bg-border mx-1" />

        {/* Tool toggle */}
        <Button
          variant={tool === "select" ? "secondary" : "ghost"}
          size="icon"
          onClick={() => setTool("select")}
          title="Selection tool"
        >
          <MousePointer2 className="h-4 w-4" />
        </Button>
        <Button
          variant={tool === "hand" ? "secondary" : "ghost"}
          size="icon"
          onClick={() => setTool("hand")}
          title="Hand tool"
        >
          <Hand className="h-4 w-4" />
        </Button>

        <div className="w-px h-5 bg-border mx-1" />

        {/* Search */}
        <Button variant="ghost" size="icon" onClick={() => setShowSearch((o) => !o)} title="Find (Ctrl+F)">
          <Search className="h-4 w-4" />
        </Button>

        {/* Sidebar toggles */}
        <Button
          variant={sidebarTab === "toc" ? "secondary" : "ghost"}
          size="icon"
          onClick={() => setSidebarTab((t) => t === "toc" ? null : "toc")}
          title="Table of contents"
        >
          <ListTree className="h-4 w-4" />
        </Button>
        <Button
          variant={sidebarTab === "thumbs" ? "secondary" : "ghost"}
          size="icon"
          onClick={() => setSidebarTab((t) => t === "thumbs" ? null : "thumbs")}
          title="Page thumbnails"
        >
          <GripVertical className="h-4 w-4" />
        </Button>

        <PdfSettingsPanel
          settings={settings}
          onSettingsChange={setSettings}
          onPrint={handlePrint}
          onRotatePage={handleRotate}
        />
      </ViewerToolbar>

      {/* Main area */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Left Sidebar */}
        {sidebarTab === "toc" && (
          <DocumentTocSidebar
            title="PDF contents"
            items={tocItems}
            isOpen={true}
            activeId={activeTocId}
            onClose={() => setSidebarTab(null)}
            onSelect={handleTocSelect}
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
            <PdfThumbnailPanel
              pdf={pdf}
              currentPage={page}
              onPageSelect={(p) => navigateToPage(p)}
              isOpen={true}
            />
          </aside>
        )}

        {/* Canvas viewport */}
        <div ref={viewportRef} className={`relative flex-1 ${scrollClass} ${cursorClass} p-4 md:p-8`}>
          <div ref={containerRef} className={`shrink-0 ${displayMode === "continuous" ? "space-y-4" : ""}`} />

          {/* Floating context menu */}
          <PdfContextMenu containerRef={viewportRef} onSearchText={handleSearchFromContext} />

          {/* Search bar */}
          <PdfSearchBar
            isOpen={showSearch}
            onClose={() => { setShowSearch(false); setSearchResults([]); setCurrentResultIdx(0); }}
            onSearch={handleSearch}
            onNextResult={handleNextResult}
            onPrevResult={handlePrevResult}
            currentResult={currentResultIdx}
            totalResults={searchResults.length}
          />
        </div>
      </div>

      {/* Bottom Status Bar */}
      <PdfStatusBar
        currentPage={page}
        totalPages={totalPages}
        displayMode={displayMode}
        onPageJump={(p) => navigateToPage(p)}
        onDisplayModeChange={setDisplayMode}
        zoom={zoom}
      />
    </div>
  );
}
