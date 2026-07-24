import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRESENTATION_THEME_CATALOG, PRESENTATION_THEME_PACKS } from './constants.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))

export const PRESENTATION_THEME_PREVIEW_TITLE = 'ppt主题预览'

export const PRESENTATION_THEME_PREVIEW_ITEMS = PRESENTATION_THEME_PACKS.map((themePack) => {
  const theme = PRESENTATION_THEME_CATALOG[themePack]
  return {
    themePack,
    displayName: theme.displayName,
    scenario: theme.scenario,
    filename: `${themePack}-${theme.displayName}.png`
  }
})

export function resolveThemePreviewImagePath(filename: string) {
  const candidates = [
    join(moduleDir, '..', '..', 'assets', 'theme-previews', filename),
    join(process.cwd(), 'apps', 'presentation-studio', 'assets', 'theme-previews', filename),
    join(process.cwd(), 'xpertai', 'apps', 'presentation-studio', 'assets', 'theme-previews', filename)
  ]
  const resolved = candidates.find(existsSync)
  if (!resolved) throw new Error(`Presentation theme preview image not found: ${filename}`)
  return resolved
}

export function themePreviewMarkdown(items: Array<{
  themePack: string
  displayName: string
  scenario: string
  fileUrl: string
}>) {
  return items.map((item) => [
    `**${item.themePack} ${item.displayName}**：适合${item.scenario}。`,
    `![${item.themePack} ${item.displayName}](${item.fileUrl})`
  ].join('\n')).join('\n\n')
}
