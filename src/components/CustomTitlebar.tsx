/**
 * Custom frameless titlebar for Tauri desktop app.
 * Renders only when running inside a Tauri window.
 */
import { useCallback, useEffect, useState } from "react";
import { Minus, Square, X, Maximize2 } from "lucide-react";

// Tauri window API — dynamically imported to avoid errors in browser
type TauriWindowModule = typeof import("@tauri-apps/api/window");

let tauriWindow: TauriWindowModule | null = null;

async function getTauriWindow() {
  if (tauriWindow) return tauriWindow;
  try {
    const mod = await import("@tauri-apps/api/window");
    tauriWindow = mod;
    return mod;
  } catch {
    return null;
  }
}

export function CustomTitlebar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getTauriWindow().then((mod) => {
      if (cancelled || !mod) return;
      const win = mod.getCurrentWindow();
      win.isMaximized().then((m: boolean) => {
        if (!cancelled) setMaximized(m);
      });
    });
    return () => { cancelled = true; };
  }, []);

  const handleMinimize = useCallback(async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().minimize();
    } catch (err) {
      console.error("Minimize failed:", err);
    }
  }, []);

  const handleToggleMaximize = useCallback(async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      await win.toggleMaximize();
      setMaximized(await win.isMaximized());
    } catch (err) {
      console.error("Maximize toggle failed:", err);
    }
  }, []);

  const handleClose = useCallback(async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().close();
    } catch (err) {
      console.error("Close failed:", err);
    }
  }, []);

  return (
    <div
      className="flex items-center h-8 bg-background/80 backdrop-blur-md border-b border-border select-none shrink-0"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {/* App icon + title */}
      <div className="flex items-center gap-2 px-3">
        <div className="w-4 h-4 rounded-sm bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
          <span className="text-[8px] font-bold text-primary-foreground">S</span>
        </div>
        <span className="text-[11px] font-medium text-foreground/70 tracking-wide">
          Sanctuary Reader
        </span>
      </div>

      <div className="flex-1" />

      {/* Window controls */}
      <div
        className="flex items-center h-full"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <button
          onClick={handleMinimize}
          className="h-full px-3 hover:bg-foreground/10 transition-colors flex items-center justify-center"
          title="Minimize"
        >
          <Minus className="h-3.5 w-3.5 text-foreground/60" />
        </button>
        <button
          onClick={handleToggleMaximize}
          className="h-full px-3 hover:bg-foreground/10 transition-colors flex items-center justify-center"
          title={maximized ? "Restore" : "Maximize"}
        >
          {maximized
            ? <Square className="h-3 w-3 text-foreground/60" />
            : <Maximize2 className="h-3 w-3 text-foreground/60" />
          }
        </button>
        <button
          onClick={handleClose}
          className="h-full px-3 hover:bg-red-500 hover:text-white transition-colors flex items-center justify-center"
          title="Close"
        >
          <X className="h-3.5 w-3.5 text-foreground/60 hover:text-white" />
        </button>
      </div>
    </div>
  );
}

/** Returns true when running inside Tauri */
export function isTauri(): boolean {
  return typeof window !== "undefined" && !!(window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
}
