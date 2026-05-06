import { useCallback, useRef } from "react";
import * as pdfjsLib from "pdfjs-dist";
import type { PdfSettings } from "@/components/PdfSettingsPanel";
import type { SymbolAnnotation } from "@/lib/annotationStore";
import { createPdfLinkService } from "../lib/pdfLinkService";

type PdfDocumentWithStorage = pdfjsLib.PDFDocumentProxy & {
  annotationStorage?: unknown;
};
type AnnotationLayerConstructorParams = ConstructorParameters<typeof pdfjsLib.AnnotationLayer>[0];
type AnnotationLayerRenderParams = Parameters<pdfjsLib.AnnotationLayer["render"]>[0];

interface UsePdfRendererProps {
  pdf: pdfjsLib.PDFDocumentProxy | null;
  zoom: number;
  rotation: number;
  settings: PdfSettings;
  symbolAnnotations: SymbolAnnotation[];
  totalPages: number;
  navigateToPage: (page: number) => void;
  renderPageOffscreen?: (pageNum: number, scale: number, rotation: number, canvas: HTMLCanvasElement) => Promise<void> | void;
}

export function usePdfRenderer({
  pdf,
  zoom,
  rotation,
  settings,
  symbolAnnotations,
  totalPages,
  navigateToPage,
  renderPageOffscreen
}: UsePdfRendererProps) {
  const abortControllersRef = useRef<Map<number, AbortController>>(new Map());

  const renderPage = useCallback(async (
    pageNum: number, 
    wrapper: HTMLElement, 
    outputScale: number
  ) => {
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

      // FIX: Double Buffering. Find old layers to remove LATER.
      const oldLayers = Array.from(wrapper.querySelectorAll('.pdf-canvas, .textLayer, .annotationLayer, .symbol-layer'));

      // Canvas Layer
      const canvas = document.createElement("canvas");
      canvas.className = "pdf-canvas";
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      wrapper.appendChild(canvas);

      // Text Layer
      let textDiv: HTMLDivElement | null = null;
      if (settings.enableTextSelection) {
        textDiv = document.createElement("div");
        textDiv.className = "textLayer";
        textDiv.style.width = `${viewport.width}px`;
        textDiv.style.height = `${viewport.height}px`;
        textDiv.style.setProperty("--scale-factor", String(viewport.scale));
        textDiv.style.setProperty("--total-scale-factor", String(viewport.scale));
        wrapper.appendChild(textDiv);
      }

      // Annotation Layer
      let annotationDiv: HTMLDivElement | null = null;
      if (settings.showAnnotations) {
        annotationDiv = document.createElement("div");
        annotationDiv.className = "annotationLayer";
        annotationDiv.style.setProperty("--scale-factor", `${viewport.scale}`);
        wrapper.appendChild(annotationDiv);
      }

      // Symbol Overlays
      let symOverlay: HTMLDivElement | null = null;
      const pageSymbols = symbolAnnotations.filter((s) => s.page === pageNum);
      if (pageSymbols.length > 0) {
        symOverlay = document.createElement("div");
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

      // Cleanup helper if aborted
      const cleanupNewLayers = () => {
        canvas.remove();
        if (textDiv) textDiv.remove();
        if (annotationDiv) annotationDiv.remove();
        if (symOverlay) symOverlay.remove();
      };

      if (controller.signal.aborted) { cleanupNewLayers(); return; }

      // Render PDF to Canvas
      if (renderPageOffscreen) {
        // Off-thread rendering
        await renderPageOffscreen(pageNum, zoom * outputScale, rotation, canvas);
      } else {
        // Main-thread rendering (fallback)
        const ctx = canvas.getContext("2d");
        if (!ctx) { cleanupNewLayers(); return; }
        
        const renderTask = pdfPage.render({
          annotationMode: settings.showAnnotations 
            ? pdfjsLib.AnnotationMode.ENABLE_FORMS 
            : pdfjsLib.AnnotationMode.DISABLE,
          canvasContext: ctx,
          canvas,
          transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
          viewport,
        });
        await renderTask.promise;
      }

      if (controller.signal.aborted) { cleanupNewLayers(); return; }

      // Render Text Layer
      if (settings.enableTextSelection && textDiv) {
        const textContent = await pdfPage.getTextContent();
        if (controller.signal.aborted) { cleanupNewLayers(); return; }

        const textLayer = new pdfjsLib.TextLayer({
          container: textDiv,
          textContentSource: textContent,
          viewport,
        });
        await textLayer.render();
      }

      // Render Annotation Layer
      if (settings.showAnnotations && annotationDiv) {
        const annotations = await pdfPage.getAnnotations();
        if (!controller.signal.aborted && annotations.length > 0) {
          const linkService = createPdfLinkService(
            pdf,
            navigateToPage,
            totalPages,
          ) as unknown as AnnotationLayerRenderParams["linkService"];
          const annotationLayerParams: AnnotationLayerConstructorParams = {
            div: annotationDiv,
            accessibilityManager: null,
            annotationCanvasMap: null,
            annotationEditorUIManager: null,
            page: pdfPage,
            viewport: viewport.clone({ dontFlip: true }),
            structTreeLayer: null,
            commentManager: null,
            linkService,
            annotationStorage: (pdf as PdfDocumentWithStorage).annotationStorage,
          };
          const annotationLayer = new pdfjsLib.AnnotationLayer(annotationLayerParams);
          await annotationLayer.render({
            viewport: viewport.clone({ dontFlip: true }),
            div: annotationDiv,
            annotations,
            page: pdfPage,
            linkService,
            renderForms: true,
          });
        } else {
          annotationDiv.hidden = true;
        }
      }

      // Successful render: remove old layers
      oldLayers.forEach(el => el.remove());

    } catch (error) {
      if (error instanceof Error && (error.name === "RenderingCancelledException" || error.name === "AbortError")) {
        // Expected on zoom/navigation
        return;
      }
      console.error("Error rendering page:", pageNum, error);
    } finally {
      abortControllersRef.current.delete(pageNum);
    }
  }, [pdf, zoom, rotation, settings, symbolAnnotations, totalPages, navigateToPage, renderPageOffscreen]);

  const cancelAllRenders = useCallback(() => {
    abortControllersRef.current.forEach(c => c.abort());
    abortControllersRef.current.clear();
  }, []);

  return { renderPage, cancelAllRenders };
}
