import { useEffect, useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { ViewerToolbar } from "@/components/ViewerToolbar";
import type { FileEntry } from "@/lib/fileStore";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

interface PdfViewerProps {
  file: FileEntry;
  onBack: () => void;
}

export function PdfViewer({ file, onBack }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [zoom, setZoom] = useState(1.2);

  useEffect(() => {
    const data = new Uint8Array(file.data);
    pdfjsLib.getDocument({ data }).promise.then((doc) => {
      setPdf(doc);
      setTotalPages(doc.numPages);
    });
  }, [file.data]);

  useEffect(() => {
    if (!pdf || !containerRef.current) return;
    let cancelled = false;

    const render = async () => {
      const container = containerRef.current;
      if (!container) return;

      const p = await pdf.getPage(page);
      const viewport = p.getViewport({ scale: zoom });

      // Clear previous
      container.innerHTML = "";

      // Wrapper
      const wrapper = document.createElement("div");
      wrapper.style.position = "relative";
      wrapper.style.width = `${viewport.width}px`;
      wrapper.style.height = `${viewport.height}px`;

      // Canvas
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width * 2;
      canvas.height = viewport.height * 2;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(2, 2);

      wrapper.appendChild(canvas);

      // Text layer
      const textDiv = document.createElement("div");
      textDiv.className = "pdf-text-layer";
      textDiv.style.width = `${viewport.width}px`;
      textDiv.style.height = `${viewport.height}px`;
      wrapper.appendChild(textDiv);

      container.appendChild(wrapper);

      if (cancelled) return;

      await p.render({ canvasContext: ctx, viewport }).promise;

      // Render text layer for selection
      const textContent = await p.getTextContent();
      textDiv.innerHTML = "";
      for (const item of textContent.items) {
        if (!("str" in item) || !item.str) continue;
        const tx = pdfjsLib.Util.transform(
          viewport.transform,
          (item as any).transform
        );
        const span = document.createElement("span");
        span.textContent = item.str;
        span.style.left = `${tx[4]}px`;
        span.style.top = `${tx[5]}px`;
        span.style.fontSize = `${Math.abs(tx[0])}px`;
        span.style.fontFamily = (item as any).fontName || "sans-serif";
        textDiv.appendChild(span);
      }
    };

    render();
    return () => { cancelled = true; };
  }, [pdf, page, zoom]);

  // Keyboard shortcuts
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

  // Ctrl+scroll zoom
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
    <div className="flex flex-col h-screen bg-background">
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
        onFitWidth={() => setZoom(1.2)}
      />
      <div className="flex-1 overflow-auto flex justify-center p-8">
        <div ref={containerRef} className="shadow-2xl rounded-sm" />
      </div>
    </div>
  );
}
