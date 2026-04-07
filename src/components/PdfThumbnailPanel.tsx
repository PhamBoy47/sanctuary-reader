import { useEffect, useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";

interface PdfThumbnailPanelProps {
  pdf: pdfjsLib.PDFDocumentProxy | null;
  currentPage: number;
  onPageSelect: (page: number) => void;
  isOpen: boolean;
}

const THUMB_WIDTH = 120;

export function PdfThumbnailPanel({ pdf, currentPage, onPageSelect, isOpen }: PdfThumbnailPanelProps) {
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const activeRef = useRef<HTMLButtonElement>(null);
  const generating = useRef(false);

  useEffect(() => {
    if (!pdf || !isOpen || generating.current) return;
    generating.current = true;

    const generate = async () => {
      const thumbs: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        try {
          const page = await pdf.getPage(i);
          const vp = page.getViewport({ scale: 1 });
          const scale = THUMB_WIDTH / vp.width;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) { thumbs.push(""); continue; }
          await page.render({ canvasContext: ctx, viewport }).promise;
          thumbs.push(canvas.toDataURL("image/jpeg", 0.6));
        } catch {
          thumbs.push("");
        }
      }
      setThumbnails(thumbs);
      generating.current = false;
    };
    generate();
  }, [pdf, isOpen]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [currentPage]);

  if (!isOpen) return null;

  return (
    <div className="flex flex-col gap-2 overflow-y-auto p-2">
      {thumbnails.length === 0 && pdf && (
        <p className="text-xs text-muted-foreground text-center py-4">Generating thumbnails…</p>
      )}
      {thumbnails.map((src, i) => {
        const pageNum = i + 1;
        const isActive = pageNum === currentPage;
        return (
          <button
            key={pageNum}
            ref={isActive ? activeRef : undefined}
            onClick={() => onPageSelect(pageNum)}
            className={`group relative rounded-md overflow-hidden border-2 transition-colors ${
              isActive ? "border-primary shadow-lg" : "border-transparent hover:border-muted-foreground/30"
            }`}
          >
            {src ? (
              <img src={src} alt={`Page ${pageNum}`} className="w-full" loading="lazy" />
            ) : (
              <div className="w-full aspect-[3/4] bg-muted flex items-center justify-center">
                <span className="text-xs text-muted-foreground">{pageNum}</span>
              </div>
            )}
            <span className={`absolute bottom-0 inset-x-0 text-center text-[10px] py-0.5 font-mono ${
              isActive ? "bg-primary text-primary-foreground" : "bg-background/80 text-muted-foreground"
            }`}>
              {pageNum}
            </span>
          </button>
        );
      })}
    </div>
  );
}
