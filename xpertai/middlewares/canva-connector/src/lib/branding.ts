import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IconDefinition } from '@xpert-ai/contracts'

const moduleDir = dirname(fileURLToPath(import.meta.url))

// Embed the transparent logo so every connector surface uses the same local asset.
export const CANVA_ICON = {
  type: 'image' as const,
  value: `data:image/png;base64,${readFileSync(join(moduleDir, '../../assets/canva-logo.png')).toString('base64')}`,
  size: 32,
  alt: 'Canva'
} satisfies IconDefinition
