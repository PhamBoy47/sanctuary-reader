import { useEffect, useRef, useState } from "react";
import ePub from "epubjs";
import { ListTree, Type, Sun, Moon, Minus, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { DocumentTocSidebar, type TocItem } from "@/components/DocumentTocSidebar";
import { ViewerToolbar } from "@/components/ViewerToolbar";
import { Button } from "@/components/ui/button";
import type { FileEntry } from "@/lib/fileStore";

interface EpubViewerProps {
  file: FileEntry;
  onBack: () => void;
}

type ThemeMode = "light" | "sepia" | "dark";

const themes: Record<ThemeMode, { bg: string; fg: string }> = {
  light: { bg: "#faf9f6", fg: "#1a1a1a" },
  sepia: { bg: "#f4ecd8", fg: "#5b4636" },
  dark: { bg: "#141a24", fg: "#d4cfc4" },
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

    const arrayBuf = file.data instanceof ArrayBuffer ? file.data.slice(0) : (file.data as ArrayBuffer);
    const book = ePub(arrayBuf);

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

    rendition.on("relocated", handleRelocated);

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
      if (e.key === "ArrowRight") renditionRef.current?.next();
      if (e.key === "ArrowLeft") renditionRef.current?.prev();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  const nextTheme = () => {
    const order: ThemeMode[] = ["light", "sepia", "dark"];
    setTheme(order[(order.indexOf(theme) + 1) % 3]);
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
        <Button variant="ghost" size="icon" onClick={() => setShowSettings(!showSettings)}>
          <Type className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={nextTheme}>
          {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </Button>
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
