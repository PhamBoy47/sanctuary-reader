/**
 * EpubViewer — zero epubjs dependency.
 *
 * Reads the EPUB ZIP directly with JSZip (already proven to work in this
 * project), parses the OPF/NCX/NAV structure ourselves, rewrites all
 * relative asset URLs to inline data: URIs, and renders each spine chapter
 * inside a sandboxed <iframe srcdoc>.
 *
 * This is the only approach that is guaranteed to work in a Vite + ESM
 * environment because it sidesteps every epubjs CJS/global/JSZip quirk.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { ListTree, Minus, Plus, ChevronLeft, ChevronRight, Book } from "lucide-react";
import { DocumentTocSidebar, type TocItem } from "@/components/DocumentTocSidebar";
import { ViewerToolbar } from "@/components/ViewerToolbar";
import { EpubStatusBar } from "@/components/EpubStatusBar";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { FileEntry } from "@/lib/fileStore";
import { updateProgress } from "@/lib/fileStore";
import { UnsavedChangesDialog } from "@/components/UnsavedChangesDialog";
import { DictionaryPopover } from "@/components/DictionaryPopover";
import { useAppSettings } from "@/lib/appSettings";
import { lookupWord } from "@/lib/dictionaryCore";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface EpubViewerProps { file: FileEntry; onBack: () => void; }

type ThemeMode = "original" | "light" | "sepia" | "warm" | "cool" | "dark" | "midnight";

const themes: Record<ThemeMode, { bg: string; fg: string; link: string; label: string }> = {
  original: { bg: "#ffffff", fg: "#000000", link: "#0066cc", label: "Original" },
  // A slightly warmer, softer light theme (inspired by classic books)
  light: { bg: "#fdfdfc", fg: "#333333", link: "#2563eb", label: "Light" },
  // A high-contrast sepia (inspired by Apple Books)
  sepia: { bg: "#fbf0d9", fg: "#5f4b32", link: "#d97706", label: "Sepia" },
  // A soft, natural warm theme
  warm: { bg: "#fff8f0", fg: "#4a3f35", link: "#ea580c", label: "Warm" },
  // A crisp, icy cool theme (Nord-inspired light)
  cool: { bg: "#eceff4", fg: "#2e3440", link: "#5e81ac", label: "Cool" },
  // A modern, sleek dark theme (inspired by Tailwind / Vercel)
  dark: { bg: "#0f172a", fg: "#e2e8f0", link: "#38bdf8", label: "Dark" },
  // True OLED Black (Saves battery on mobile devices, high contrast)
  midnight: { bg: "#000000", fg: "#d1d5db", link: "#818cf8", label: "Midnight" },
};

interface SpineItem { id: string; href: string; }
interface ManifestItem { id: string; href: string; mediaType: string; }

interface EpubTocItem extends TocItem {
  href: string;
  children?: EpubTocItem[];
}

interface ParsedEpub {
  zip: JSZip;
  spine: SpineItem[];
  toc: EpubTocItem[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Path helpers
// ─────────────────────────────────────────────────────────────────────────────

function getDir(path: string): string {
  const i = path.lastIndexOf("/");
  return i >= 0 ? path.slice(0, i + 1) : "";
}

/** Resolve a relative path against a base directory (no fragment) */
function resolvePath(baseDir: string, rel: string): string {
  if (!rel || /^(https?:|data:|#)/.test(rel)) return rel;
  const clean = rel.split("#")[0];
  const parts = (baseDir + clean).split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else if (p !== ".") out.push(p);
  }
  return out.join("/");
}

// ─────────────────────────────────────────────────────────────────────────────
// EPUB structure parsers
// ─────────────────────────────────────────────────────────────────────────────

function parseContainerXml(xml: string): string {
  const m = xml.match(/full-path="([^"]+)"/);
  if (!m) throw new Error("container.xml: no full-path attribute found");
  return m[1];
}

