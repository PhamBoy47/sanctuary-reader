import { useCallback, useState } from "react";
import JSZip from "jszip";
import type { EpubThemeMode } from "@/stores/useEpubStore";

export interface ManifestItem {
  id: string;
  href: string;
  mediaType: string;
}

export interface SpineItem {
  id: string;
  href: string;
}

import type { EpubTocItem } from "@/types/epub";

export interface ParsedEpub {
  zip: JSZip;
  spine: SpineItem[];
  manifest: Record<string, ManifestItem>;
  toc: EpubTocItem[];
}

const themes: Record<EpubThemeMode, { bg: string; fg: string; link: string; label: string; selectionBg: string }> = {
  original: { bg: "inherit",   fg: "inherit",   link: "#f59e0b", label: "Original",       selectionBg: "rgba(245,158,11,0.25)" },
  light:    { bg: "#ffffff",   fg: "#18181b",   link: "#2563eb", label: "Pure Light",     selectionBg: "rgba(37,99,235,0.15)"  },
  sepia:    { bg: "#f4ecd8",   fg: "#3b2e1e",   link: "#965b31", label: "Sepia Paper",    selectionBg: "rgba(150,91,49,0.2)"   },
  warm:     { bg: "#fdf6e3",   fg: "#586e75",   link: "#268bd2", label: "Solarized",      selectionBg: "rgba(38,139,210,0.15)" },
  cool:     { bg: "#eef4fb",   fg: "#1e2d3d",   link: "#3b82f6", label: "Cool Day",       selectionBg: "rgba(59,130,246,0.15)" },
  dark:     { bg: "#141419",   fg: "#d4d4d8",   link: "#f59e0b", label: "Soft Dark",      selectionBg: "rgba(245,158,11,0.2)"  },
  midnight: { bg: "#000000",   fg: "#94a3b8",   link: "#38bdf8", label: "Midnight",       selectionBg: "rgba(56,189,248,0.18)" },
};

