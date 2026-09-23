import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IconDefinition } from '@xpert-ai/contracts'

const moduleDir = dirname(fileURLToPath(import.meta.url))

function readSvgAssetDataUrl(path: string): string {
  return `data:image/svg+xml;base64,${readFileSync(join(moduleDir, path)).toString('base64')}`
}

export const NOTION_ICON = {
  type: 'image' as const,
  value: readSvgAssetDataUrl('../../assets/notion.svg'),
  size: 32,
  alt: 'Notion'
} satisfies IconDefinition
