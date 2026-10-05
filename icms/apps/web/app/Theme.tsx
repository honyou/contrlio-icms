"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "contrlio-theme-color";
const DEFAULT_COLOR = "#3da98d";
type ThemeValue = { color: string; setColor: (color: string) => void };
const ThemeContext = createContext<ThemeValue>({ color: DEFAULT_COLOR, setColor: () => undefined });

function normalizeColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : DEFAULT_COLOR;
}


function blend(base: string, accent: string, weight: number) {
  const baseChannels = [1, 3, 5].map(index => Number.parseInt(base.slice(index, index + 2), 16));
  const accentChannels = [1, 3, 5].map(index => Number.parseInt(accent.slice(index, index + 2), 16));
  return `#${baseChannels.map((channel, index) => Math.round(channel * (1 - weight) + accentChannels[index] * weight).toString(16).padStart(2, "0")).join("")}`;
}

function applyTheme(value: string) {
  const color = normalizeColor(value);
  const channels = [1, 3, 5].map(index => Number.parseInt(color.slice(index, index + 2), 16));
  const dark = channels.map(channel => Math.round(channel * 0.76));
  const linear = channels.map(channel => channel / 255).map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  const ink = [24, 39, 45].map(channel => channel / 255).map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const inkLuminance = 0.2126 * ink[0] + 0.7152 * ink[1] + 0.0722 * ink[2];
  const whiteContrast = 1.05 / (luminance + 0.05);
  const inkContrast = (luminance + 0.05) / (inkLuminance + 0.05);
  const contrast = whiteContrast >= inkContrast ? "#ffffff" : "#18272d";
  const toHex = (items: number[]) => `#${items.map(channel => channel.toString(16).padStart(2, "0")).join("")}`;
  const root = document.documentElement;
  root.style.setProperty("--mint", color);
  root.style.setProperty("--mint-dark", toHex(dark));
  root.style.setProperty("--theme-rgb", channels.join(","));
  root.style.setProperty("--theme-contrast", contrast);
  root.style.setProperty("--canvas", blend("#f7f9f7", color, 0.13));
  root.style.setProperty("--surface", blend("#ffffff", color, 0.045));
  root.style.setProperty("--navy", blend("#132b31", color, 0.32));
  root.style.setProperty("--line", blend("#e8edeb", color, 0.14));
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [color, setColorState] = useState(DEFAULT_COLOR);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const initial = normalizeColor(saved || DEFAULT_COLOR);
    setColorState(initial);
    applyTheme(initial);
  }, []);

  const setColor = useCallback((value: string) => {
    const next = normalizeColor(value);
    setColorState(next);
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  }, []);
  const context = useMemo(() => ({ color, setColor }), [color, setColor]);

  return <ThemeContext.Provider value={context}>{children}</ThemeContext.Provider>;
}

export function useThemeColor() {
  return useContext(ThemeContext);
}
