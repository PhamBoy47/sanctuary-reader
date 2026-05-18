import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { ListTree, Minus, Plus, Book, Search, Bookmark as BookmarkIcon, Highlighter, Copy, Download, GripVertical, ChevronLeft, ChevronRight, Columns, ScrollText, RotateCcw } from "lucide-react";
import { ExportDialog } from "@/components/ExportDialog";
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
import { useAnnotationHistory } from "@/hooks/useAnnotationHistory";
import { getHighlights, type Highlight } from "@/lib/annotationStore";
import { BookmarkPanel } from "@/components/BookmarkPanel";
import { HighlightPanel } from "@/components/HighlightPanel";
import { PdfSearchBar } from "@/components/PdfSearchBar";
import { useEpubStore } from "@/stores/useEpubStore";
import { useEpubEngine } from "@/hooks/useEpubEngine";
import { useSearchWorker } from "@/hooks/useSearchWorker";
import { useEpubPagination } from "@/hooks/useEpubPagination";
import { EpubTocItem } from "@/types/epub";
import { generateCfi, resolveCfi } from "@/lib/epubCfi";

interface EpubViewerProps { file: FileEntry; onBack: () => void; }

function flatToc(items: EpubTocItem[]): EpubTocItem[] {
  return items.flatMap((i) => [i, ...flatToc(i.children ?? [])]);
}

