/**
 * PDF Render Worker
 * 
 * This worker handles the heavy lifting of drawing PDF pages to an OffscreenCanvas.
 * It re-initializes its own instance of PDF.js to allow independent rendering.
 */
import * as pdfjsLib from "pdfjs-dist";

// Initialize worker source (must match the main thread version)
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

let pdfDoc: pdfjsLib.PDFDocumentProxy | null = null;

self.onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data;

  if (type === "init") {
    const { data, workerSrc } = payload;
    if (workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
    }
    try {
      pdfDoc = await pdfjsLib.getDocument({ 
        data,
        standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/standard_fonts/`,
        cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/cmaps/`,
        cMapPacked: true,
      }).promise;
      self.postMessage({ type: "ready" });
    } catch (error) {
      self.postMessage({ type: "error", payload: (error as Error).message });
    }
    return;
  }

  if (type === "render") {
    const { pageNum, scale, rotation, canvas: offscreenCanvas } = payload;
    if (!pdfDoc) return;

    try {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale, rotation });
      
      offscreenCanvas.width = viewport.width;
      offscreenCanvas.height = viewport.height;

      const ctx = offscreenCanvas.getContext("2d");
      if (!ctx) throw new Error("Could not get 2D context from OffscreenCanvas");

      const renderTask = page.render({
        canvasContext: ctx,
        canvas: offscreenCanvas,
        viewport,
      });

      await renderTask.promise;
      
      // Notify main thread that rendering is done
      // Note: OffscreenCanvas content is automatically reflected on the main thread canvas
      self.postMessage({ type: "rendered", payload: { pageNum } });
    } catch (error) {
      self.postMessage({ type: "render_error", payload: { pageNum, error: (error as Error).message } });
    }
  }
};