function parseOpf(
  xml: string,
  opfDir: string,
): { manifest: Record<string, ManifestItem>; spine: SpineItem[] } {
  const doc = new DOMParser().parseFromString(xml, "application/xml");

  const manifest: Record<string, ManifestItem> = {};
  doc.querySelectorAll("manifest item").forEach((el) => {
    const id = el.getAttribute("id") ?? "";
    const href = el.getAttribute("href") ?? "";
    const mediaType = el.getAttribute("media-type") ?? "";
    manifest[id] = { id, href: opfDir + href, mediaType };
  });

  const spine: SpineItem[] = [];
  doc.querySelectorAll("spine itemref").forEach((el) => {
    const idref = el.getAttribute("idref") ?? "";
    if (manifest[idref]) spine.push({ id: idref, href: manifest[idref].href });
  });

  return { manifest, spine };
}

function parseNcx(xml: string, opfDir: string): EpubTocItem[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  let n = 0;
  function walk(nodes: Element[]): EpubTocItem[] {
    return nodes.map((el) => {
      const label = el.querySelector("navLabel text")?.textContent?.trim() ?? "Section";
      const src = el.querySelector("content")?.getAttribute("src") ?? "";
      const href = src ? opfDir + src.split("#")[0] : "";
      const children = walk(Array.from(el.querySelectorAll(":scope > navPoint")));
      return { id: `toc-${n++}`, label, href, children };
    });
  }
  return walk(Array.from(doc.querySelectorAll("navMap > navPoint")));
}

