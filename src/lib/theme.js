// Light / dark theme. The resolved theme lives on <html data-theme>, set before first paint by the
// inline script in index.html; this module keeps it in sync with the toggle, other tabs and the OS.

import { useCallback, useEffect, useState } from 'react';

const KEY = 'seatcraft:theme';
const THEME_COLORS = { light: '#fdf3f5', dark: '#1a1015' };

function readStored() {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

function writeStored(theme) {
  try {
    window.localStorage.setItem(KEY, theme);
  } catch {
    /* storage unavailable: the choice just won't be remembered */
  }
}

const systemTheme = () => (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
}

export function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || readStored() || systemTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    // Follow the OS setting until the person picks a theme themselves.
    const mql = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onSystem = () => {
      if (!readStored()) setTheme(systemTheme());
    };
    const onStorage = (e) => {
      if (e.key === KEY && (e.newValue === 'light' || e.newValue === 'dark')) setTheme(e.newValue);
    };
    mql?.addEventListener('change', onSystem);
    window.addEventListener('storage', onStorage);
    return () => {
      mql?.removeEventListener('change', onSystem);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      writeStored(next);
      return next;
    });
  }, []);

  return [theme, toggle];
}
