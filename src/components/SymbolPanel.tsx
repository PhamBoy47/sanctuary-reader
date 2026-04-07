import { useState, useEffect, useCallback } from "react";
import { Sticker, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getSymbolAnnotations, removeSymbolAnnotation,
  type SymbolAnnotation,
} from "@/lib/annotationStore";
import { toast } from "sonner";

const SYMBOLS = [
  "⭐", "❤️", "📌", "🔖", "⚠️", "✅", "❌", "💡",
  "🔥", "📝", "❓", "‼️", "👍", "👎", "🎯", "💎",
];

interface SymbolPanelProps {
  fileId: string;
  currentPage: number;
  onPageSelect: (page: number) => void;
  activeSymbol: string;
  onSymbolChange: (symbol: string) => void;
  placingSymbol: boolean;
  onTogglePlacing: () => void;
}

export function SymbolPanel({
  fileId, currentPage, onPageSelect,
  activeSymbol, onSymbolChange,
  placingSymbol, onTogglePlacing,
}: SymbolPanelProps) {
  const [annotations, setAnnotations] = useState<SymbolAnnotation[]>([]);

  const reload = useCallback(async () => {
    setAnnotations(await getSymbolAnnotations(fileId));
  }, [fileId]);

  useEffect(() => { reload(); }, [reload]);

  const handleRemove = async (id: string) => {
    await removeSymbolAnnotation(id);
    toast.success("Annotation removed");
    reload();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
          <Sticker className="h-3.5 w-3.5 text-primary" />
          Symbols
        </span>
        <Button
          variant={placingSymbol ? "secondary" : "ghost"}
          size="sm"
          className="h-6 text-[10px]"
          onClick={onTogglePlacing}
        >
          {placingSymbol ? "Done" : "Place"}
        </Button>
      </div>

      {/* Symbol picker */}
      <div className="border-b border-border px-3 py-2">
        <div className="grid grid-cols-8 gap-1">
          {SYMBOLS.map((s) => (
            <button
              key={s}
              className={`w-7 h-7 rounded flex items-center justify-center text-sm transition-colors
                ${activeSymbol === s ? "bg-primary/20 ring-1 ring-primary" : "hover:bg-secondary"}`}
              onClick={() => onSymbolChange(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1">
        {annotations.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            Select a symbol, click Place, then click on the page to annotate.
          </div>
        ) : (
          <div className="p-1 space-y-0.5">
            {annotations.map((ann) => (
              <div
                key={ann.id}
                className="group flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs cursor-pointer hover:bg-secondary transition-colors"
                onClick={() => onPageSelect(ann.page)}
              >
                <span className="text-sm">{ann.symbol}</span>
                <span className="flex-1 text-foreground">Page {ann.page}</span>
                <button
                  className="hidden group-hover:block p-0.5 hover:text-destructive"
                  onClick={(e) => { e.stopPropagation(); handleRemove(ann.id); }}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

export { SYMBOLS };
