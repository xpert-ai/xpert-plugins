import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

interface PackageMetadata {
  name: string
  version: string
  xpert: { plugin: { level: 'tenant'; artifactNamespace: string } }
}

const moduleDir = __dirname

export const WEEKLY_RADAR_PACKAGE_METADATA = JSON.parse(
  readFileSync(join(moduleDir, '..', 'package.json'), 'utf8')
) as PackageMetadata
