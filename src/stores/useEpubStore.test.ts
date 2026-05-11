import { describe, expect, it } from "vitest";
import { useEpubStore } from "./useEpubStore";

describe("useEpubStore", () => {
  it("tracks navigation history and resets document state", () => {
    const store = useEpubStore.getState();
    store.reset();

    useEpubStore.getState().pushNavHistory("chapter-1");
    useEpubStore.getState().pushNavHistory("chapter-2");

    expect(useEpubStore.getState().navHistory).toEqual(["chapter-1", "chapter-2"]);
    expect(useEpubStore.getState().navIndex).toBe(1);

    useEpubStore.getState().reset();

    expect(useEpubStore.getState().page).toBe(1);
    expect(useEpubStore.getState().navHistory).toEqual([]);
    expect(useEpubStore.getState().searchResults).toEqual([]);
  });

  it("stores EPUB search results with chapter indexes", () => {
    useEpubStore.getState().reset();

    useEpubStore.getState().setSearchResults([
      { spineIndex: 2, matchIndex: 0 },
      { spineIndex: 4, matchIndex: 1 },
    ]);

    expect(useEpubStore.getState().searchResults).toEqual([
      { spineIndex: 2, matchIndex: 0 },
      { spineIndex: 4, matchIndex: 1 },
    ]);
  });
});
