import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

interface PackageMetadata {
  name: string
  version: string
}

const moduleDir = dirname(fileURLToPath(import.meta.url))
export const FACTORY_PACKAGE_METADATA = JSON.parse(
  readFileSync(join(moduleDir, '../package.json'), 'utf8')
) as PackageMetadata
