"use client";

import { createContext, useContext, useEffect, useSyncExternalStore, ReactNode } from "react";

export type ThemeId = "light" | "midnight" | "vivid" | "ocean";

export interface ThemeDefinition {
  id: ThemeId;
  label: string;
  /** Swatch colours shown in the picker */
  swatches: [string, string];
}

export const THEMES: ThemeDefinition[] = [
  {
    id: "light",
    label: "Light",
    swatches: ["#f5f5f7", "#0071e3"],
  },
  {
    id: "midnight",
    label: "Midnight",
    swatches: ["#1c1c1e", "#2997ff"],
  },
  {
    id: "vivid",
    label: "Graphite",
    swatches: ["#2c2c2e", "#ff9f0a"],
  },
  {
    id: "ocean",
    label: "Ocean",
    swatches: ["#142a32", "#30b0c7"],
  },
];

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (id: ThemeId) => void;
  themes: ThemeDefinition[];
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  setTheme: () => { },
  themes: THEMES,
});

const THEME_STORAGE_KEY = "livepoll-theme";
const THEME_CHANGE_EVENT = "votify-theme-change";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribeToThemeChanges, getThemeSnapshot, getServerThemeSnapshot);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = (id: ThemeId) => {
    applyTheme(id);
    localStorage.setItem(THEME_STORAGE_KEY, id);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

function applyTheme(id: ThemeId) {
  document.documentElement.dataset.theme = id;
}

function subscribeToThemeChanges(onStoreChange: () => void) {
  const handleStorageChange = (event: Event) => {
    if (event instanceof StorageEvent && event.key !== null && event.key !== THEME_STORAGE_KEY) {
      return;
    }

    onStoreChange();
  };

  window.addEventListener("storage", handleStorageChange);
  window.addEventListener(THEME_CHANGE_EVENT, handleStorageChange);

  return () => {
    window.removeEventListener("storage", handleStorageChange);
    window.removeEventListener(THEME_CHANGE_EVENT, handleStorageChange);
  };
}

function getThemeSnapshot(): ThemeId {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  return isThemeId(saved) ? saved : "light";
}

function getServerThemeSnapshot(): ThemeId {
  return "light";
}

function isThemeId(value: string | null): value is ThemeId {
  return value !== null && THEMES.some((theme) => theme.id === value);
}

export function useTheme() {
  return useContext(ThemeContext);
}
