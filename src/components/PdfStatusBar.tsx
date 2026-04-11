import { FileText, Columns2, GalleryVertical } from "lucide-react";
import { Button } from "@/components/ui/button";

export type DisplayMode = "single" | "continuous" | "twopage";

interface PdfStatusBarProps {
  currentPage: number;
  totalPages: number;
  displayMode: DisplayMode;
  onDisplayModeChange: (mode: DisplayMode) => void;
  zoom: number;
  hasUnsavedChanges?: boolean;
}

const displayModes: { mode: DisplayMode; icon: typeof FileText; label: string }[] = [
  { mode: "single", icon: FileText, label: "One page view" },
  { mode: "continuous", icon: GalleryVertical, label: "Continuous" },
  { mode: "twopage", icon: Columns2, label: "Two Page View" },
];

export function PdfStatusBar({
  currentPage, totalPages, displayMode,
  onDisplayModeChange, zoom, hasUnsavedChanges
}: PdfStatusBarProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-1.5 glass-surface border-t border-border text-xs select-none shrink-0">
      <span className="text-muted-foreground font-mono">
        Page {currentPage} of {totalPages}
      </span>

      <div className="flex-1 flex items-center gap-2">
        {hasUnsavedChanges && (
          <span className="flex items-center gap-1.5 text-amber-500 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            Unsaved changes
          </span>
        )}
      </div>

      <span className="text-muted-foreground font-mono">{Math.round(zoom * 100)}%</span>

      <div className="flex items-center gap-0.5 border-l border-border pl-3 ml-1">
        {displayModes.map(({ mode, icon: Icon, label }) => (
          <Button
            key={mode}
            variant={displayMode === mode ? "secondary" : "ghost"}
            size="icon"
            className="h-6 w-6"
            title={`${label} (d)`}
            onClick={() => onDisplayModeChange(mode)}
          >
            <Icon className="h-3 w-3" />
          </Button>
        ))}
      </div>
    </div>
  );
}
