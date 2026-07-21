import { readFileSync } from 'node:fs';

const EXTERNAL_THEME_KEY = /^theme(\d{2,})$/;

export const EXTERNAL_THEME_METADATA = loadExternalThemeMetadata();
export const EXTERNAL_THEME_PACKS = EXTERNAL_THEME_METADATA ? [EXTERNAL_THEME_METADATA.theme] : [];
export const EXTERNAL_THEME_PAGES = EXTERNAL_THEME_METADATA?.pages || [];
export const EXTERNAL_THEME_KEYS = EXTERNAL_THEME_PACKS.map(theme => theme.key);

function loadExternalThemeMetadata() {
  const file = process.env.DASHI_PPT_EXTERNAL_THEME_METADATA;
  if (!file) return null;
  const value = JSON.parse(readFileSync(file, 'utf8'));
  if (!value || value.schema !== 'xpert.presentation-theme-runtime/v1') {
    throw new Error('External theme metadata must use xpert.presentation-theme-runtime/v1.');
  }
  const theme = value.theme;
  const match = typeof theme?.key === 'string' ? theme.key.match(EXTERNAL_THEME_KEY) : null;
  if (!match || Number(match[1]) <= 14) throw new Error('External theme key must be a numeric theme key greater than theme14.');
  if (!Array.isArray(value.pages) || value.pages.length < 76 || value.pages.length > 96) {
    throw new Error('External theme metadata must contain 76-96 pages.');
  }
  const seen = new Set();
  for (const page of value.pages) {
    if (!page || page.themeKey !== theme.key || typeof page.key !== 'string' || !page.key.startsWith(`${theme.key}_page`)) {
      throw new Error('External theme page identity does not match its theme key.');
    }
    if (seen.has(page.key)) throw new Error(`External theme contains a duplicate page key: ${page.key}`);
    seen.add(page.key);
  }
  return { schema: value.schema, theme, pages: value.pages };
}
