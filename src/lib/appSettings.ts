import { useState, useEffect } from 'react';

export type AppTheme = 'sanctuary' | 'midnight' | 'forest' | 'arctic';
export type LibraryLayout = 'grid' | 'list' | 'compact';
export type SortBy = 'name' | 'lastOpened' | 'size' | 'progress';

export interface AppSettings {
  userName: string;
  theme: AppTheme;
  accentColor: string; // HSL value like "35 90% 55%"
  libraryLayout: LibraryLayout;
  sortBy: SortBy;
  glassIntensity: number; // 0-100
  language: string;
  enabledDictionaries: string[]; // IDs of enabled MDict files
}

const DEFAULT_SETTINGS: AppSettings = {
  userName: 'Reader',
  theme: 'sanctuary',
  accentColor: '35 90% 55%',
  libraryLayout: 'grid',
  sortBy: 'lastOpened',
  glassIntensity: 60,
  language: 'en',
  enabledDictionaries: [],
};

const STORAGE_KEY = 'sanctuary-app-settings';

export function getStoredSettings(): AppSettings {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return DEFAULT_SETTINGS;
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(getStoredSettings());

  useEffect(() => {
    saveSettings(settings);
    
    // Apply theme-related CSS variables to document root
    const root = document.documentElement;
    root.style.setProperty('--primary', settings.accentColor);
    root.style.setProperty('--glass-opacity', (settings.glassIntensity / 100).toString());
    
    // Theme class management
    root.classList.remove('theme-sanctuary', 'theme-midnight', 'theme-forest', 'theme-arctic');
    root.classList.add(`theme-${settings.theme}`);
  }, [settings]);

  const updateSettings = (updates: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  };

  return { settings, updateSettings };
}
