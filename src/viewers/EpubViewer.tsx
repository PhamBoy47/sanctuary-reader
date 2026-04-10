import { useEffect, useRef, useState } from "react";
import ePub from "epubjs";
import { ListTree, Minus, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { DocumentTocSidebar, type TocItem } from "@/components/DocumentTocSidebar";
import { ViewerToolbar } from "@/components/ViewerToolbar";
import { Button } from "@/components/ui/button";
import type { FileEntry } from "@/lib/fileStore";

interface EpubViewerProps {
  file: FileEntry;
  onBack: () => void;
}

type ThemeMode = "original" | "light" | "sepia" | "warm" | "cool" | "dark" | "midnight";

const themes: Record<ThemeMode, { bg: string; fg: string; label: string }> = {
  original: { bg: "#ffffff", fg: "#000000", label: "Original" },
  light: { bg: "#faf9f6", fg: "#1a1a1a", label: "Light" },
  sepia: { bg: "#f4ecd8", fg: "#5b4636", label: "Sepia" },
  warm: { bg: "#fdf6e3", fg: "#3e2723", label: "Warm" },
  cool: { bg: "#e8eaf6", fg: "#1a237e", label: "Cool" },
  dark: { bg: "#141a24", fg: "#d4cfc4", label: "Dark" },
  midnight: { bg: "#0a0e14", fg: "#b0bec5", label: "Midnight" },
};

interface EpubTocItem extends TocItem {
  children?: EpubTocItem[];
  href: string;
}

function mapEpubTocItems(items: any[] = [], prefix = "toc"): EpubTocItem[] {
  return items.map((item, index) => {
    const id = `${prefix}-${index}`;

    return {
      id,
      label: item.label?.trim() || "Untitled section",
      href: item.href || item.cfi || "",
      children: mapEpubTocItems(item.subitems ?? [], id),
    };
  });
}

function flattenEpubTocItems(items: EpubTocItem[]): EpubTocItem[] {
  return items.flatMap((item) => [item, ...flattenEpubTocItems(item.children ?? [])]);
}

function normalizeHref(href?: string | null) {
  return decodeURIComponent((href ?? "").split("#")[0]);
}

function findActiveEpubTocId(items: EpubTocItem[], href?: string | null) {
  const target = normalizeHref(href);
  if (!target) {
    return null;
  }

  let activeMatch: EpubTocItem | null = null;

  for (const item of flattenEpubTocItems(items)) {
    const candidate = normalizeHref(item.href);
    if (!candidate) {
      continue;
    }

    const isMatch = target === candidate || target.endsWith(candidate) || candidate.endsWith(target);

    if (isMatch && (!activeMatch || candidate.length > normalizeHref(activeMatch.href).length)) {
      activeMatch = item;
    }
  }

  return activeMatch?.id ?? null;
}

export function EpubViewer({ file, onBack }: EpubViewerProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<any>(null);
  const tocRef = useRef<EpubTocItem[]>([]);
  const [fontSize, setFontSize] = useState(100);
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [showSettings, setShowSettings] = useState(false);
  const [showToc, setShowToc] = useState(false);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tocItems, setTocItems] = useState<EpubTocItem[]>([]);
  const [activeTocId, setActiveTocId] = useState<string | null>(null);

  useEffect(() => {
    if (!viewerRef.current) return;
    const el = viewerRef.current;
    let cancelled = false;

    setReady(false);
    setError(null);
    setAtStart(true);
    setAtEnd(false);
    setTocItems([]);
    setActiveTocId(null);
    tocRef.current = [];
    el.replaceChildren();

    const data = (file.data as any) instanceof Uint8Array ? (file.data as any).buffer : file.data;
    const book = ePub(data);

    const rendition = book.renderTo(el, {
      width: "100%",
      height: "100%",
      spread: "none",
      flow: "paginated",
    });

    renditionRef.current = rendition;

    Object.entries(themes).forEach(([name, t]) => {
      rendition.themes.register(name, {
        body: {
          background: `${t.bg} !important`,
          color: `${t.fg} !important`,
          "font-family": "'Space Grotesk', system-ui, sans-serif !important",
          "line-height": "1.7 !important",
          padding: "0 20px !important",
        },
        p: {
          color: `${t.fg} !important`,
        },
        "h1, h2, h3, h4, h5, h6": {
          color: `${t.fg} !important`,
        },
        a: {
          color: `${t.fg} !important`,
        },
      });
    });

    rendition.themes.select(theme);
    rendition.themes.fontSize(`${fontSize}%`);

    const handleRelocated = (location: any) => {
      setAtStart(location?.atStart ?? false);
      setAtEnd(location?.atEnd ?? false);
      setActiveTocId(findActiveEpubTocId(tocRef.current, location?.start?.href));
    };

    rendition.on("relocated", (location: any) => {
      handleRelocated(location);
      if (location?.start?.cfi) {
        localStorage.setItem(`epub-progress-${file.id}`, location.start.cfi);
      }
    });

    const loadBook = async () => {
      try {
        const navigation = await book.loaded.navigation.catch(() => null);

        if (!cancelled) {
          const nextTocItems = mapEpubTocItems(navigation?.toc ?? []);
          tocRef.current = nextTocItems;
          setTocItems(nextTocItems);
        }

        await rendition.display();

        if (!cancelled) {
          const savedLoc = localStorage.getItem(`epub-progress-${file.id}`);
          if (savedLoc) {
            await rendition.display(savedLoc);
          }
          setReady(true);
        }
      } catch (loadError) {
        if (!cancelled) {
          console.error("Failed to load EPUB", loadError);
          setError("Could not open this EPUB.");
        }
      }
    };

    loadBook();

    return () => {
      cancelled = true;
      tocRef.current = [];
      renditionRef.current = null;
      try {
        rendition.off?.("relocated", handleRelocated);
      } catch {
        // noop
      }
      rendition.destroy?.();
      book.destroy();
      el.replaceChildren();
    };
  }, [file.data]);

  useEffect(() => {
    if (renditionRef.current && ready) {
      renditionRef.current.themes.select(theme);
    }
  }, [theme, ready]);

  useEffect(() => {
    if (renditionRef.current && ready) {
      renditionRef.current.themes.fontSize(`${fontSize}%`);
    }
  }, [fontSize, ready]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Don't intercept when user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditable = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable;
      if (isEditable) return;

      if (e.key === "ArrowRight" || e.key === "PageDown") renditionRef.current?.next();
      if (e.key === "ArrowLeft" || e.key === "PageUp") renditionRef.current?.prev();
      if (e.key === " ") { e.preventDefault(); renditionRef.current?.next(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  const themeOrder: ThemeMode[] = ["original", "light", "sepia", "warm", "cool", "dark", "midnight"];
  const nextTheme = () => {
    setTheme(themeOrder[(themeOrder.indexOf(theme) + 1) % themeOrder.length]);
  };

  const handleTocSelect = (item: TocItem) => {
    const tocItem = item as EpubTocItem;

    if (!tocItem.href) {
      return;
    }

    renditionRef.current?.display(tocItem.href);

    if (window.innerWidth < 768) {
      setShowToc(false);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-background">
      <ViewerToolbar title={file.name} onBack={onBack}>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle table of contents"
          aria-pressed={showToc}
          onClick={() => setShowToc((open) => !open)}
        >
          <ListTree className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => renditionRef.current?.prev()}
            disabled={atStart}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => renditionRef.current?.next()}
            disabled={atEnd}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          {(Object.entries(themes) as [ThemeMode, typeof themes[ThemeMode]][]).map(([key, t]) => (
            <Button
              key={key}
              variant={theme === key ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-[10px] px-2 gap-1"
              onClick={() => setTheme(key)}
              title={t.label}
            >
              <span
                className="w-3 h-3 rounded-full border border-border"
                style={{ backgroundColor: t.bg }}
              />
              <span className="hidden sm:inline">{t.label}</span>
            </Button>
          ))}
        </div>
      </ViewerToolbar>

      {showSettings && (
        <div className="flex items-center gap-4 px-6 py-2 glass-surface">
          <span className="text-xs text-muted-foreground">Font Size</span>
          <Button variant="ghost" size="icon" onClick={() => setFontSize((s) => Math.max(60, s - 10))}>
            <Minus className="h-3 w-3" />
          </Button>
          <span className="text-xs font-mono text-foreground w-10 text-center">{fontSize}%</span>
          <Button variant="ghost" size="icon" onClick={() => setFontSize((s) => Math.min(200, s + 10))}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <DocumentTocSidebar
          title="Book contents"
          items={tocItems}
          isOpen={showToc}
          activeId={activeTocId}
          onClose={() => setShowToc(false)}
          onSelect={handleTocSelect}
        />

        <div
          ref={viewerRef}
          className="flex-1 overflow-hidden"
          style={{ background: themes[theme].bg }}
        />

        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/90">
            <p className="text-muted-foreground animate-pulse">Loading book…</p>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/95 px-6 text-center">
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
