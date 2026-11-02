import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

export function getTheme(): Theme {
  return typeof document !== 'undefined' &&
    document.documentElement.classList.contains('dark')
    ? 'dark'
    : 'light';
}

export function setTheme(t: Theme) {
  document.documentElement.classList.toggle('dark', t === 'dark');
  try {
    localStorage.setItem('theme', t);
  } catch {
    /* ignore */
  }
}

/** Re-renders when the light/dark class on <html> changes. */
export function useTheme(): Theme {
  const [theme, set] = useState<Theme>(getTheme);
  useEffect(() => {
    const obs = new MutationObserver(() => set(getTheme()));
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => obs.disconnect();
  }, []);
  return theme;
}

/** Colours that charts need as literal strings (SVG fills cannot read Tailwind classes). */
export function chartColors(theme: Theme) {
  return theme === 'dark'
    ? {
        missing: '#2a3550',
        border: '#0b1020',
        text: '#e5e9f5',
        muted: '#94a3b8',
        grid: '#26324f',
        accent: '#818cf8',
        highlight: '#fbbf24',
        point: '#818cf8',
        good: '#34d399',
        bad: '#f87171',
      }
    : {
        missing: '#e2e8f0',
        border: '#ffffff',
        text: '#0f172a',
        muted: '#64748b',
        grid: '#e2e8f0',
        accent: '#4f46e5',
        highlight: '#d97706',
        point: '#4f46e5',
        good: '#059669',
        bad: '#dc2626',
      };
}

/** Categorical palette for groups (continents, regions), readable on both themes. */
export const GROUP_PALETTE = [
  '#4f46e5',
  '#0891b2',
  '#16a34a',
  '#d97706',
  '#dc2626',
  '#9333ea',
  '#db2777',
  '#65a30d',
  '#0d9488',
  '#ea580c',
  '#475569',
  '#2563eb',
];