export function useEpubEngine() {
  const [parsedEpub, setParsedEpub] = useState<ParsedEpub | null>(null);

  const getDir = useCallback((path: string) => {
    const parts = path.split("/");
    parts.pop();
    return parts.length > 0 ? parts.join("/") + "/" : "";
  }, []);

  const resolvePath = useCallback((dir: string, rel: string) => {
    if (rel.startsWith("/")) return rel.substring(1);
    const combined = dir + rel;
    const parts = combined.split("/");
    const resolved: string[] = [];
    for (const p of parts) {
      if (p === "..") resolved.pop();
      else if (p !== "." && p !== "") resolved.push(p);
    }
    return resolved.join("/");
  }, []);

  const parseContainerXml = (xml: string) => {
    const m = xml.match(/full-path="([^"]+)"/);
    if (!m) throw new Error("container.xml: no full-path attribute found");
    return m[1];
  };

  const parseOpf = (xml: string, opfDir: string) => {
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
  };

  const parseNcx = (xml: string, opfDir: string): EpubTocItem[] => {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    let n = 0;
    const walk = (nodes: Element[]): EpubTocItem[] => {
      return nodes.map((el) => {
        const label = el.querySelector("navLabel text")?.textContent?.trim() ?? "Section";
        const src = el.querySelector("content")?.getAttribute("src") ?? "";
        const href = src ? opfDir + src.split("#")[0] : "";
        const children = walk(Array.from(el.children).filter((c) => c.tagName === "navPoint") as Element[]);
        return { id: `toc-${n++}`, label, href, children };
      });
    };
    return walk(Array.from(doc.querySelectorAll("navMap > navPoint")));
  };

  const parseNav = (xml: string, opfDir: string): EpubTocItem[] => {
    const doc = new DOMParser().parseFromString(xml, "text/html");
    const nav = doc.querySelector('nav[epub\\:type="toc"]') ??
                doc.querySelector("nav[*|type='toc']") ??
                doc.querySelector("nav");
    if (!nav) return [];
    let n = 0;
    const walkOl = (ol: Element): EpubTocItem[] => {
      return Array.from(ol.children).filter((c) => c.tagName === "LI").map((li) => {
        const a = li.querySelector("a");
        const label = a?.textContent?.trim() ?? "Section";
        const rawHref = a?.getAttribute("href") ?? "";
        const href = rawHref ? opfDir + rawHref.split("#")[0] : "";
        const childOl = li.querySelector("ol");
        return { id: `toc-${n++}`, label, href, children: childOl ? walkOl(childOl) : [] };
      });
    };
    const ol = nav.querySelector("ol");
    return ol ? walkOl(ol) : [];
  };

  const toDataUri = useCallback(async (zip: JSZip, path: string) => {
    const MIME_EXT: Record<string, string> = {
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
      svg: "image/svg+xml", webp: "image/webp",
      woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
    };
    const entry = zip.file(path);
    if (!entry) return null;
    const b64 = await entry.async("base64");
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    const mime = MIME_EXT[ext] ?? "application/octet-stream";
    return `data:${mime};base64,${b64}`;
  }, []);

  const inlineCssUrls = useCallback(async (css: string, cssDir: string, zip: JSZip) => {
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
      if (uri) css = css.replace(token, `url("${uri}")`);
    }
    return css;
  }, [resolvePath, toDataUri]);

  const fetchCss = useCallback(async (zip: JSZip, cssPath: string) => {
    const entry = zip.file(cssPath);
    if (!entry) return "";
    const raw = await entry.async("string");
    return inlineCssUrls(raw, getDir(cssPath), zip);
  }, [getDir, inlineCssUrls]);

  const themeCSS = (t: typeof themes[EpubThemeMode], fontSize: number, fontFamily?: string) => {
    const isLight = ["#ffffff", "#f4ecd8", "#fdf6e3", "#eef4fb"].includes(t.bg);
    const mutedFg = isLight ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.35)";
    const borderColor = isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.06)";
    const family = fontFamily || "'Georgia', 'Palatino Linotype', 'Book Antiqua', serif";
    return `
      body { font-size: ${fontSize}%; }
      body {
        background:    ${t.bg};
        color:         ${t.fg};
        font-family:   ${family};
        font-size:     1rem;
        line-height:   1.85;
        letter-spacing: 0.01em;
        padding:       2rem 4rem;
        margin:        0;
        max-width:     720px;
        margin-left:   auto;
        margin-right:  auto;
        -webkit-font-smoothing: antialiased;
      }
      ::selection { background: ${t.selectionBg}; }
      h1 { font-size: 1.8em; font-weight: 700; line-height: 1.2; margin: 1.5em 0 0.5em; }
      h2 { font-size: 1.4em; font-weight: 600; line-height: 1.3; margin: 1.3em 0 0.4em; }
      h3,h4,h5,h6 { font-weight: 600; margin: 1em 0 0.3em; }
      p { margin: 0 0 0.9em; }
      p + p { text-indent: 1.5em; margin-top: 0; }
      body > p:first-of-type { text-indent: 0; }
      span, li, td, th, div { color: ${t.fg}; }
      a { color: ${t.link}; text-decoration: none; border-bottom: 1px solid ${t.link}44; }
      a:hover { border-bottom-color: ${t.link}; }
      blockquote {
        border-left: 3px solid ${t.link}66;
        margin: 1.2em 0;
        padding: 0.6em 1.2em;
        color: ${mutedFg};
        font-style: italic;
      }
      hr { border: none; border-top: 1px solid ${borderColor}; margin: 2em 0; }
      img { max-width: 100%; height: auto; border-radius: 6px; display: block; margin: 1em auto; }
      code, pre { font-family: ui-monospace, 'JetBrains Mono', monospace; font-size: 0.88em; }
      pre { background: ${borderColor}; padding: 1em; border-radius: 6px; overflow-x: auto; }
    `;
  };

  const loadEpub = useCallback(async (data: ArrayBuffer): Promise<ParsedEpub> => {
    const zip = await JSZip.loadAsync(data);
    const containerEntry = zip.file("META-INF/container.xml");
    if (!containerEntry) throw new Error("Not a valid EPUB: META-INF/container.xml is missing");
    const opfPath = parseContainerXml(await containerEntry.async("string"));
    const opfDir = getDir(opfPath);
    const opfEntry = zip.file(opfPath);
    if (!opfEntry) throw new Error(`OPF not found: ${opfPath}`);
    const { manifest, spine } = parseOpf(await opfEntry.async("string"), opfDir);
    if (spine.length === 0) throw new Error("EPUB spine is empty — nothing to display");

    // TOC: Try Nav (EPUB3) then NCX (EPUB2)
    let toc: EpubTocItem[] = [];
    const navItem = Object.values(manifest).find(m => m.mediaType === 'application/xhtml+xml' && (m.id === 'nav' || m.href.includes('nav')));
    const ncxItem = Object.values(manifest).find(m => m.mediaType === 'application/x-dtbncx+xml');
    
    if (navItem) {
      const navXml = await zip.file(navItem.href)?.async("string");
      if (navXml) toc = parseNav(navXml, opfDir);
    }
    if (toc.length === 0 && ncxItem) {
      const ncxXml = await zip.file(ncxItem.href)?.async("string");
      if (ncxXml) toc = parseNcx(ncxXml, opfDir);
    }

    const parsed = { zip, spine, manifest, toc };
    setParsedEpub(parsed);
    return parsed;
  }, [getDir]);

  const processChapter = useCallback(async (
    href: string,
    theme: EpubThemeMode,
    fontSize: number,
    fontFamily?: string,
  ): Promise<string> => {
    if (!parsedEpub) throw new Error("EPUB not loaded");
    const { zip } = parsedEpub;
    const entry = zip.file(href);
    if (!entry) throw new Error(`Spine item not found in ZIP: ${href}`);
    const raw = await entry.async("string");
    const dir = getDir(href);
    const doc = new DOMParser().parseFromString(raw, "text/html");
    for (const link of Array.from(doc.querySelectorAll<HTMLElement>('link[rel="stylesheet"]'))) {
      const lhref = link.getAttribute("href") ?? "";
      if (!lhref || /^https?:/.test(lhref)) continue;
      const css = await fetchCss(zip, resolvePath(dir, lhref));
      const style = doc.createElement("style");
      style.textContent = css;
      link.replaceWith(style);
    }
    for (const style of Array.from(doc.querySelectorAll("style"))) {
      style.textContent = await inlineCssUrls(style.textContent ?? "", dir, zip);
    }
    for (const img of Array.from(doc.querySelectorAll<HTMLImageElement>("img[src]"))) {
      const src = img.getAttribute("src") ?? "";
      if (/^(data:|https?:)/.test(src)) continue;
      const uri = await toDataUri(zip, resolvePath(dir, src));
      if (uri) img.setAttribute("src", uri);
    }
    doc.querySelectorAll("script").forEach((s) => s.remove());
    doc.querySelectorAll('meta[name="viewport"]').forEach((m) => m.remove());
    const override = doc.createElement("style");
    override.textContent = themeCSS(themes[theme], fontSize, fontFamily);
    doc.head.appendChild(override);
    return "<!DOCTYPE html>" + doc.documentElement.outerHTML;
  }, [fetchCss, getDir, inlineCssUrls, parsedEpub, resolvePath, toDataUri]);

  const processChapterBody = useCallback(async (
    href: string,
    theme: EpubThemeMode,
    fontSize: number,
    fontFamily?: string,
  ): Promise<{ styles: string; bodyHTML: string }> => {
    const fullHTML = await processChapter(href, theme, fontSize, fontFamily);
    const doc = new DOMParser().parseFromString(fullHTML, "text/html");
    const styles = Array.from(doc.head.querySelectorAll("style")).map(s => s.textContent).join("\n");
    return { styles, bodyHTML: doc.body.innerHTML };
  }, [processChapter]);

  return { loadEpub, processChapter, processChapterBody, parsedEpub, themes };
}
