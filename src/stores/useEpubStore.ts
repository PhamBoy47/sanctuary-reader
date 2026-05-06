/**
 * Zustand store for EPUB viewer UI state.
 * Replaces scattered useState calls in EpubViewer.tsx.
 */
import { create } from "zustand";

export type EpubSidebarTab = "toc" | "bookmarks" | "highlights" | null;
export type EpubThemeMode = "original" | "light" | "sepia" | "warm" | "cool" | "dark" | "midnight";

interface EpubSearchResult {
  spineIndex: number;
  matchIndex: number;
}

interface EpubStoreState {
  // Chapter navigation
  spineIndex: number;
  fontSize: number;
  theme: EpubThemeMode;

  // UI panels
  sidebarTab: EpubSidebarTab;
  showSearch: boolean;

  // Document state
  ready: boolean;
  error: string | null;
  hasUnsavedChanges: boolean;
  chapterLoading: boolean;
  showUnsavedDialog: boolean;

  // Search
  searchQuery: string;
  searchBarSeed: string;
  searchResults: EpubSearchResult[];
  currentResultIdx: number;

  // Annotations
  highlightColor: string;

  // Navigation history
  navHistory: number[];
  navIndex: number;

  // Selection menu
  selectionMenu: { x: number; y: number; text: string } | null;

  // Dictionary
  dictionaryQuery: { word: string; x: number; y: number; results: string[] } | null;

  // Pagination mode
  paginated: boolean;
}

interface EpubStoreActions {
  setSpineIndex: (idx: number) => void;
  setFontSize: (size: number | ((s: number) => number)) => void;
  setTheme: (theme: EpubThemeMode) => void;

  setSidebarTab: (tab: EpubSidebarTab | ((t: EpubSidebarTab) => EpubSidebarTab)) => void;
  setShowSearch: (show: boolean | ((s: boolean) => boolean)) => void;

  setReady: (ready: boolean) => void;
  setError: (error: string | null) => void;
  setHasUnsavedChanges: (value: boolean) => void;
  setChapterLoading: (loading: boolean) => void;
  setShowUnsavedDialog: (show: boolean) => void;

  setSearchQuery: (query: string) => void;
  setSearchBarSeed: (seed: string) => void;
  setSearchResults: (results: EpubSearchResult[]) => void;
  setCurrentResultIdx: (idx: number | ((i: number) => number)) => void;
  resetSearch: () => void;

  setHighlightColor: (color: string) => void;

  pushNavHistory: (idx: number) => void;
  setNavIndex: (idx: number | ((i: number) => number)) => void;
  setNavHistory: (history: number[] | ((h: number[]) => number[])) => void;

  setSelectionMenu: (menu: { x: number; y: number; text: string } | null) => void;
  setDictionaryQuery: (query: { word: string; x: number; y: number; results: string[] } | null) => void;

  setPaginated: (value: boolean) => void;

  reset: () => void;
}

const initialState: EpubStoreState = {
  spineIndex: 0,
  fontSize: 100,
  theme: "dark",
  sidebarTab: null,
  showSearch: false,
  ready: false,
  error: null,
  hasUnsavedChanges: false,
  chapterLoading: false,
  showUnsavedDialog: false,
  searchQuery: "",
  searchBarSeed: "",
  searchResults: [],
  currentResultIdx: 0,
  highlightColor: "rgb(255,235,59)",
  navHistory: [0],
  navIndex: 0,
  selectionMenu: null,
  dictionaryQuery: null,
  paginated: false,
};

export const useEpubStore = create<EpubStoreState & EpubStoreActions>((set, get) => ({
  ...initialState,

  setSpineIndex: (idx) => set({ spineIndex: idx }),
  setFontSize: (sizeOrFn) => set((s) => ({
    fontSize: typeof sizeOrFn === "function" ? sizeOrFn(s.fontSize) : sizeOrFn,
  })),
  setTheme: (theme) => set({ theme }),

  setSidebarTab: (tabOrFn) => set((s) => ({
    sidebarTab: typeof tabOrFn === "function" ? tabOrFn(s.sidebarTab) : tabOrFn,
  })),
  setShowSearch: (showOrFn) => set((s) => ({
    showSearch: typeof showOrFn === "function" ? showOrFn(s.showSearch) : showOrFn,
  })),

  setReady: (ready) => set({ ready }),
  setError: (error) => set({ error }),
  setHasUnsavedChanges: (value) => set({ hasUnsavedChanges: value }),
  setChapterLoading: (loading) => set({ chapterLoading: loading }),
  setShowUnsavedDialog: (show) => set({ showUnsavedDialog: show }),

  setSearchQuery: (query) => set({ searchQuery: query }),
  setSearchBarSeed: (seed) => set({ searchBarSeed: seed }),
  setSearchResults: (results) => set({ searchResults: results }),
  setCurrentResultIdx: (idxOrFn) => set((s) => ({
    currentResultIdx: typeof idxOrFn === "function" ? idxOrFn(s.currentResultIdx) : idxOrFn,
  })),
  resetSearch: () => set({
    showSearch: false,
    searchBarSeed: "",
    searchResults: [],
    currentResultIdx: 0,
    searchQuery: "",
  }),

  setHighlightColor: (color) => set({ highlightColor: color }),

  pushNavHistory: (idx) => {
    const { navHistory, navIndex } = get();
    const nh = navHistory.slice(0, navIndex + 1);
    nh.push(idx);
    set({ navHistory: nh, navIndex: nh.length - 1 });
  },
  setNavIndex: (idxOrFn) => set((s) => ({
    navIndex: typeof idxOrFn === "function" ? idxOrFn(s.navIndex) : idxOrFn,
  })),
  setNavHistory: (histOrFn) => set((s) => ({
    navHistory: typeof histOrFn === "function" ? histOrFn(s.navHistory) : histOrFn,
  })),

  setSelectionMenu: (menu) => set({ selectionMenu: menu }),
  setDictionaryQuery: (query) => set({ dictionaryQuery: query }),

  setPaginated: (value) => set({ paginated: value }),

  reset: () => set(initialState),
}));
