import { useState, useCallback, useEffect } from "react";
import { FileText, Columns2, BookOpen, GalleryVertical, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type DisplayMode = "single" | "double" | "continuous" | "facing";

interface PdfStatusBarProps {
  currentPage: number;
  totalPages: number;
  displayMode: DisplayMode;
  onDisplayModeChange: (mode: DisplayMode) => void;
  zoom: number;
  onPageJump?: (page: number) => void;
}

const displayModes: { mode: DisplayMode; icon: typeof FileText; label: string }[] = [
  { mode: "single", icon: FileText, label: "Single Page" },
  { mode: "double", icon: Columns2, label: "Double Page" },
  { mode: "continuous", icon: GalleryVertical, label: "Continuous" },
  { mode: "facing", icon: BookOpen, label: "Facing" },
];

export function PdfStatusBar({
  currentPage, totalPages, displayMode,
  onDisplayModeChange, zoom, onPageJump,
}: PdfStatusBarProps) {
  const [jumpValue, setJumpValue] = useState(currentPage.toString());
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      setJumpValue(currentPage.toString());
    }
  }, [currentPage, isEditing]);

  const handleJump = useCallback(() => {
    setIsEditing(false);
    const p = parseInt(jumpValue, 10);
    if (!isNaN(p) && p >= 1 && p <= totalPages && onPageJump && p !== currentPage) {
      onPageJump(p);
    } else {
      setJumpValue(currentPage.toString());
    }
  }, [jumpValue, totalPages, onPageJump, currentPage]);

  return (
    <div className="flex items-center gap-3 px-4 py-1.5 glass-surface border-t border-border text-xs select-none shrink-0">
      {/* Page navigation */}
      <div className="flex items-center gap-1">
        {onPageJump && (
          <Button
            variant="ghost" size="icon" className="h-5 w-5"
            onClick={() => onPageJump(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
          >
            <ChevronLeft className="h-3 w-3" />
          </Button>
        )}
        <span className="text-muted-foreground font-mono flex items-center gap-0.5">
          Page{" "}
          {onPageJump ? (
            <Input
              value={jumpValue}
              onChange={(e) => setJumpValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleJump();
                  (e.target as HTMLInputElement).blur();
                }
              }}
              onFocus={(e) => {
                setIsEditing(true);
                e.target.select();
              }}
              onBlur={handleJump}
              className="h-5 w-8 text-center text-xs p-0 bg-transparent border-transparent hover:border-input focus-visible:ring-1 focus-visible:border-input focus-visible:bg-background mx-0.5 inline-flex"
              title="Go to page"
            />
          ) : (
            <span>{currentPage}</span>
          )}
          {" "}of {totalPages}
        </span>
        {onPageJump && (
          <Button
            variant="ghost" size="icon" className="h-5 w-5"
            onClick={() => onPageJump(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage >= totalPages}
          >
            <ChevronRight className="h-3 w-3" />
          </Button>
        )}
      </div>

      <div className="flex-1" />

      <span className="text-muted-foreground font-mono">{Math.round(zoom * 100)}%</span>

      <div className="flex items-center gap-0.5 border-l border-border pl-3 ml-1">
        {displayModes.map(({ mode, icon: Icon, label }) => (
          <Button
            key={mode}
            variant={displayMode === mode ? "secondary" : "ghost"}
            size="icon"
            className="h-6 w-6"
            title={label}
            onClick={() => onDisplayModeChange(mode)}
          >
            <Icon className="h-3 w-3" />
          </Button>
        ))}
      </div>
    </div>
  );
}
