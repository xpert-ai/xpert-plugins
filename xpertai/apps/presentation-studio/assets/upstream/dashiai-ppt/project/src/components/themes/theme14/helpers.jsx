import React from 'react';
import { useTheme } from './context.jsx';

export function ThemeDecor({ show=true }) {
  const theme = useTheme();
  if (!show) return null;
  return <div aria-hidden="true" style={{position:'absolute',inset:22,pointerEvents:'none',zIndex:8,border:'1px solid color-mix(in srgb, currentColor 18%, transparent)',color:theme.tokens.accent,opacity:.28}} />;
}

export const themeHelpers = {
  "ornament": "corner-web",
  "context": "festival-story",
  "density": "balanced"
};
