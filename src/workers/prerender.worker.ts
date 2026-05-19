interface CacheEntry {
  spineIdx: number;
  pageNum: number;
  bitmap: ImageBitmap | null;
}

let cache: CacheEntry[] = [];
const MAX_CACHE = 20;

self.onmessage = (e: MessageEvent<{
  type: "store" | "retrieve" | "clear" | "invalidate";
  spineIdx?: number;
  pageNum?: number;
  bitmap?: ImageBitmap;
}>) => {
  const { type, spineIdx, pageNum, bitmap } = e.data;

  if (type === "store" && spineIdx !== undefined && pageNum !== undefined) {
    if (cache.length >= MAX_CACHE) cache.shift();
    cache.push({ spineIdx, pageNum, bitmap: bitmap ?? null });
  }

  if (type === "retrieve" && spineIdx !== undefined && pageNum !== undefined) {
    const entry = cache.find(
      (c) => c.spineIdx === spineIdx && c.pageNum === pageNum
    );
    self.postMessage({ type: "cacheResult", spineIdx, pageNum, bitmap: entry?.bitmap ?? null });
  }

  if (type === "invalidate" && spineIdx !== undefined) {
    cache = cache.filter((c) => c.spineIdx !== spineIdx);
  }

  if (type === "clear") {
    cache = [];
  }
};
