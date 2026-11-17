import { readFileSync } from 'node:fs'

// Single source of truth for release identity: runtime metadata, table names and
// provider keys all derive from package.json, so they cannot drift apart.
export const PACKAGE_METADATA = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  name: string
  version: string
  xpert: { plugin: { level: 'tenant'; artifactNamespace: string } }
}