export function EpubViewer({ file, onBack }: EpubViewerProps) {
  const { settings: appSettings } = useAppSettings();
  const history = useAnnotationHistory(file.id);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const isInitialLoad = useRef(true);
  const epubTexts = useRef<{ index: number; text: string }[]>([]);
  const fileIdRef = useRef(file.id);
  const searchIdRef = useRef(0);
  const extractCancelledRef = useRef(false);
  const highlightsCacheRef = useRef<Highlight[]>([]);

  const { search: runWorkerSearch, results: workerResults, isSearching } = useSearchWorker();
  const {
    currentPage: chapterPage,
    totalPages: chapterTotal,
    nextPage: nextChapterPage,
    prevPage: prevChapterPage,
    applyPagination,
    removePagination,
    recalculate,
  } = useEpubPagination(iframeRef);

  const {
    page: spineIndex, setPage: setSpineIndex,
    totalPages: total, setTotalPages: setTotal,
    settings, setSettings,
    sidebarTab, setSidebarTab,
    showSearch, setShowSearch,
    searchQuery, setSearchQuery,
    searchResults, setSearchResults,
    currentResultIdx, setCurrentResultIdx,
    hasUnsavedChanges, setHasUnsavedChanges,
    navHistory, navIndex, pushNavHistory, setNavIndex,
    reset: resetStore, saveSettings, loadSettings,
  } = useEpubStore();

  useEffect(() => {
    if (fileIdRef.current !== file.id) {
      fileIdRef.current = file.id;
      resetStore();
      loadSettings(file.id);
      epubTexts.current = [];
      highlightsCacheRef.current = [];
      extractCancelledRef.current = true;
      isInitialLoad.current = true;
    }
  }, [file.id, resetStore, loadSettings]);

  useEffect(() => {
    const nextSearchId = ++searchIdRef.current;
    setSearchResults(workerResults.map((result) => ({
      spineIndex: result.page,
      matchIndex: result.index,
    })));
    if (nextSearchId === searchIdRef.current && workerResults.length > 0) {
      setCurrentResultIdx(1);
    }
  }, [workerResults, setSearchResults, setCurrentResultIdx]);

  const { loadEpub, processChapter, parsedEpub, themes } = useEpubEngine();

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toc, setToc] = useState<EpubTocItem[]>([]);
  const [activeTocId, setActiveTocId] = useState<string | null>(null);
  const [chapterLoading, setChapterLoading] = useState(false);
  const [chapterError, setChapterError] = useState<string | null>(null);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [dictionaryQuery, setDictionaryQuery] = useState<{ word: string, x: number, y: number, results: string[] } | null>(null);
  const [selectionMenu, setSelectionMenu] = useState<{ x: number, y: number, text: string } | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [highlightColor, setHighlightColor] = useState("rgb(255,235,59)");
  const [searchBarSeed, setSearchBarSeed] = useState("");

  const isNavJump = useRef(false);

  const handleDefine = useCallback(async (word: string, x: number, y: number) => {
    const results = await lookupWord(word);
    setDictionaryQuery({ word, x, y, results });
    setSelectionMenu(null);
  }, []);

  const reloadHighlights = useCallback(async () => {
    const hl = await getHighlights(file.id);
    highlightsCacheRef.current = hl;
    setHighlights(hl);
  }, [file.id]);

  useEffect(() => { reloadHighlights(); }, [reloadHighlights, history.annotationVersion]);

  const applyHighlightsToIframe = useCallback(() => {
    const frame = iframeRef.current;
    if (!frame) return;
    const doc = frame.contentDocument;
    if (!doc?.body) return;
    const chapterHighlights = highlightsCacheRef.current.filter(h => h.page === spineIndex);
    if (chapterHighlights.length === 0) return;

    for (const hl of chapterHighlights) {
      if (hl.cfi) {
        const range = resolveCfi(hl.cfi, doc);
        if (range) {
          try {
            const mark = doc.createElement("mark");
            mark.style.backgroundColor = hl.color;
            mark.style.opacity = "0.4";
            mark.style.borderRadius = "2px";
            mark.style.padding = "0 1px";
            range.surroundContents(mark);
          } catch { /* skip failed highlights */ }
        }
      } else if (hl.charOffset !== undefined && hl.charLength !== undefined) {
        const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
        const textNodes: Text[] = [];
        let n: Node | null;
        while ((n = walker.nextNode())) textNodes.push(n as Text);
        let offset = 0;
        for (const tn of textNodes) {
          const len = tn.textContent?.length || 0;
          if (hl.charOffset! >= offset && hl.charOffset! < offset + len) {
            try {
              const startInNode = hl.charOffset! - offset;
              const endInNode = Math.min(startInNode + hl.charLength!, len);
              const range = doc.createRange();
              range.setStart(tn, startInNode);
              range.setEnd(tn, endInNode);
              const mark = doc.createElement("mark");
              mark.style.backgroundColor = hl.color;
              mark.style.opacity = "0.4";
              mark.style.borderRadius = "2px";
              mark.style.padding = "0 1px";
              range.surroundContents(mark);
            } catch { /* skip */ }
            break;
          }
          offset += len;
        }
      }
    }
  }, [spineIndex]);

  const applySearchHighlightsToIframe = useCallback(() => {
    const frame = iframeRef.current;
    if (!frame) return;
    const doc = frame.contentDocument;
    if (!doc?.body) return;

    const oldMarks = doc.querySelectorAll('mark.search-match');
    oldMarks.forEach(mark => {
      const parent = mark.parentNode;
      if (parent) {
        while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
        parent.removeChild(mark);
      }
    });

    if (!searchQuery.trim()) return;
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) textNodes.push(node as Text);
    const lq = searchQuery.toLowerCase();
    for (const tn of textNodes) {
      const text = tn.textContent || "";
      const ltext = text.toLowerCase();
      const pos = ltext.indexOf(lq);
      if (pos !== -1) {
        try {
          const range = doc.createRange();
          range.setStart(tn, pos);
          range.setEnd(tn, pos + lq.length);
          const mark = doc.createElement("mark");
          mark.className = "search-match";
          mark.style.backgroundColor = "rgba(250, 204, 21, 0.5)";
          mark.style.border = "1px solid rgba(234, 179, 8, 0.6)";
          mark.style.borderRadius = "2px";
          range.surroundContents(mark);
        } catch { /* skip */ }
      }
    }
  }, [searchQuery]);

  useEffect(() => {
    if (ready) applySearchHighlightsToIframe();
  }, [searchQuery, spineIndex, ready, applySearchHighlightsToIframe]);

  const getCharOffsetFromSelection = useCallback((): { charOffset: number; charLength: number } | null => {
    const frame = iframeRef.current;
    if (!frame) return null;
    const doc = frame.contentDocument;
    const selection = frame.contentWindow?.getSelection();
    if (!doc?.body || !selection?.rangeCount) return null;
    const range = selection.getRangeAt(0);
    const text = selection.toString();
    if (!text) return null;
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    let charOffset = 0;
    let n: Node | null;
    while ((n = walker.nextNode())) {
      if (n === range.startContainer) { charOffset += range.startOffset; break; }
      charOffset += (n as Text).textContent?.length || 0;
    }
    return { charOffset, charLength: text.length };
  }, []);

  const handleHighlightSelection = useCallback(async () => {
    if (!selectionMenu) return;
    const frame = iframeRef.current;
    const selection = frame?.contentWindow?.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const cfi = generateCfi(range, spineIndex);
    const pos = getCharOffsetFromSelection();

    await history.doAddHighlight(
      spineIndex,
      highlightColor,
      selectionMenu.text,
      [],
      pos?.charOffset,
      pos?.charLength,
      cfi
    );
    toast.success("Text highlighted");
    setHasUnsavedChanges(true);
    setSelectionMenu(null);
    setTimeout(applyHighlightsToIframe, 100);
  }, [selectionMenu, getCharOffsetFromSelection, history, spineIndex, highlightColor, applyHighlightsToIframe, setHasUnsavedChanges]);

  const getTocLabelForChapter = useCallback((spineIdx: number): string => {
    if (!parsedEpub) return `Chapter ${spineIdx + 1}`;
    const item = parsedEpub.spine[spineIdx];
    if (!item) return `Chapter ${spineIdx + 1}`;
    const match = flatToc(parsedEpub.toc).find((t) => t.href === item.href);
    return match?.label || `Chapter ${spineIdx + 1}`;
  }, [parsedEpub]);

  const handleBookmarkChapter = useCallback(async () => {
    const label = getTocLabelForChapter(spineIndex);
    await history.doAddBookmark(spineIndex + 1, label);
    toast.success(`Bookmarked: ${label}`);
    setHasUnsavedChanges(true);
    setSelectionMenu(null);
  }, [history, spineIndex, setHasUnsavedChanges, getTocLabelForChapter]);

  const handleCopySelection = useCallback(() => {
    if (!selectionMenu) return;
    navigator.clipboard.writeText(selectionMenu.text);
    toast.success("Copied to clipboard");
    setSelectionMenu(null);
  }, [selectionMenu]);

  const handleSearchFromSelection = useCallback(() => {
    if (!selectionMenu) return;
    setSearchBarSeed(selectionMenu.text);
    setShowSearch(true);
    setSelectionMenu(null);
  }, [selectionMenu, setShowSearch]);

  useEffect(() => {
    const frame = iframeRef.current;
    if (!frame || !ready) return;
    const currentDoc = frame.contentDocument;
    const onMouseUp = () => {
      const win = frame.contentWindow;
      const selection = win?.getSelection();
      const text = selection?.toString().trim();
      if (!text || text.length > 200) { setSelectionMenu(null); return; }
      const range = selection!.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const frameRect = frame.getBoundingClientRect();
      setSelectionMenu({ x: rect.left + rect.width / 2 + frameRect.left, y: rect.top + frameRect.top, text });
    };
    const onMouseDown = () => {
      if (dictionaryQuery) setDictionaryQuery(null);
      setSelectionMenu(null);
    };
    const onLoad = () => {
      const doc = frame.contentDocument;
      if (!doc) return;
      doc.addEventListener("mouseup", onMouseUp);
      doc.addEventListener("mousedown", onMouseDown);
      applyHighlightsToIframe();
      applySearchHighlightsToIframe();
    };
    frame.addEventListener("load", onLoad);
    if (currentDoc) {
      currentDoc.addEventListener("mouseup", onMouseUp);
      currentDoc.addEventListener("mousedown", onMouseDown);
      applyHighlightsToIframe();
      applySearchHighlightsToIframe();
    }
    return () => {
      frame.removeEventListener("load", onLoad);
      if (frame.contentDocument) {
        frame.contentDocument.removeEventListener("mouseup", onMouseUp);
        frame.contentDocument.removeEventListener("mousedown", onMouseDown);
      } else if (currentDoc) {
        currentDoc.removeEventListener("mouseup", onMouseUp);
        currentDoc.removeEventListener("mousedown", onMouseDown);
      }
    };
  }, [ready, spineIndex, dictionaryQuery, applyHighlightsToIframe, applySearchHighlightsToIframe]);

  useEffect(() => {
    if (!file.data) return;
    let cancelled = false;
    setReady(false);
    setError(null);
    isInitialLoad.current = true;

    loadEpub(file.data)
      .then((parsed) => {
        if (cancelled) return;
        setToc(parsed.toc);
        setTotal(parsed.spine.length);
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
  }, [file.id, file.data, loadEpub, setTotal, setSpineIndex]);

  const [textsExtracted, setTextsExtracted] = useState(false);

  useEffect(() => {
    if (!parsedEpub) {
      epubTexts.current = [];
      setTextsExtracted(false);
      return;
    }
    extractCancelledRef.current = false;
    const cancelledRef = extractCancelledRef;
    const extract = async () => {
      const texts: { index: number; text: string }[] = [];
      for (let i = 0; i < parsedEpub.spine.length; i++) {
        if (cancelledRef.current) return;
        const entry = parsedEpub.zip.file(parsedEpub.spine[i].href);
        if (!entry) continue;
        try {
          const html = await entry.async("string");
          if (cancelledRef.current) return;
          const doc = new DOMParser().parseFromString(html, "text/html");
          const text = doc.body.textContent || "";
          texts.push({ index: i, text });
        } catch { /* skip corrupt chapter */ }
      }
      if (!cancelledRef.current) {
        epubTexts.current = texts;
        setTextsExtracted(true);
      }
    };
    extract();
    return () => { cancelledRef.current = true; };
  }, [parsedEpub]);

  useEffect(() => {
    if (textsExtracted && searchQuery.trim()) {
      runWorkerSearch(searchQuery, epubTexts.current);
    }
  }, [textsExtracted, searchQuery, runWorkerSearch]);

  useEffect(() => {
    if (!ready || !parsedEpub) return;
    const item = parsedEpub.spine[spineIndex];
    if (!item) return;
    let cancelled = false;
    setChapterLoading(true);
    setChapterError(null);

    processChapter(item.href, settings.theme, settings.fontSize, settings.fontFamily)
      .then((html) => {
        if (cancelled || !iframeRef.current) return;
        iframeRef.current.srcdoc = html;
        setChapterLoading(false);
        const match = flatToc(parsedEpub.toc).find((t) => t.href === item.href);
        setActiveTocId(match?.id ?? null);

        if (settings.paginationMode && iframeRef.current) {
          applyPagination(iframeRef.current, iframeRef.current.clientWidth, iframeRef.current.clientHeight);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          console.error("Chapter render error:", err);
          setChapterError("Failed to render this chapter. The file may be corrupted.");
          setChapterLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [ready, spineIndex, settings.theme, settings.fontSize, settings.fontFamily, parsedEpub, processChapter, settings.paginationMode, applyPagination]);

  useEffect(() => {
    if (!ready || !iframeRef.current) return;
    if (settings.paginationMode) {
      applyPagination(iframeRef.current, iframeRef.current.clientWidth, iframeRef.current.clientHeight);
    } else {
      removePagination(iframeRef.current);
    }
  }, [settings.paginationMode, ready, applyPagination, removePagination]);

  useEffect(() => {
    const handleResize = () => {
      if (settings.paginationMode && iframeRef.current) {
        recalculate(iframeRef.current, iframeRef.current.clientWidth);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [settings.paginationMode, recalculate]);

  useEffect(() => {
    if (ready) {
      if (isInitialLoad.current) { isInitialLoad.current = false; return; }
      const percentage = total > 1 ? Math.round((spineIndex / (total - 1)) * 100) : 100;
      updateProgress(file.id, percentage).catch(console.error);
    }
    return () => {};
  }, [spineIndex, ready, file.id, total]);

  const handleSave = useCallback(async () => {
    const percentage = total > 1 ? Math.round((spineIndex / (total - 1)) * 100) : 100;
    try {
      await updateProgress(file.id, percentage);
      localStorage.setItem(`epub-progress-${file.id}`, String(spineIndex));
      saveSettings(file.id);
      setHasUnsavedChanges(false);
      toast.success("Reading progress saved");
    } catch {
      toast.error("Failed to save progress");
    }
  }, [spineIndex, file.id, total, setHasUnsavedChanges, saveSettings]);

  const navigateToChapter = useCallback((idx: number) => {
    const clamped = Math.max(0, Math.min(total - 1, idx));
    if (!isNavJump.current && clamped !== spineIndex) {
      pushNavHistory(String(clamped));
    }
    isNavJump.current = false;
    setSpineIndex(clamped);
  }, [spineIndex, total, pushNavHistory, setSpineIndex]);

  const navigateBack = useCallback(() => {
    if (navIndex > 0) {
      const prevIdx = parseInt(navHistory[navIndex - 1], 10);
      if (!isNaN(prevIdx)) {
        isNavJump.current = true;
        setNavIndex(navIndex - 1);
        setSpineIndex(prevIdx);
      }
    }
  }, [navIndex, navHistory, setNavIndex, setSpineIndex]);

  const navigateForward = useCallback(() => {
    if (navIndex < navHistory.length - 1) {
      const nextIdx = parseInt(navHistory[navIndex + 1], 10);
      if (!isNaN(nextIdx)) {
        isNavJump.current = true;
        setNavIndex(navIndex + 1);
        setSpineIndex(nextIdx);
      }
    }
  }, [navIndex, navHistory, setNavIndex, setSpineIndex]);

  const goNext = useCallback(() => {
    if (settings.paginationMode) {
      if (nextChapterPage()) return;
    }
    navigateToChapter(spineIndex + 1);
  }, [navigateToChapter, spineIndex, settings.paginationMode, nextChapterPage]);

  const goPrev = useCallback(() => {
    if (settings.paginationMode) {
      if (prevChapterPage()) return;
    }
    navigateToChapter(spineIndex - 1);
  }, [navigateToChapter, spineIndex, settings.paginationMode, prevChapterPage]);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      setCurrentResultIdx(0);
      return;
    }
    runWorkerSearch(query, epubTexts.current);
  }, [runWorkerSearch, setSearchQuery, setSearchResults, setCurrentResultIdx]);

  const handleNextResult = useCallback(() => {
    if (searchResults.length === 0) return;
    const next = currentResultIdx >= searchResults.length ? 1 : currentResultIdx + 1;
    setCurrentResultIdx(next);
    navigateToChapter(searchResults[next - 1].spineIndex);
  }, [searchResults, currentResultIdx, navigateToChapter, setCurrentResultIdx]);

  const handlePrevResult = useCallback(() => {
    if (searchResults.length === 0) return;
    const prev = currentResultIdx <= 1 ? searchResults.length : currentResultIdx - 1;
    setCurrentResultIdx(prev);
    navigateToChapter(searchResults[prev - 1].spineIndex);
  }, [searchResults, currentResultIdx, navigateToChapter, setCurrentResultIdx]);

  const handleTocSelect = useCallback((item: TocItem) => {
    const ti = item as EpubTocItem;
    if (!parsedEpub || !ti.href) return;
    const idx = parsedEpub.spine.findIndex((s) => s.href === ti.href);
    if (idx >= 0) navigateToChapter(idx);
    if (window.innerWidth < 768) setSidebarTab(null);
  }, [navigateToChapter, parsedEpub, setSidebarTab]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditable = tag === "INPUT" || tag === "TEXTAREA";
      if (isEditable && e.key !== "Escape" && !(e.ctrlKey || e.metaKey)) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === "f") { e.preventDefault(); setShowSearch(true); return; }
      if (e.key === "Escape" && showSearch) { setShowSearch(false); setSearchResults([]); setCurrentResultIdx(0); setSearchQuery(""); return; }
      if (ctrl && e.key === "s") { e.preventDefault(); handleSave(); return; }
      if (ctrl && e.key === "b") { e.preventDefault(); setSidebarTab(sidebarTab ? null : "toc"); return; }
      if (ctrl && e.key === ",") { e.preventDefault(); setSidebarTab("bookmarks"); return; }
      if (ctrl && e.key === "z") { e.preventDefault(); history.undo(); return; }
      if (ctrl && e.key === "y") { e.preventDefault(); history.redo(); return; }
      if (ctrl && e.key === "l") { e.preventDefault(); document.documentElement.requestFullscreen?.(); return; }
      if (e.shiftKey && e.key === "H") { handleHighlightSelection(); return; }
      if (ctrl && e.key === "ArrowLeft") { e.preventDefault(); navigateBack(); return; }
      if (ctrl && e.key === "ArrowRight") { e.preventDefault(); navigateForward(); return; }
      if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); goNext(); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); goPrev(); }
      else if (e.key === " ") { e.preventDefault(); goNext(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [goNext, goPrev, handleSave, showSearch, handleHighlightSelection, sidebarTab, setShowSearch, setSearchQuery, setSearchResults, setCurrentResultIdx, setSidebarTab, history, navigateBack, navigateForward]);

  useEffect(() => {
    const fn = (e: BeforeUnloadEvent) => { if (hasUnsavedChanges) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [hasUnsavedChanges]);

  const handleBackWithCheck = useCallback(() => {
    if (hasUnsavedChanges) {
      saveSettings(file.id);
      setShowUnsavedDialog(true);
    }
    else onBack();
  }, [hasUnsavedChanges, onBack, saveSettings, file.id]);

  const statusProgress = useMemo(() => {
    if (settings.paginationMode) {
      return `Chapter ${spineIndex + 1} • Page ${chapterPage} of ${chapterTotal}`;
    }
    if (activeTocId) {
      const flat = flatToc(toc);
      const found = flat.find((t) => t.id === activeTocId);
      return found?.label || `Chapter ${spineIndex + 1} of ${total}`;
    }
    return ready ? `Chapter ${spineIndex + 1} of ${total}` : "Reading…";
  }, [settings.paginationMode, spineIndex, chapterPage, chapterTotal, activeTocId, toc, ready, total]);

  return (
    <div className="flex h-screen flex-col bg-background">
      <ViewerToolbar title={file.name} onBack={handleBackWithCheck}>
        <Button
          variant={sidebarTab === "toc" ? "secondary" : "ghost"} size="icon"
          onClick={() => setSidebarTab(sidebarTab === "toc" ? null : "toc")}
        >
          <ListTree className="h-4 w-4" />
        </Button>
        <Button
          variant={sidebarTab === "bookmarks" ? "secondary" : "ghost"} size="icon"
          onClick={() => setSidebarTab(sidebarTab === "bookmarks" ? null : "bookmarks")}
          title="Bookmarks (Ctrl + ,)"
        >
          <BookmarkIcon className="h-4 w-4" />
        </Button>
        <Button
          variant={sidebarTab === "highlights" ? "secondary" : "ghost"} size="icon"
          onClick={() => setSidebarTab(sidebarTab === "highlights" ? null : "highlights")}
          title="Highlights"
        >
          <Highlighter className="h-4 w-4" />
        </Button>
        <div className="w-px h-5 bg-border mx-1" />
        <Button
          variant={settings.paginationMode ? "secondary" : "ghost"} size="icon"
          onClick={() => setSettings(s => ({ ...s, paginationMode: !s.paginationMode }))}
          title={settings.paginationMode ? "Switch to Scroll Mode" : "Switch to Page Mode"}
        >
          {settings.paginationMode ? <ScrollText className="h-4 w-4" /> : <Columns className="h-4 w-4" />}
        </Button>
        <div className="w-px h-5 bg-border mx-1" />
        <Button
          type="button" variant="ghost" size="icon" className="h-8 w-8"
          onClick={() => setShowSearch(!showSearch)}
          title="Find (Ctrl+F)"
        >
          <Search className="h-4 w-4" />
        </Button>
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8"
            onClick={() => setSettings(s => ({ ...s, fontSize: Math.max(60, s.fontSize - 10) }))}>
            <Minus className="h-3 w-3" />
          </Button>
          <span className="text-[10px] font-mono w-8 text-center">{settings.fontSize}%</span>
          <Button variant="ghost" size="icon" className="h-8 w-8"
            onClick={() => setSettings(s => ({ ...s, fontSize: Math.min(200, s.fontSize + 10) }))}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
        <div className="flex items-center gap-1 ml-2">
          {(Object.entries(themes) as Array<[keyof typeof themes, (typeof themes)[keyof typeof themes]]>).map(([key, t]) => (
            <button
              key={key}
              onClick={() => setSettings(s => ({ ...s, theme: key }))}
              className={`w-5 h-5 rounded-full border-2 transition-all ${settings.theme === key
                ? "border-primary scale-110 shadow-sm"
                : "border-transparent hover:scale-105"
                }`}
              style={{ backgroundColor: t.bg }}
              title={t.label}
            />
          ))}
        </div>
        <div className="w-px h-5 bg-border mx-1" />
        <Button
          variant="ghost" size="icon" className="h-8 w-8"
          onClick={() => setShowExportDialog(true)}
          title="Export Annotations"
        >
          <Download className="h-4 w-4" />
        </Button>
      </ViewerToolbar>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {sidebarTab === "toc" && (
          <DocumentTocSidebar
            title="Book contents"
            items={toc}
            isOpen={true}
            activeId={activeTocId}
            onClose={() => setSidebarTab(null)}
            onSelect={handleTocSelect}
          />
        )}
        {sidebarTab === "bookmarks" && (
          <aside className="absolute inset-y-0 left-0 z-30 flex w-56 max-w-[85vw] flex-col border-r border-border glass-surface md:relative md:max-w-none md:shrink-0">
            <BookmarkPanel
              fileId={file.id}
              currentPage={spineIndex + 1}
              onPageSelect={(p) => navigateToChapter(p - 1)}
              version={history.annotationVersion}
              pageLabel="ch."
              onAdd={(pg, label) => history.doAddBookmark(pg, label).then(() => { setHasUnsavedChanges(true); })}
              onRemove={(id, bm) => history.doRemoveBookmark(id, bm).then(() => { setHasUnsavedChanges(true); })}
            />
          </aside>
        )}
        {sidebarTab === "highlights" && (
          <aside className="absolute inset-y-0 left-0 z-30 flex w-56 max-w-[85vw] flex-col border-r border-border glass-surface md:relative md:max-w-none md:shrink-0">
            <HighlightPanel
              fileId={file.id}
              currentPage={spineIndex}
              onPageSelect={(p) => navigateToChapter(p)}
              activeColor={highlightColor}
              onColorChange={setHighlightColor}
              version={history.annotationVersion}
              pageLabel="ch."
              onRemoveHighlight={(id, hl) => history.doRemoveHighlight(id, hl).then(() => { setHasUnsavedChanges(true); })}
            />
          </aside>
        )}

        <div className="relative flex-1 min-h-0 overflow-hidden" style={{ background: themes[settings.theme].bg }}>
          <iframe
            ref={iframeRef}
            className="w-full h-full border-0 transition-opacity duration-300"
            style={{ display: ready ? "block" : "none", opacity: chapterLoading ? 0.3 : 1 }}
            sandbox="allow-same-origin"
            title="Book content"
          />

          {chapterLoading && ready && (
            <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                <span className="text-xs text-muted-foreground font-mono">Loading chapter…</span>
              </div>
            </div>
          )}

          {chapterError && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/90 gap-4 px-8 text-center">
              <div className="h-12 w-12 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center">
                <Book className="h-6 w-6 text-destructive/60" />
              </div>
              <p className="text-sm text-destructive font-medium">{chapterError}</p>
              <Button variant="outline" size="sm" onClick={() => navigateToChapter(spineIndex)}>
                <RotateCcw className="h-3 w-3 mr-2" /> Retry
              </Button>
            </div>
          )}

          {!ready && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/90 z-10 pointer-events-none">
              <div className="relative">
                <div className="h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Book className="h-7 w-7 text-primary/60" />
                </div>
                <div className="absolute -inset-1 rounded-2xl border border-primary/20 animate-ping opacity-30" />
              </div>
              <div className="flex flex-col items-center gap-1">
                <p className="text-sm font-medium text-foreground/80">Opening book…</p>
                <p className="text-xs text-muted-foreground">Parsing EPUB structure</p>
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/95 z-10 px-8 text-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center">
                <Book className="h-6 w-6 text-destructive/60" />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-sm text-destructive font-medium">{error}</p>
                <p className="text-xs text-muted-foreground">File must be a standard EPUB (ZIP-based, no DRM).</p>
              </div>
              <Button variant="outline" size="sm" onClick={onBack}>
                Go Back
              </Button>
            </div>
          )}

          {ready && !chapterLoading && !chapterError && (
            <>
              <button
                onClick={goPrev}
                disabled={spineIndex === 0 && !settings.paginationMode}
                className="absolute left-2 top-1/2 -translate-y-1/2 z-20 h-10 w-10 rounded-full glass-surface border border-border/60 flex items-center justify-center text-foreground/50 hover:text-foreground hover:border-primary/40 hover:shadow-lg transition-all duration-200 disabled:opacity-20 disabled:cursor-not-allowed group"
                title="Previous (←)"
              >
                <ChevronLeft className="h-5 w-5 transition-transform group-hover:-translate-x-0.5" />
              </button>
              <button
                onClick={goNext}
                disabled={spineIndex >= total - 1 && !settings.paginationMode}
                className="absolute right-2 top-1/2 -translate-y-1/2 z-20 h-10 w-10 rounded-full glass-surface border border-border/60 flex items-center justify-center text-foreground/50 hover:text-foreground hover:border-primary/40 hover:shadow-lg transition-all duration-200 disabled:opacity-20 disabled:cursor-not-allowed group"
                title="Next (→)"
              >
                <ChevronRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
              </button>
            </>
          )}

          <EpubStatusBar
            progress={statusProgress}
            theme={themes[settings.theme].label}
            fontSize={settings.fontSize}
            hasUnsavedChanges={hasUnsavedChanges}
          />

          <PdfSearchBar
            isOpen={showSearch}
            onClose={() => {
              setShowSearch(false);
              setSearchBarSeed("");
              setSearchResults([]);
              setCurrentResultIdx(0);
              setSearchQuery("");
            }}
            onSearch={handleSearch}
            onNextResult={handleNextResult}
            onPrevResult={handlePrevResult}
            currentResult={currentResultIdx}
            totalResults={searchResults.length}
            seed={searchBarSeed}
          />
        </div>
      </div>

      <UnsavedChangesDialog
        isOpen={showUnsavedDialog}
        onClose={() => setShowUnsavedDialog(false)}
        onSave={() => { handleSave(); setShowUnsavedDialog(false); onBack(); }}
        onDiscard={() => { setHasUnsavedChanges(false); setShowUnsavedDialog(false); onBack(); }}
      />

      {selectionMenu && (
        <div
          className="fixed z-50 flex items-center rounded-xl glass-surface border border-border/70 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          style={{ left: selectionMenu.x, top: selectionMenu.y, transform: "translate(-50%, calc(-100% - 10px))" }}
        >
          <button onClick={handleCopySelection} className="flex items-center gap-1.5 px-3 py-2 text-xs text-foreground/80 hover:text-foreground hover:bg-white/5 transition-colors">
            <Copy className="h-3 w-3" /> Copy
          </button>
          <span className="w-px h-4 bg-border/60 shrink-0" />
          <button onClick={() => handleDefine(selectionMenu.text, selectionMenu.x, selectionMenu.y)} className="flex items-center gap-1.5 px-3 py-2 text-xs text-foreground/80 hover:text-foreground hover:bg-white/5 transition-colors">
            <Book className="h-3 w-3" /> Define
          </button>
          <span className="w-px h-4 bg-border/60 shrink-0" />
          <button onClick={handleHighlightSelection} className="flex items-center gap-1.5 px-3 py-2 text-xs text-foreground/80 hover:text-foreground hover:bg-white/5 transition-colors">
            <span className="w-3 h-3 rounded-sm border border-white/10" style={{ backgroundColor: highlightColor }} />
            Highlight
          </button>
          <span className="w-px h-4 bg-border/60 shrink-0" />
          <button onClick={handleSearchFromSelection} className="flex items-center gap-1.5 px-3 py-2 text-xs text-foreground/80 hover:text-foreground hover:bg-white/5 transition-colors">
            <Search className="h-3 w-3" /> Search
          </button>
          <span className="w-px h-4 bg-border/60 shrink-0" />
          <button onClick={handleBookmarkChapter} className="flex items-center gap-1.5 px-3 py-2 text-xs text-primary/80 hover:text-primary hover:bg-primary/5 transition-colors">
            <BookmarkIcon className="h-3 w-3" /> Bookmark
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

      <ExportDialog
        isOpen={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        fileId={file.id}
        fileName={file.name}
      />
    </div>
  );
}
