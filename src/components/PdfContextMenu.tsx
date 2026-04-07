import { useEffect, useState, useCallback, useRef } from "react";
import { Copy, Highlighter, Search } from "lucide-react";
import { toast } from "sonner";

interface PdfContextMenuProps {
  containerRef: React.RefObject<HTMLDivElement>;
  onSearchText?: (text: string) => void;
}

interface MenuPosition {
  x: number;
  y: number;
  text: string;
}

export function PdfContextMenu({ containerRef, onSearchText }: PdfContextMenuProps) {
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

    setMenu({
      x: rect.left + rect.width / 2 - containerRect.left,
      y: rect.top - containerRect.top - 8,
      text,
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
        onClick={handleSearch}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-foreground hover:bg-secondary transition-colors"
      >
        <Search className="h-3 w-3" /> Search
      </button>
      <button
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-foreground hover:bg-secondary transition-colors"
        onClick={() => { toast.info("Highlighting coming soon"); setMenu(null); }}
      >
        <Highlighter className="h-3 w-3" /> Highlight
      </button>
    </div>
  );
}
