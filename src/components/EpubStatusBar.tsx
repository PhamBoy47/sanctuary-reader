import { BookOpen, Save } from "lucide-react";

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
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none select-none">
      <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-full glass-surface border border-border/60 shadow-xl text-[11px] backdrop-blur-xl">
        {/* Progress */}
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <BookOpen className="h-3 w-3 shrink-0 text-primary/70" />
          <span className="font-mono">{progress || "Reading…"}</span>
        </div>

        {/* Divider */}
        <span className="h-3 w-px bg-border/70 shrink-0" />

        {/* Theme & font */}
        <span className="font-mono text-muted-foreground/60">
          {theme} · {fontSize}%
        </span>

        {/* Unsaved dot */}
        {hasUnsavedChanges && (
          <>
            <span className="h-3 w-px bg-border/70 shrink-0" />
            <span className="flex items-center gap-1.5 text-amber-400 font-medium pointer-events-auto">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500" />
              </span>
              Unsaved
            </span>
          </>
        )}
      </div>
    </div>
  );
}
