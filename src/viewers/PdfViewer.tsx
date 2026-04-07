import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { ListTree } from "lucide-react";
import { DocumentTocSidebar, type TocItem } from "@/components/DocumentTocSidebar";
import { ViewerToolbar } from "@/components/ViewerToolbar";
import { Button } from "@/components/ui/button";
import type { FileEntry } from "@/lib/fileStore";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

interface PdfTocItem extends TocItem {
  children?: PdfTocItem[];
  dest?: unknown;
  page?: number | null;
  url?: string | null;
}

type PageSetter = Dispatch<SetStateAction<number>>;

async function resolvePdfDestination(doc: pdfjsLib.PDFDocumentProxy, dest: unknown): Promise<number | null> {
  if (!dest) {
    return null;
  }

  const resolvedDest = typeof dest === "string" ? await doc.getDestination(dest) : dest;

  if (!Array.isArray(resolvedDest) || resolvedDest.length === 0) {
    return null;
  }

  const target = resolvedDest[0];

  if (typeof target === "number") {
    return target + 1;
  }

  if (target && typeof target === "object") {
    return (await doc.getPageIndex(target as pdfjsLib.RefProxy)) + 1;
  }

  return null;
}

async function mapPdfOutlineItems(
  doc: pdfjsLib.PDFDocumentProxy,
  outline: pdfjsLib.OutlineNode[],
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

function createPdfLinkService(
  doc: pdfjsLib.PDFDocumentProxy,
  setPage: PageSetter,
  totalPages: number,
) {
  const goToPage = (target: number) => setPage(Math.max(1, Math.min(totalPages, target)));

  return {
    addLinkAttributes(link: HTMLAnchorElement, url: string, newWindow?: boolean) {
      link.href = url;
      link.target = newWindow ? "_blank" : "_self";
      link.rel = "noopener noreferrer";
    },
    eventBus: {
      dispatch: () => undefined,
    },
    executeNamedAction(action: string) {
      switch (action) {
        case "NextPage":
          setPage((current) => Math.min(totalPages, current + 1));
          break;
        case "PrevPage":
          setPage((current) => Math.max(1, current - 1));
          break;
        case "FirstPage":
          goToPage(1);
          break;
        case "LastPage":
          goToPage(totalPages);
          break;
        default:
          break;
      }
    },
    executeSetOCGState() {
      return undefined;
    },
    getAnchorUrl(hash: string) {
      return hash || "#";
    },
    getDestinationHash() {
      return "#";
    },
    async goToDestination(dest: unknown) {
      const pageNumber = await resolvePdfDestination(doc, dest).catch(() => null);

      if (pageNumber) {
        goToPage(pageNumber);
      }
    },
  };
}

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
  const [showToc, setShowToc] = useState(false);
  const [tocItems, setTocItems] = useState<PdfTocItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(file.data) });

    loadingTask.promise
      .then(async (doc) => {
        if (cancelled) {
          return;
        }

        setPdf(doc);
        setTotalPages(doc.numPages);

        const outline = await doc.getOutline();

        if (!cancelled) {
          setTocItems(outline ? await mapPdfOutlineItems(doc, outline) : []);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("Failed to load PDF", error);
        }
      });

    return () => {
      cancelled = true;
      loadingTask.destroy();
    };
  }, [file.data]);

  const flatTocItems = useMemo(() => flattenPdfTocItems(tocItems), [tocItems]);

  const activeTocId = useMemo(() => {
    let currentId: string | null = null;

    for (const item of flatTocItems) {
      if (item.page && item.page <= page) {
        currentId = item.id;
      }
    }

    return currentId;
  }, [flatTocItems, page]);

  const handleTocSelect = useCallback(
    async (item: TocItem) => {
      const tocItem = item as PdfTocItem;

      if (tocItem.url) {
        window.open(tocItem.url, "_blank", "noopener,noreferrer");
        return;
      }

      if (!pdf) {
        return;
      }

      const pageNumber = tocItem.page ?? (await resolvePdfDestination(pdf, tocItem.dest).catch(() => null));

      if (pageNumber) {
        setPage(pageNumber);
      }

      if (window.innerWidth < 768) {
        setShowToc(false);
      }
    },
    [pdf],
  );

  const handleFitWidth = useCallback(async () => {
    if (!pdf || !viewportRef.current) {
      return;
    }

    const currentPage = await pdf.getPage(page);
    const baseViewport = currentPage.getViewport({ scale: 1 });
    const availableWidth = Math.max(viewportRef.current.clientWidth - 32, 240);
    const nextZoom = Math.max(0.4, Math.min(3, availableWidth / baseViewport.width));

    setZoom(nextZoom);
  }, [page, pdf]);

  useEffect(() => {
    if (!pdf || !containerRef.current) return;
    let cancelled = false;
    let renderTask: pdfjsLib.RenderTask | null = null;
    let textLayerTask: { cancel?: () => void; promise?: Promise<void> } | null = null;

    const render = async () => {
      const container = containerRef.current;
      if (!container) return;

      const pdfPage = await pdf.getPage(page);
      const viewport = pdfPage.getViewport({ scale: zoom });
      const outputScale = window.devicePixelRatio || 1;

      const wrapper = document.createElement("div");
      wrapper.className = "pdf-page";
      wrapper.style.width = `${viewport.width}px`;
      wrapper.style.height = `${viewport.height}px`;
      wrapper.style.setProperty("--scale-factor", `${viewport.scale}`);

      const canvas = document.createElement("canvas");
      canvas.className = "pdf-canvas";
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return;

      wrapper.appendChild(canvas);

      const textDiv = document.createElement("div");
      textDiv.className = "textLayer";
      textDiv.style.setProperty("--scale-factor", `${viewport.scale}`);
      wrapper.appendChild(textDiv);

      const annotationDiv = document.createElement("div");
      annotationDiv.className = "annotationLayer";
      annotationDiv.style.setProperty("--scale-factor", `${viewport.scale}`);
      wrapper.appendChild(annotationDiv);

      container.replaceChildren(wrapper);

      if (cancelled) return;

      renderTask = pdfPage.render({
        annotationMode: pdfjsLib.AnnotationMode.ENABLE_FORMS,
        canvasContext: ctx,
        transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
        viewport,
      });

      await renderTask.promise;

      const textContent = await pdfPage.getTextContent();
      if (cancelled) return;

      textLayerTask = (pdfjsLib as any).renderTextLayer({
        container: textDiv,
        textContentSource: textContent,
        textContentItemsStr: [],
        textDivs: [],
        viewport,
      });

      await textLayerTask.promise;

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
    };

    render().catch((error) => {
      if (!cancelled) {
        console.error("Failed to render PDF page", error);
      }
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayerTask?.cancel?.();
      containerRef.current?.replaceChildren();
    };
  }, [page, pdf, totalPages, zoom]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        setPage((p) => Math.min(totalPages, p + 1));
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        setPage((p) => Math.max(1, p - 1));
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [totalPages]);

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

  return (
    <div className="flex h-screen flex-col bg-background">
      <ViewerToolbar
        title={file.name}
        onBack={onBack}
        currentPage={page}
        totalPages={totalPages}
        onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
        onNextPage={() => setPage((p) => Math.min(totalPages, p + 1))}
        zoom={zoom}
        onZoomIn={() => setZoom((z) => Math.min(3, z + 0.2))}
        onZoomOut={() => setZoom((z) => Math.max(0.4, z - 0.2))}
        onFitWidth={handleFitWidth}
      >
        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle table of contents"
          aria-pressed={showToc}
          onClick={() => setShowToc((open) => !open)}
        >
          <ListTree className="h-4 w-4" />
        </Button>
      </ViewerToolbar>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <DocumentTocSidebar
          title="PDF contents"
          items={tocItems}
          isOpen={showToc}
          activeId={activeTocId}
          onClose={() => setShowToc(false)}
          onSelect={handleTocSelect}
        />

        <div ref={viewportRef} className="flex flex-1 justify-center overflow-auto p-4 md:p-8">
          <div ref={containerRef} className="shrink-0" />
        </div>
      </div>
    </div>
  );
}