function parseNav(xml: string, opfDir: string): EpubTocItem[] {
  const doc = new DOMParser().parseFromString(xml, "text/html");
  // EPUB3 nav may use epub:type or a namespaced attribute
  const nav =
    doc.querySelector('nav[epub\\:type="toc"]') ??
    doc.querySelector("nav[*|type='toc']") ??
    doc.querySelector("nav");
  if (!nav) return [];
  let n = 0;
  function walkOl(ol: Element): EpubTocItem[] {
    return Array.from(ol.querySelectorAll(":scope > li")).map((li) => {
      const a = li.querySelector(":scope > a");
      const label = a?.textContent?.trim() ?? "Section";
      const rawHref = a?.getAttribute("href") ?? "";
      const href = rawHref ? opfDir + rawHref.split("#")[0] : "";
      const childOl = li.querySelector(":scope > ol");
      return { id: `toc-${n++}`, label, href, children: childOl ? walkOl(childOl) : [] };
    });
  }
  const ol = nav.querySelector("ol");
  return ol ? walkOl(ol) : [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Asset inlining
// ─────────────────────────────────────────────────────────────────────────────

const MIME_EXT: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
  svg: "image/svg+xml", webp: "image/webp",
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
};

async function toDataUri(zip: JSZip, path: string): Promise<string | null> {
  const entry = zip.file(path);
  if (!entry) return null;
  const b64 = await entry.async("base64");
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const mime = MIME_EXT[ext] ?? "application/octet-stream";
  return `data:${mime};base64,${b64}`;
}

/** Replace url(...) tokens in CSS with inline data URIs */
async function inlineCssUrls(css: string, cssDir: string, zip: JSZip): Promise<string> {
  const pattern = /url\(\s*(['"]?)([^'")\s]+)\1\s*\)/g;
  const jobs: Array<{ token: string; resolved: string }> = [];
  let m: RegExpExecArray | null;

  while ((m = pattern.exec(css)) !== null) {
    const raw = m[2];
    if (/^(data:|https?:|#)/.test(raw)) continue;
    jobs.push({ token: m[0], resolved: resolvePath(cssDir, raw) });
  }

  for (const { token, resolved } of jobs) {
    const uri = await toDataUri(zip, resolved);
    if (uri) css = css.split(token).join(`url("${uri}")`);
  }
  return css;
}

async function fetchCss(zip: JSZip, cssPath: string): Promise<string> {
  const entry = zip.file(cssPath);
  if (!entry) return "";
  const raw = await entry.async("string");
  return inlineCssUrls(raw, getDir(cssPath), zip);
}

// ─────────────────────────────────────────────────────────────────────────────
// Chapter HTML processor
// ─────────────────────────────────────────────────────────────────────────────

function themeCSS(t: (typeof themes)[ThemeMode], fontSize: number) {
  return `
    html { font-size: ${fontSize}% !important; }
    html, body {
      background:   ${t.bg}   !important;
      color:        ${t.fg}   !important;
      font-family:  Georgia, "Times New Roman", serif !important;
      line-height:  1.75     !important;
      padding:      24px 48px !important;
      margin:       0        !important;
      max-width:    800px    !important;
      margin-left:  auto     !important;
      margin-right: auto     !important;
    }
    h1,h2,h3,h4,h5,h6,p,div,span,li,td,th,blockquote { color: ${t.fg} !important; }
    a { color: ${t.link} !important; }
    img { max-width: 100% !important; height: auto !important; }
  `;
}

async function processChapter(
  zip: JSZip,
  href: string,
  theme: ThemeMode,
  fontSize: number,
): Promise<string> {
  const entry = zip.file(href);
  if (!entry) throw new Error(`Spine item not found in ZIP: ${href}`);

  const raw = await entry.async("string");
  const dir = getDir(href);
  const doc = new DOMParser().parseFromString(raw, "text/html");

  // 1. Inline <link rel="stylesheet">
  for (const link of Array.from(doc.querySelectorAll<HTMLElement>('link[rel="stylesheet"]'))) {
    const lhref = link.getAttribute("href") ?? "";
    if (!lhref || /^https?:/.test(lhref)) continue;
    const css = await fetchCss(zip, resolvePath(dir, lhref));
    const style = doc.createElement("style");
    style.textContent = css;
    link.replaceWith(style);
  }

  // 2. Inline url() inside existing <style> blocks
  for (const style of Array.from(doc.querySelectorAll("style"))) {
    style.textContent = await inlineCssUrls(style.textContent ?? "", dir, zip);
  }

  // 3. Rewrite <img src> to data URIs
  for (const img of Array.from(doc.querySelectorAll<HTMLImageElement>("img[src]"))) {
    const src = img.getAttribute("src") ?? "";
    if (/^(data:|https?:)/.test(src)) continue;
    const uri = await toDataUri(zip, resolvePath(dir, src));
    if (uri) img.setAttribute("src", uri);
  }

  // 4. Remove scripts (sandboxed iframe blocks them anyway; avoid errors)
  doc.querySelectorAll("script").forEach((s) => s.remove());

  // 5. Remove viewport meta so our CSS controls sizing
  doc.querySelectorAll('meta[name="viewport"]').forEach((m) => m.remove());

  // 6. Inject theme CSS last so it wins over book styles
  const override = doc.createElement("style");
  override.textContent = themeCSS(themes[theme], fontSize);
  doc.head.appendChild(override);

  return "<!DOCTYPE html>" + doc.documentElement.outerHTML;
}

// ─────────────────────────────────────────────────────────────────────────────
// Top-level EPUB loader
// ─────────────────────────────────────────────────────────────────────────────

async function loadEpub(data: ArrayBuffer): Promise<ParsedEpub> {
  const zip = await JSZip.loadAsync(data);

  const containerEntry = zip.file("META-INF/container.xml");
  if (!containerEntry) throw new Error("Not a valid EPUB: META-INF/container.xml is missing");

  const opfPath = parseContainerXml(await containerEntry.async("string"));
  const opfDir = getDir(opfPath);
  const opfEntry = zip.file(opfPath);
  if (!opfEntry) throw new Error(`OPF not found: ${opfPath}`);

  const { manifest, spine } = parseOpf(await opfEntry.async("string"), opfDir);
  if (spine.length === 0) throw new Error("EPUB spine is empty — nothing to display");

  // TOC: EPUB3 NAV preferred, then EPUB2 NCX
  let toc: EpubTocItem[] = [];
  const navItem = Object.values(manifest).find(
    (m) => m.mediaType === "application/xhtml+xml" && /nav/i.test(m.href),
  );
  const ncxItem = Object.values(manifest).find(
    (m) => m.mediaType === "application/x-dtbncx+xml",
  );
  const tocEntry = (navItem ?? ncxItem) ? zip.file((navItem ?? ncxItem)!.href) : null;
  if (tocEntry) {
    const xml = await tocEntry.async("string");
    toc = ncxItem && !navItem
      ? parseNcx(xml, opfDir)
      : parseNav(xml, opfDir);
  }

  return { zip, spine, toc };
}

// ─────────────────────────────────────────────────────────────────────────────
// Flatten TOC for active-id matching
// ─────────────────────────────────────────────────────────────────────────────
function flatToc(items: EpubTocItem[]): EpubTocItem[] {
  return items.flatMap((i) => [i, ...flatToc(i.children ?? [])]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function EpubViewer({ file, onBack }: EpubViewerProps) {
  const { settings: appSettings } = useAppSettings();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const epubRef = useRef<ParsedEpub | null>(null);
  const isInitialLoad = useRef(true);

  const [fontSize, setFontSize] = useState(100);
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [showToc, setShowToc] = useState(false);
  const [spineIndex, setSpineIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toc, setToc] = useState<EpubTocItem[]>([]);
  const [activeTocId, setActiveTocId] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [chapterLoading, setChapterLoading] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);

  const [dictionaryQuery, setDictionaryQuery] = useState<{ word: string, x: number, y: number, results: string[] } | null>(null);
  const [selectionMenu, setSelectionMenu] = useState<{ x: number, y: number, text: string } | null>(null);

  const handleDefine = useCallback(async (word: string, x: number, y: number) => {
    const results = await lookupWord(word); 
    setDictionaryQuery({ word, x, y, results });
    setSelectionMenu(null);
  }, []);

  // ── Iframe Selection Bridge ──────────────────────────────────────────
  useEffect(() => {
    const frame = iframeRef.current;
    if (!frame || !ready) return;

    const onMouseUp = () => {
      const win = frame.contentWindow;
      const selection = win?.getSelection();
      const text = selection?.toString().trim();
      
      if (!text || text.length > 50) {
        setSelectionMenu(null);
        return;
      }

      const range = selection!.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const frameRect = frame.getBoundingClientRect();

      setSelectionMenu({
        x: rect.left + rect.width / 2 + frameRect.left,
        y: rect.top + frameRect.top,
        text,
      });
    };

    const onMouseDown = () => {
      if (dictionaryQuery) setDictionaryQuery(null);
      setSelectionMenu(null);
    };

    const setupListeners = () => {
      const doc = frame.contentDocument;
      if (!doc) return;
      doc.addEventListener("mouseup", onMouseUp);
      doc.addEventListener("mousedown", onMouseDown);
    };

    frame.addEventListener("load", setupListeners);
    setupListeners();

    return () => {
      const doc = frame.contentDocument;
      if (doc) {
        doc.removeEventListener("mouseup", onMouseUp);
        doc.removeEventListener("mousedown", onMouseDown);
      }
    };
  }, [ready, spineIndex, dictionaryQuery]);


  // ── Parse EPUB once ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!file.data) return;
    let cancelled = false;

    setReady(false);
    setError(null);
    epubRef.current = null;
    isInitialLoad.current = true;

    loadEpub(file.data)
      .then((parsed) => {
        if (cancelled) return;
        epubRef.current = parsed;
        setToc(parsed.toc);
        const saved = localStorage.getItem(`epub-progress-${file.id}`);
        const idx = saved ? parseInt(saved, 10) : 0;
        setSpineIndex(!isNaN(idx) && idx < parsed.spine.length ? idx : 0);
        setReady(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          console.error("EPUB load error:", err);
          setError(err instanceof Error ? err.message : "Could not open this EPUB file.");
        }
      });

    return () => { cancelled = true; };
  }, [file.id, file.data]);

  // ── Render chapter on index / theme / fontSize change ────────────────────
  useEffect(() => {
    const epub = epubRef.current;
    if (!ready || !epub) return;

    const item = epub.spine[spineIndex];
    if (!item) return;

    let cancelled = false;
    setChapterLoading(true);

    processChapter(epub.zip, item.href, theme, fontSize)
      .then((html) => {
        if (cancelled || !iframeRef.current) return;
        iframeRef.current.srcdoc = html;
        setChapterLoading(false);
        // Sync active TOC item
        const match = flatToc(epub.toc).find((t) => t.href === item.href);
        setActiveTocId(match?.id ?? null);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          console.error("Chapter render error:", err);
          setChapterLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [ready, spineIndex, theme, fontSize]);

  // ── Mark unsaved on spine/chapter change ────────────────────────────────
  useEffect(() => {
    if (ready) {
      if (isInitialLoad.current) {
        isInitialLoad.current = false;
        return;
      }

      // Auto-update progress percentage
      const total = epubRef.current?.spine.length ?? 1;
      const percentage = total > 1 ? Math.round((spineIndex / (total - 1)) * 100) : 100;
      updateProgress(file.id, percentage).catch(console.error);
    }

    // Ensure final progress is saved on unmount/exit
    return () => {
      if (ready && epubRef.current) {
        const total = epubRef.current.spine.length ?? 1;
        const finalPercentage = total > 1 ? Math.round((spineIndex / (total - 1)) * 100) : 100;
        updateProgress(file.id, finalPercentage).catch(console.error);
      }
    };
  }, [spineIndex, ready, file.id]);

  // ── Save progress ─────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    const total = epubRef.current?.spine.length ?? 1;
    const percentage = total > 1 ? Math.round((spineIndex / (total - 1)) * 100) : 100;
    await updateProgress(file.id, percentage);
    localStorage.setItem(`epub-progress-${file.id}`, String(spineIndex));
    setHasUnsavedChanges(false);
    toast.success("Reading progress saved");
  }, [spineIndex, file.id]);

  // ── Navigation ────────────────────────────────────────────────────────────
  const total = epubRef.current?.spine.length ?? 1;
  const atStart = spineIndex === 0;
  const atEnd = spineIndex >= total - 1;

  const goNext = useCallback(() => setSpineIndex((i) => Math.min((epubRef.current?.spine.length ?? 1) - 1, i + 1)), []);
  const goPrev = useCallback(() => setSpineIndex((i) => Math.max(0, i - 1)), []);

  // ── TOC selection ─────────────────────────────────────────────────────────
  const handleTocSelect = useCallback((item: TocItem) => {
    const epub = epubRef.current;
    const ti = item as EpubTocItem;
    if (!epub || !ti.href) return;
    const idx = epub.spine.findIndex((s) => s.href === ti.href);
    if (idx >= 0) setSpineIndex(idx);
    if (window.innerWidth < 768) setShowToc(false);
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight" || e.key === "PageDown") goNext();
      if (e.key === "ArrowLeft" || e.key === "PageUp") goPrev();
      if (e.key === " ") { e.preventDefault(); goNext(); }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); handleSave(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [goNext, goPrev, handleSave]);

  // ── Before-unload guard ───────────────────────────────────────────────────
  useEffect(() => {
    const fn = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [hasUnsavedChanges]);

  const handleBackWithCheck = useCallback(() => {
    if (hasUnsavedChanges) setShowUnsavedDialog(true);
    else onBack();
  }, [hasUnsavedChanges, onBack]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen flex-col bg-background" style={{ color: themes[theme].fg }}>

      {/* ── Toolbar ── */}
      <ViewerToolbar title={file.name} onBack={handleBackWithCheck}>
        <Button
          variant="ghost" size="icon"
          aria-label="Toggle contents"
          onClick={() => setShowToc((o) => !o)}
          className={showToc ? "bg-secondary" : ""}
        >
          <ListTree className="h-4 w-4" />
        </Button>



        <div className="flex-1" />

        {/* Font size */}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8"
            onClick={() => setFontSize((s) => Math.max(60, s - 10))}>
            <Minus className="h-3 w-3" />
          </Button>
          <span className="text-[10px] font-mono w-8 text-center">{fontSize}%</span>
          <Button variant="ghost" size="icon" className="h-8 w-8"
            onClick={() => setFontSize((s) => Math.min(200, s + 10))}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>

        {/* Theme swatches */}
        <div className="flex items-center gap-1 ml-2">
          {(Object.entries(themes) as [ThemeMode, (typeof themes)[ThemeMode]][])
            .slice(0, 6)
            .map(([key, t]) => (
              <button
                key={key}
                onClick={() => setTheme(key)}
                className={`w-5 h-5 rounded-full border-2 transition-all ${theme === key
                  ? "border-primary scale-110 shadow-sm"
                  : "border-transparent hover:scale-105"
                  }`}
                style={{ backgroundColor: t.bg }}
                title={t.label}
              />
            ))}
        </div>
      </ViewerToolbar>

      {/* ── Main area ── */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <DocumentTocSidebar
          title="Book contents"
          items={toc}
          isOpen={showToc}
          activeId={activeTocId}
          onClose={() => setShowToc(false)}
          onSelect={handleTocSelect}
        />

        {/* Chapter viewport */}
        <div
          className="relative flex-1 min-h-0 overflow-hidden"
          style={{ background: themes[theme].bg }}
        >
          {/* iframe is always mounted once ready so srcdoc updates are smooth */}
          <iframe
            ref={iframeRef}
            className="w-full h-full border-0"
            style={{ display: ready ? "block" : "none" }}
            sandbox="allow-same-origin"
            title="Book content"
          />

          {/* Loading overlay: only show on initial load. Chapter switches 
              will be nearly instant due to srcdoc, avoiding jarring flickers. */}
          {!ready && !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/90 z-10 pointer-events-none">
              <p className="text-muted-foreground animate-pulse">
                Opening book…
              </p>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/95 z-10 px-8 text-center gap-3">
              <p className="text-sm text-destructive font-medium">{error}</p>
              <p className="text-xs text-muted-foreground">
                The file must be a standard EPUB (ZIP-based, no DRM).
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Status bar ── */}
      <EpubStatusBar
        progress={
          activeTocId
            ? flatToc(toc).find((t) => t.id === activeTocId)?.label
            : ready
              ? `Chapter ${spineIndex + 1} of ${total}`
              : "Reading…"
        }
        theme={themes[theme].label}
        fontSize={fontSize}
        hasUnsavedChanges={hasUnsavedChanges}
      />

      <UnsavedChangesDialog
        isOpen={showUnsavedDialog}
        onClose={() => setShowUnsavedDialog(false)}
        onSave={() => { handleSave(); setShowUnsavedDialog(false); onBack(); }}
        onDiscard={() => { setHasUnsavedChanges(false); setShowUnsavedDialog(false); onBack(); }}
      />

      {/* ── Selection Context Menu ── */}
      {selectionMenu && (
        <div 
          className="fixed z-50 flex items-center gap-0.5 rounded-lg glass-surface border border-border px-1.5 py-1 shadow-xl animate-in fade-in zoom-in duration-200"
          style={{ 
            left: selectionMenu.x, 
            top: selectionMenu.y,
            transform: "translate(-50%, -120%)"
          }}
        >
          <button 
            onClick={() => handleDefine(selectionMenu.text, selectionMenu.x, selectionMenu.y)}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
          >
            <Book className="h-3 w-3" /> Define
          </button>
        </div>
      )}

      {dictionaryQuery && (
        <DictionaryPopover
          word={dictionaryQuery.word}
          definitions={dictionaryQuery.results}
          position={{ x: dictionaryQuery.x, y: dictionaryQuery.y }}
          onClose={() => setDictionaryQuery(null)}
        />
      )}
    </div>
  );
}