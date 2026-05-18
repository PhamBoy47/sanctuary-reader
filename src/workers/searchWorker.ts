/**
 * Web Worker for full-text search across PDF pages and EPUB chapters.
 * Runs entirely off the main thread so the UI never freezes.
 *
 * Messages IN:
 *   { type: "search", id: string, query: string, texts: { index: number, text: string }[] }
 *   { type: "cancel", id: string }
 *
 * Messages OUT:
 *   { type: "results", id: string, results: { index: number, matchCount: number }[] }
 *   { type: "cancelled", id: string }
 */

interface SearchRequest {
  type: "search";
  id: string;
  query: string;
  /** Array of { index (page number or spine index), text (full text of that page/chapter) } */
  texts: { index: number; text: string }[];
}

interface CancelRequest {
  type: "cancel";
  id: string;
}

type WorkerMessage = SearchRequest | CancelRequest;

let activeId: string | null = null;

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;

  if (msg.type === "cancel") {
    if (activeId === msg.id) activeId = null;
    self.postMessage({ type: "cancelled", id: msg.id });
    return;
  }

  if (msg.type === "search") {
    activeId = msg.id;
    const { id, query, texts } = msg;

    if (!query.trim()) {
      self.postMessage({ type: "results", id, results: [] });
      return;
    }

    const lq = query.toLowerCase();
    const results: { index: number; matchCount: number }[] = [];

    for (const { index, text } of texts) {
      if (activeId !== id) {
        self.postMessage({ type: "cancelled", id });
        return;
      }

      let ltext: string;
      try {
        ltext = (text ?? "").toLowerCase();
      } catch {
        continue;
      }

      let count = 0;
      let pos = ltext.indexOf(lq);
      while (pos !== -1) {
        count++;
        pos = ltext.indexOf(lq, pos + 1);
      }

      if (count > 0) {
        results.push({ index, matchCount: count });
      }
    }

    // Only post if not cancelled during iteration
    if (activeId === id) {
      self.postMessage({ type: "results", id, results });
    }
  }
};
