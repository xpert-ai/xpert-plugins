import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

type CutPackageMetadata = {
  name: string
  version: string
  xpert: {
    plugin: {
      level: NonNullable<XpertPlugin['meta']['level']>
      artifactNamespace: string
    }
  }
}

const moduleDir = dirname(fileURLToPath(import.meta.url))

export const CUT_PACKAGE_METADATA = JSON.parse(
  readFileSync(join(moduleDir, '../package.json'), 'utf8')
) as CutPackageMetadata
