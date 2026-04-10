import { useState, useEffect, useCallback } from "react";
import { Highlighter, Trash2, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getHighlights, removeHighlight,
  type Highlight,
} from "@/lib/annotationStore";
import { toast } from "sonner";

const PRESET_COLORS = [
  { label: "Yellow", value: "rgb(255,235,59)" },
  { label: "Red", value: "rgb(239,83,80)" },
  { label: "Green", value: "rgb(102,187,106)" },
  { label: "Blue", value: "rgb(66,165,245)" },
  { label: "Orange", value: "rgb(255,167,38)" },
  { label: "Purple", value: "rgb(171,71,188)" },
  { label: "Pink", value: "rgb(240,98,146)" },
  { label: "Cyan", value: "rgb(38,198,218)" },
];

interface HighlightPanelProps {
  fileId: string;
  currentPage: number;
  onPageSelect: (page: number) => void;
  activeColor: string;
  onColorChange: (color: string) => void;
  version?: number;
  onAnnotationChange?: () => void;
}

export function HighlightPanel({
  fileId, currentPage, onPageSelect,
  activeColor, onColorChange, version, onAnnotationChange,
}: HighlightPanelProps) {
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [showCustom, setShowCustom] = useState(false);
  const [customR, setCustomR] = useState(255);
  const [customG, setCustomG] = useState(235);
  const [customB, setCustomB] = useState(59);

  const reload = useCallback(async () => {
    setHighlights(await getHighlights(fileId));
  }, [fileId]);

  useEffect(() => { reload(); }, [reload, version]);

  const handleRemove = async (id: string) => {
    await removeHighlight(id);
    toast.success("Highlight removed");
    reload();
    onAnnotationChange?.();
  };

  const handleCustomColor = () => {
    const color = `rgb(${customR},${customG},${customB})`;
    onColorChange(color);
    setShowCustom(false);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
          <Highlighter className="h-3.5 w-3.5 text-primary" />
          Highlights
        </span>
        <Button
          variant="ghost" size="icon" className="h-6 w-6"
          onClick={() => setShowCustom(!showCustom)}
          title="Custom color"
        >
          <Palette className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Color Picker */}
      <div className="border-b border-border px-3 py-2 space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {PRESET_COLORS.map((c) => (
            <button
              key={c.value}
              className={`w-5 h-5 rounded-full border-2 transition-transform ${
                activeColor === c.value ? "border-foreground scale-125" : "border-transparent"
              }`}
              style={{ backgroundColor: c.value }}
              title={c.label}
              onClick={() => onColorChange(c.value)}
            />
          ))}
        </div>

        {showCustom && (
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-muted-foreground w-4">R</label>
              <input
                type="range" min={0} max={255} value={customR}
                onChange={(e) => setCustomR(Number(e.target.value))}
                className="flex-1 h-1.5 accent-red-500"
              />
              <span className="text-[10px] font-mono w-7 text-right">{customR}</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-muted-foreground w-4">G</label>
              <input
                type="range" min={0} max={255} value={customG}
                onChange={(e) => setCustomG(Number(e.target.value))}
                className="flex-1 h-1.5 accent-green-500"
              />
              <span className="text-[10px] font-mono w-7 text-right">{customG}</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-muted-foreground w-4">B</label>
              <input
                type="range" min={0} max={255} value={customB}
                onChange={(e) => setCustomB(Number(e.target.value))}
                className="flex-1 h-1.5 accent-blue-500"
              />
              <span className="text-[10px] font-mono w-7 text-right">{customB}</span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-5 rounded border border-border"
                style={{ backgroundColor: `rgb(${customR},${customG},${customB})` }}
              />
              <Button size="sm" className="h-6 text-[10px]" onClick={handleCustomColor}>
                Apply
              </Button>
            </div>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        {highlights.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            Select text and click Highlight in the context menu to add highlights.
          </div>
        ) : (
          <div className="p-1 space-y-0.5">
            {highlights.map((hl) => (
              <div
                key={hl.id}
                className="group flex items-start gap-1.5 rounded-md px-2 py-1.5 text-xs cursor-pointer hover:bg-secondary transition-colors"
                onClick={() => onPageSelect(hl.page)}
              >
                <div
                  className="w-3 h-3 rounded-sm shrink-0 mt-0.5"
                  style={{ backgroundColor: hl.color }}
                />
                <span className="flex-1 text-foreground line-clamp-2">{hl.text}</span>
                <span className="text-[10px] text-muted-foreground font-mono shrink-0">p.{hl.page}</span>
                <button
                  className="hidden group-hover:block p-0.5 hover:text-destructive shrink-0"
                  onClick={(e) => { e.stopPropagation(); handleRemove(hl.id); }}
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

export { PRESET_COLORS };
