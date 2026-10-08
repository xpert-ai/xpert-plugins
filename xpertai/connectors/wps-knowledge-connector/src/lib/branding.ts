import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const moduleDir = dirname(fileURLToPath(import.meta.url))

function readPngAssetDataUrl(path: string): string {
  return `data:image/png;base64,${readFileSync(join(moduleDir, path)).toString('base64')}`
}

export const WPS_KNOWLEDGE_ICON = {
  type: 'image' as const,
  value: readPngAssetDataUrl('../../assets/wps-knowledge.png'),
  alt: 'WPS Knowledge'
}
