/**
 * Zustand store for PDF viewer UI state.
 * Replaces ~20 useState calls in PdfViewer.tsx with a single, centralized store.
 */
import { create } from "zustand";
import type { PdfSettings } from "@/components/PdfSettingsPanel";
import { defaultSettings } from "@/components/PdfSettingsPanel";
import type { DisplayMode } from "@/components/PdfStatusBar";

export type PdfSidebarTab = "toc" | "thumbs" | "bookmarks" | "highlights" | "symbols" | null;

interface SearchResult {
  page: number;
  index: number;
}

interface PdfStoreState {
  // Document
  page: number;
  totalPages: number;
  zoom: number;
  rotation: number;
  displayMode: DisplayMode;
  settings: PdfSettings;

  // UI panels
  sidebarTab: PdfSidebarTab;
  showSearch: boolean;

  // Search
  searchQuery: string;
  searchBarSeed: string;
  searchResults: SearchResult[];
  currentResultIdx: number;

  // Annotations
  highlightColor: string;
  activeSymbol: string;
  placingSymbol: boolean;
  hasUnsavedChanges: boolean;

  // Navigation
  navHistory: number[];
  navIndex: number;

  // Auto scroll
  autoScroll: boolean;

  // Visible pages (virtualization)
  visiblePages: Set<number>;
  placeholdersVersion: number;
}

interface PdfStoreActions {
  // Document
  setPage: (page: number | ((p: number) => number)) => void;
  setTotalPages: (n: number) => void;
  setZoom: (zoom: number | ((z: number) => number)) => void;
  setRotation: (rotation: number | ((r: number) => number)) => void;
  setDisplayMode: (mode: DisplayMode) => void;
  setSettings: (settings: PdfSettings | ((prev: PdfSettings) => PdfSettings)) => void;

  // UI panels
  toggleSidebar: (tab: PdfSidebarTab) => void;
  setSidebarTab: (tab: PdfSidebarTab | ((t: PdfSidebarTab) => PdfSidebarTab)) => void;
  setShowSearch: (show: boolean | ((s: boolean) => boolean)) => void;

  // Search
  setSearchQuery: (query: string) => void;
  setSearchBarSeed: (seed: string) => void;
  setSearchResults: (results: SearchResult[]) => void;
  setCurrentResultIdx: (idx: number | ((i: number) => number)) => void;
  resetSearch: () => void;

  // Annotations
  setHighlightColor: (color: string) => void;
  setActiveSymbol: (symbol: string) => void;
  setPlacingSymbol: (placing: boolean | ((p: boolean) => boolean)) => void;
  setHasUnsavedChanges: (value: boolean | ((prev: boolean) => boolean)) => void;

  // Navigation
  pushNavHistory: (page: number) => void;
  setNavIndex: (idx: number | ((i: number) => number)) => void;
  setNavHistory: (history: number[] | ((h: number[]) => number[])) => void;

  // Auto scroll
  setAutoScroll: (value: boolean | ((prev: boolean) => boolean)) => void;

  // Virtualization
  setVisiblePages: (pages: Set<number> | ((prev: Set<number>) => Set<number>)) => void;
  bumpPlaceholdersVersion: () => void;

  // Full reset (when switching documents)
  reset: () => void;
}

const initialState: PdfStoreState = {
  page: 1,
  totalPages: 0,
  zoom: 1.2,
  rotation: 0,
  displayMode: "continuous",
  settings: defaultSettings,
  sidebarTab: null,
  showSearch: false,
  searchQuery: "",
  searchBarSeed: "",
  searchResults: [],
  currentResultIdx: 0,
  highlightColor: "rgb(255,235,59)",
  activeSymbol: "⭐",
  placingSymbol: false,
  hasUnsavedChanges: false,
  navHistory: [1],
  navIndex: 0,
  autoScroll: false,
  visiblePages: new Set([1, 2, 3]),
  placeholdersVersion: 0,
};

export const usePdfStore = create<PdfStoreState & PdfStoreActions>((set, get) => ({
  ...initialState,

  // Document
  setPage: (pageOrFn) => set((s) => ({
    page: typeof pageOrFn === "function" ? pageOrFn(s.page) : pageOrFn,
  })),
  setTotalPages: (n) => set({ totalPages: n }),
  setZoom: (zoomOrFn) => set((s) => ({
    zoom: typeof zoomOrFn === "function" ? zoomOrFn(s.zoom) : zoomOrFn,
  })),
  setRotation: (rotOrFn) => set((s) => ({
    rotation: typeof rotOrFn === "function" ? rotOrFn(s.rotation) : rotOrFn,
  })),
  setDisplayMode: (mode) => set({ displayMode: mode }),
  setSettings: (settingsOrFn) => set((s) => ({
    settings: typeof settingsOrFn === "function" ? settingsOrFn(s.settings) : settingsOrFn,
  })),

  // UI panels
  toggleSidebar: (tab) => set((s) => ({
    sidebarTab: s.sidebarTab === tab ? null : tab,
  })),
  setSidebarTab: (tabOrFn) => set((s) => ({
    sidebarTab: typeof tabOrFn === "function" ? tabOrFn(s.sidebarTab) : tabOrFn,
  })),
  setShowSearch: (showOrFn) => set((s) => ({
    showSearch: typeof showOrFn === "function" ? showOrFn(s.showSearch) : showOrFn,
  })),

  // Search
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

  // Annotations
  setHighlightColor: (color) => set({ highlightColor: color }),
  setActiveSymbol: (symbol) => set({ activeSymbol: symbol }),
  setPlacingSymbol: (placingOrFn) => set((s) => ({
    placingSymbol: typeof placingOrFn === "function" ? placingOrFn(s.placingSymbol) : placingOrFn,
  })),
  setHasUnsavedChanges: (valOrFn) => set((s) => ({
    hasUnsavedChanges: typeof valOrFn === "function" ? valOrFn(s.hasUnsavedChanges) : valOrFn,
  })),

  // Navigation
  pushNavHistory: (page) => {
    const { navHistory, navIndex } = get();
    const nh = navHistory.slice(0, navIndex + 1);
    nh.push(page);
    set({ navHistory: nh, navIndex: nh.length - 1 });
  },
  setNavIndex: (idxOrFn) => set((s) => ({
    navIndex: typeof idxOrFn === "function" ? idxOrFn(s.navIndex) : idxOrFn,
  })),
  setNavHistory: (histOrFn) => set((s) => ({
    navHistory: typeof histOrFn === "function" ? histOrFn(s.navHistory) : histOrFn,
  })),

  // Auto scroll
  setAutoScroll: (valOrFn) => set((s) => ({
    autoScroll: typeof valOrFn === "function" ? valOrFn(s.autoScroll) : valOrFn,
  })),

  // Virtualization
  setVisiblePages: (pagesOrFn) => set((s) => ({
    visiblePages: typeof pagesOrFn === "function" ? pagesOrFn(s.visiblePages) : pagesOrFn,
  })),
  bumpPlaceholdersVersion: () => set((s) => ({
    placeholdersVersion: s.placeholdersVersion + 1,
  })),

  // Reset
  reset: () => set(initialState),
}));
