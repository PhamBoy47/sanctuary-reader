/**
 * Persistent annotation store using IndexedDB.
 * Stores bookmarks, highlights, and symbol annotations per document.
 */

export interface Bookmark {
  id: string;
  fileId: string;
  page: number;
  label: string;
  createdAt: number;
}

export interface Highlight {
  id: string;
  fileId: string;
  page: number;
  /** RGB color string e.g. "rgb(255,235,59)" */
  color: string;
  /** The highlighted text content */
  text: string;
  /** Serialised range info for re-rendering */
  rects: { x: number; y: number; w: number; h: number }[];
  createdAt: number;
}

export interface SymbolAnnotation {
  id: string;
  fileId: string;
  page: number;
  symbol: string;
  /** Position as fraction of page (0-1) */
  x: number;
  y: number;
  createdAt: number;
}

const DB_NAME = "sanctuary-annotations";
const DB_VERSION = 1;
const BOOKMARKS_STORE = "bookmarks";
const HIGHLIGHTS_STORE = "highlights";
const SYMBOLS_STORE = "symbols";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(BOOKMARKS_STORE)) {
        const store = db.createObjectStore(BOOKMARKS_STORE, { keyPath: "id" });
        store.createIndex("fileId", "fileId", { unique: false });
      }
      if (!db.objectStoreNames.contains(HIGHLIGHTS_STORE)) {
        const store = db.createObjectStore(HIGHLIGHTS_STORE, { keyPath: "id" });
        store.createIndex("fileId", "fileId", { unique: false });
      }
      if (!db.objectStoreNames.contains(SYMBOLS_STORE)) {
        const store = db.createObjectStore(SYMBOLS_STORE, { keyPath: "id" });
        store.createIndex("fileId", "fileId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ── Bookmarks ──────────────────────────────────────────────────────

export async function getBookmarks(fileId: string): Promise<Bookmark[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BOOKMARKS_STORE, "readonly");
    const idx = tx.objectStore(BOOKMARKS_STORE).index("fileId");
    const req = idx.getAll(fileId);
    req.onsuccess = () => resolve((req.result as Bookmark[]).sort((a, b) => a.page - b.page));
    req.onerror = () => reject(req.error);
  });
}

export async function addBookmark(fileId: string, page: number, label?: string): Promise<Bookmark> {
  const db = await openDB();
  const bookmark: Bookmark = {
    id: genId(),
    fileId,
    page,
    label: label || `Page ${page}`,
    createdAt: Date.now(),
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BOOKMARKS_STORE, "readwrite");
    tx.objectStore(BOOKMARKS_STORE).put(bookmark);
    tx.oncomplete = () => resolve(bookmark);
    tx.onerror = () => reject(tx.error);
  });
}

export async function removeBookmark(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BOOKMARKS_STORE, "readwrite");
    tx.objectStore(BOOKMARKS_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function updateBookmarkLabel(id: string, label: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BOOKMARKS_STORE, "readwrite");
    const store = tx.objectStore(BOOKMARKS_STORE);
    const req = store.get(id);
    req.onsuccess = () => {
      const bm = req.result as Bookmark;
      if (bm) {
        bm.label = label;
        store.put(bm);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Highlights ─────────────────────────────────────────────────────

export async function getHighlights(fileId: string): Promise<Highlight[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HIGHLIGHTS_STORE, "readonly");
    const idx = tx.objectStore(HIGHLIGHTS_STORE).index("fileId");
    const req = idx.getAll(fileId);
    req.onsuccess = () => resolve((req.result as Highlight[]).sort((a, b) => a.page - b.page));
    req.onerror = () => reject(req.error);
  });
}

export async function addHighlight(
  fileId: string,
  page: number,
  color: string,
  text: string,
  rects: Highlight["rects"],
): Promise<Highlight> {
  const db = await openDB();
  const highlight: Highlight = {
    id: genId(),
    fileId,
    page,
    color,
    text,
    rects,
    createdAt: Date.now(),
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HIGHLIGHTS_STORE, "readwrite");
    tx.objectStore(HIGHLIGHTS_STORE).put(highlight);
    tx.oncomplete = () => resolve(highlight);
    tx.onerror = () => reject(tx.error);
  });
}

export async function removeHighlight(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HIGHLIGHTS_STORE, "readwrite");
    tx.objectStore(HIGHLIGHTS_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Symbol Annotations ─────────────────────────────────────────────

export async function getSymbolAnnotations(fileId: string): Promise<SymbolAnnotation[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYMBOLS_STORE, "readonly");
    const idx = tx.objectStore(SYMBOLS_STORE).index("fileId");
    const req = idx.getAll(fileId);
    req.onsuccess = () => resolve(req.result as SymbolAnnotation[]);
    req.onerror = () => reject(req.error);
  });
}

export async function addSymbolAnnotation(
  fileId: string,
  page: number,
  symbol: string,
  x: number,
  y: number,
): Promise<SymbolAnnotation> {
  const db = await openDB();
  const ann: SymbolAnnotation = {
    id: genId(),
    fileId,
    page,
    symbol,
    x,
    y,
    createdAt: Date.now(),
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYMBOLS_STORE, "readwrite");
    tx.objectStore(SYMBOLS_STORE).put(ann);
    tx.oncomplete = () => resolve(ann);
    tx.onerror = () => reject(tx.error);
  });
}

export async function removeSymbolAnnotation(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYMBOLS_STORE, "readwrite");
    tx.objectStore(SYMBOLS_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
