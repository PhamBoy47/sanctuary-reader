import { create } from "zustand";
import { EpubSettings } from "../types/epub";

export type EpubThemeMode = "original" | "light" | "sepia" | "warm" | "cool" | "dark" | "midnight";

export interface EpubSearchResult {
  spineIndex: number;
  matchIndex: number;
}

interface EpubState {
  page: number;
  totalPages: number;
  cfi: string | null;
  navHistory: string[];
  navIndex: number;

  settings: EpubSettings;
  sidebarTab: "toc" | "bookmarks" | "highlights" | "settings" | null;

  showSearch: boolean;
  searchQuery: string;
  searchResults: EpubSearchResult[];
  currentResultIdx: number;

  setHasUnsavedChanges: (value: boolean) => void;
  setPage: (page: number) => void;
  setTotalPages: (total: number) => void;
  setCfi: (cfi: string | null) => void;
  setSettings: (settings: EpubSettings | ((prev: EpubSettings) => EpubSettings)) => void;
  setSidebarTab: (tab: "toc" | "bookmarks" | "highlights" | "settings" | null) => void;
  setShowSearch: (show: boolean) => void;
  setSearchQuery: (query: string) => void;
  setSearchResults: (results: EpubSearchResult[]) => void;
  setCurrentResultIdx: (idx: number) => void;
  hasUnsavedChanges: boolean;
  pushNavHistory: (cfi: string) => void;
  setNavIndex: (idx: number) => void;
  reset: () => void;
  saveSettings: (fileId: string) => void;
  loadSettings: (fileId: string) => void;
}

const DEFAULT_SETTINGS: EpubSettings = {
  fontSize: 100,
  fontFamily: "Inter",
  lineHeight: 1.5,
  margin: 40,
  theme: "light",
  isTwoPage: false,
  paginationMode: true,
};

export const useEpubStore = create<EpubState>((set, get) => ({
  page: 1,
  totalPages: 1,
  cfi: null,
  navHistory: [],
  navIndex: -1,
  settings: DEFAULT_SETTINGS,
  sidebarTab: null,
  showSearch: false,
  searchQuery: "",
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSearchResults: (results) => set({ searchResults: results }),
  searchResults: [],
  currentResultIdx: 0,
  hasUnsavedChanges: false,

  setPage: (page) => set({ page }),
  setTotalPages: (totalPages) => set({ totalPages }),
  setCfi: (cfi) => set({ cfi }),
  setSettings: (settings) => set((state) => ({
    settings: typeof settings === "function" ? settings(state.settings) : settings,
  })),
  setSidebarTab: (sidebarTab) => set({ sidebarTab }),
  setShowSearch: (showSearch) => set({ showSearch }),
  setCurrentResultIdx: (currentResultIdx) => set({ currentResultIdx }),
  setHasUnsavedChanges: (hasUnsavedChanges) => set({ hasUnsavedChanges }),
  pushNavHistory: (cfi) => set((state) => {
    const newHistory = state.navHistory.slice(0, state.navIndex + 1);
    newHistory.push(cfi);
    return { navHistory: newHistory, navIndex: newHistory.length - 1 };
  }),
  setNavIndex: (navIndex) => set({ navIndex }),
  reset: () => set({
    page: 1,
    totalPages: 1,
    cfi: null,
    navHistory: [],
    navIndex: -1,
    settings: DEFAULT_SETTINGS,
    sidebarTab: null,
    showSearch: false,
    searchQuery: "",
    searchResults: [],
    currentResultIdx: 0,
    hasUnsavedChanges: false,
  }),
  saveSettings: (fileId: string) => {
    const { settings, page } = get();
    localStorage.setItem(`epub-settings-${fileId}`, JSON.stringify(settings));
    localStorage.setItem(`epub-progress-${fileId}`, String(page > 0 ? page - 1 : 0));
  },
  loadSettings: (fileId: string) => {
    const saved = localStorage.getItem(`epub-settings-${fileId}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        set({ settings: { ...DEFAULT_SETTINGS, ...parsed } });
      } catch { /* ignore corrupt settings */ }
    }
  },
}));
