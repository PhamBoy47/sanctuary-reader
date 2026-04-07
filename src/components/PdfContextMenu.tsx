import { useEffect, useState, useCallback, useRef } from "react";
import { Copy, Highlighter, Search, Bookmark } from "lucide-react";
import { toast } from "sonner";

interface PdfContextMenuProps {
  containerRef: React.RefObject<HTMLDivElement>;
  onSearchText?: (text: string) => void;
  onHighlightText?: (text: string, rects: { x: number; y: number; w: number; h: number }[]) => void;
  onBookmarkPage?: () => void;
  highlightColor?: string;
}

interface MenuPosition {
  x: number;
  y: number;
  text: string;
  rects: { x: number; y: number; w: number; h: number }[];
}

export function PdfContextMenu({
  containerRef, onSearchText, onHighlightText, onBookmarkPage, highlightColor,
}: PdfContextMenuProps) {
  const [menu, setMenu] = useState<MenuPosition | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (!text || !containerRef.current) {
      setMenu(null);
      return;
    }

    const range = selection!.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();

    // Collect rects for highlight storage
    const clientRects = range.getClientRects();
    const pageEl = range.startContainer.parentElement?.closest(".pdf-page");
    const pageRect = pageEl?.getBoundingClientRect();
    const rects: { x: number; y: number; w: number; h: number }[] = [];

    if (pageRect) {
      for (let i = 0; i < clientRects.length; i++) {
        const r = clientRects[i];
        rects.push({
          x: (r.left - pageRect.left) / pageRect.width,
          y: (r.top - pageRect.top) / pageRect.height,
          w: r.width / pageRect.width,
          h: r.height / pageRect.height,
        });
      }
    }

    setMenu({
      x: rect.left + rect.width / 2 - containerRect.left,
      y: rect.top - containerRect.top - 8,
      text,
      rects,
    });
  }, [containerRef]);

  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (menuRef.current?.contains(e.target as Node)) return;
    setMenu(null);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("mousedown", handleMouseDown);
    return () => {
      el.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [containerRef, handleMouseUp, handleMouseDown]);

  const handleCopy = useCallback(() => {
    if (!menu) return;
    navigator.clipboard.writeText(menu.text);
    toast.success("Copied to clipboard");
    setMenu(null);
  }, [menu]);

  const handleSearch = useCallback(() => {
    if (!menu) return;
    onSearchText?.(menu.text);
    setMenu(null);
  }, [menu, onSearchText]);

  const handleHighlight = useCallback(() => {
    if (!menu) return;
    onHighlightText?.(menu.text, menu.rects);
    setMenu(null);
  }, [menu, onHighlightText]);

  const handleBookmark = useCallback(() => {
    onBookmarkPage?.();
    setMenu(null);
  }, [onBookmarkPage]);

  if (!menu) return null;

  return (
    <div
      ref={menuRef}
      className="absolute z-50 flex items-center gap-0.5 rounded-lg glass-surface border border-border px-1.5 py-1 shadow-xl"
      style={{
        left: `${menu.x}px`,
        top: `${menu.y}px`,
        transform: "translate(-50%, -100%)",
      }}
    >
      <button
        onClick={handleCopy}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-foreground hover:bg-secondary transition-colors"
      >
        <Copy className="h-3 w-3" /> Copy
      </button>
      <button
        onClick={handleHighlight}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-foreground hover:bg-secondary transition-colors"
      >
        <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: highlightColor || "rgb(255,235,59)" }} />
        Highlight
      </button>
      <button
        onClick={handleSearch}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-foreground hover:bg-secondary transition-colors"
      >
        <Search className="h-3 w-3" /> Search
      </button>
      <button
        onClick={handleBookmark}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-foreground hover:bg-secondary transition-colors"
      >
        <Bookmark className="h-3 w-3" /> Bookmark
      </button>
    </div>
  );
}
