import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IconDefinition } from '@xpert-ai/contracts'

const moduleDir = dirname(fileURLToPath(import.meta.url))

export const AMAP_ICON = {
  type: 'image' as const,
  value: `data:image/png;base64,${readFileSync(join(moduleDir, '../../assets/amap.png')).toString('base64')}`,
  size: 32,
  alt: 'AMap'
} satisfies IconDefinition
