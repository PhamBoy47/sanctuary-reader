/**
 * Hook that manages a Web Worker for off-thread full-text search.
 * Provides debounced search, cancellation, and result streaming.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import SearchWorkerUrl from "@/workers/searchWorker.ts?worker&url";

interface SearchResultItem {
  index: number;     // page number (PDF) or spineIndex (EPUB)
  matchCount: number;
}

interface UseSearchWorkerReturn {
  /** Trigger a search. Texts = array of { index, text } for each page/chapter. */
  search: (query: string, texts: { index: number; text: string }[]) => void;
  /** Flat results with individual match entries for counter compatibility */
  results: { page: number; index: number }[];
  /** Whether a search is currently running */
  isSearching: boolean;
  /** Cancel any in-flight search */
  cancel: () => void;
}

export function useSearchWorker(): UseSearchWorkerReturn {
  const workerRef = useRef<Worker | null>(null);
  const idRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const [results, setResults] = useState<{ page: number; index: number }[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Lazy-create worker
  const getWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker(SearchWorkerUrl, { type: "module" });
      workerRef.current.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === "results") {
          // Expand matchCount into individual entries for compatibility with existing UI
          const flat: { page: number; index: number }[] = [];
          let globalIdx = 0;
          for (const r of msg.results as SearchResultItem[]) {
            for (let i = 0; i < r.matchCount; i++) {
              flat.push({ page: r.index, index: globalIdx++ });
            }
          }
          setResults(flat);
          setIsSearching(false);
        } else if (msg.type === "cancelled") {
          setIsSearching(false);
        }
      };
    }
    return workerRef.current;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const cancel = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const currentId = `search-${idRef.current}`;
    getWorker().postMessage({ type: "cancel", id: currentId });
    setIsSearching(false);
  }, [getWorker]);

  const search = useCallback((query: string, texts: { index: number; text: string }[]) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    // Debounce by 150ms so rapid keystrokes don't flood the worker
    debounceRef.current = setTimeout(() => {
      idRef.current++;
      const id = `search-${idRef.current}`;
      getWorker().postMessage({ type: "search", id, query, texts });
    }, 150);
  }, [getWorker]);

  return { search, results, isSearching, cancel };
}
