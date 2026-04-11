import { BookOpen } from "lucide-react";

interface EpubStatusBarProps {
  progress?: string;
  theme: string;
  fontSize: number;
  hasUnsavedChanges?: boolean;
}

export function EpubStatusBar({
  progress, theme, fontSize, hasUnsavedChanges
}: EpubStatusBarProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-1.5 glass-surface border-t border-border text-[11px] select-none shrink-0">
      <div className="flex items-center gap-2 text-muted-foreground bg-muted/30 px-2 py-0.5 rounded-md border border-border/50">
        <BookOpen className="h-3 w-3" />
        <span className="font-mono truncate max-w-[200px]">{progress || "Reading..."}</span>
      </div>

      <div className="flex-1 flex items-center gap-2">
        {hasUnsavedChanges && (
          <span className="flex items-center gap-1.5 text-amber-500/90 font-medium">
             <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500" />
            </span>
            Unsaved Changes
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 text-muted-foreground font-mono">
        <div className="flex items-center gap-1.5">
          <span className="opacity-50">THEME</span>
          <span className="text-foreground/80">{theme}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="opacity-50">FONT</span>
          <span className="text-foreground/80">{fontSize}%</span>
        </div>
      </div>
    </div>
  );
}
