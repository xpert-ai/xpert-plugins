import { readFileSync } from 'node:fs'

export const MATERIAL_PACKAGE_METADATA = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  name: string
  version: string
  xpert: { plugin: { level: 'tenant'; artifactNamespace: string } }
}
