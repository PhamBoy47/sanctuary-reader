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
  color: string;
  text: string;
  rects: { x: number; y: number; w: number; h: number }[];
  charOffset?: number;
  charLength?: number;
  cfi?: string;
  createdAt: number;
}

export interface SymbolAnnotation {
  id: string;
  fileId: string;
  page: number;
  symbol: string;
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

async function withDb<T>(mode: IDBTransactionMode, storeName: string, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const req = fn(tx.objectStore(storeName));
    req.onsuccess = () => { db.close(); resolve(req.result); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function withDbMultiple<T>(mode: IDBTransactionMode, storeNames: string[], fn: (stores: IDBObjectStore[]) => void): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    fn(storeNames.map(s => tx.objectStore(s)));
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getBookmarks(fileId: string): Promise<Bookmark[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BOOKMARKS_STORE, "readonly");
    const idx = tx.objectStore(BOOKMARKS_STORE).index("fileId");
    const req = idx.getAll(fileId);
    req.onsuccess = () => { db.close(); resolve((req.result as Bookmark[]).sort((a, b) => a.page - b.page)); };
    req.onerror = () => { db.close(); reject(req.error); };
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
    tx.oncomplete = () => { db.close(); resolve(bookmark); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function removeBookmark(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BOOKMARKS_STORE, "readwrite");
    tx.objectStore(BOOKMARKS_STORE).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
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
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getHighlights(fileId: string): Promise<Highlight[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HIGHLIGHTS_STORE, "readonly");
    const idx = tx.objectStore(HIGHLIGHTS_STORE).index("fileId");
    const req = idx.getAll(fileId);
    req.onsuccess = () => { db.close(); resolve((req.result as Highlight[]).sort((a, b) => a.page - b.page)); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

export async function addHighlight(
  fileId: string,
  page: number,
  color: string,
  text: string,
  rects: Highlight["rects"],
  charOffset?: number,
  charLength?: number,
  cfi?: string,
): Promise<Highlight> {
  const db = await openDB();
  const highlight: Highlight = {
    id: genId(),
    fileId,
    page,
    color,
    text,
    rects,
    charOffset,
    charLength,
    cfi,
    createdAt: Date.now(),
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HIGHLIGHTS_STORE, "readwrite");
    tx.objectStore(HIGHLIGHTS_STORE).put(highlight);
    tx.oncomplete = () => { db.close(); resolve(highlight); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function removeHighlight(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HIGHLIGHTS_STORE, "readwrite");
    tx.objectStore(HIGHLIGHTS_STORE).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getSymbolAnnotations(fileId: string): Promise<SymbolAnnotation[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYMBOLS_STORE, "readonly");
    const idx = tx.objectStore(SYMBOLS_STORE).index("fileId");
    const req = idx.getAll(fileId);
    req.onsuccess = () => { db.close(); resolve(req.result as SymbolAnnotation[]); };
    req.onerror = () => { db.close(); reject(req.error); };
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
    tx.oncomplete = () => { db.close(); resolve(ann); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function removeSymbolAnnotation(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYMBOLS_STORE, "readwrite");
    tx.objectStore(SYMBOLS_STORE).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function restoreBookmark(bookmark: Bookmark): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BOOKMARKS_STORE, "readwrite");
    tx.objectStore(BOOKMARKS_STORE).put(bookmark);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function restoreHighlight(highlight: Highlight): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HIGHLIGHTS_STORE, "readwrite");
    tx.objectStore(HIGHLIGHTS_STORE).put(highlight);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function restoreSymbolAnnotation(ann: SymbolAnnotation): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYMBOLS_STORE, "readwrite");
    tx.objectStore(SYMBOLS_STORE).put(ann);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
