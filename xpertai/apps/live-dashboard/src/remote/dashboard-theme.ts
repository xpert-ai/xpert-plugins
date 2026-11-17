import type { DashboardManifest } from '../lib/dashboard.schema'

/**
 * The standard renderer has its own CSS vocabulary; map host tokens at the document boundary.
 * @beta Theme keys and token mappings may change incompatibly during beta.
 */
export function standardThemeStyle(theme: DashboardManifest['visualTheme']) {
  const style = getComputedStyle(document.documentElement)
  const token = (key: string) => style.getPropertyValue(key).trim().replace(/[<>]/g, '')
  const properties = {
    '--color-background-primary': token('--background'),
    '--color-background-secondary': token(theme === 'slate' ? '--muted' : '--card'),
    '--color-background-tertiary': token('--card'),
    '--color-text-primary': token('--foreground'),
    '--color-text-secondary': token('--muted-foreground'),
    '--color-text-tertiary': token('--muted-foreground'),
    // The renderer's numeric table cells otherwise keep a fixed light-mode color.
    '--ds-table-row-text': token('--foreground'),
    '--color-border-primary': token(theme === 'contrast' ? '--foreground' : '--border'),
    '--color-border-secondary': token('--border'),
    '--color-text-info': token('--primary'),
    '--color-ring': token('--primary'),
    '--font-sans': token('--font-sans')
  }
  return `<style data-dashboard-theme="${theme ?? 'system'}">:root,:root[data-theme=light],:root[data-theme=dark]{${Object.entries(properties).filter(([,value]) => value).map(([key,value]) => `${key}:${value}`).join(';')}}</style>`
}

/** Parse the document so a </head> string inside bundled JavaScript cannot become an insertion point. */
export function standardDashboardDocument(html: string, inspectorPrefix: string, theme: DashboardManifest['visualTheme']) {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  parsed.documentElement.dataset.theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  parsed.head.insertAdjacentHTML('afterbegin', inspectorPrefix)
  parsed.head.insertAdjacentHTML('beforeend', standardThemeStyle(theme))
  return '<!doctype html>' + parsed.documentElement.outerHTML
}
