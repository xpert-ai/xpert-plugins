import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { gunzipSync } from 'node:zlib'

const require = createRequire(import.meta.url)

// The pinned npm package ships compressed assets but does not export ./renderer.
// Read only its packaged bytes; loading the MCP server would start a process.
export function readRendererHtml() {
  const root = dirname(require.resolve('@xpert-ai/community-data-analytics/package.json'))
  const assets = join(root, 'assets')
  const chunks = readdirSync(assets)
    .filter(name => /^datascience-artifact-widget\.html\.gz\.b64\.part\d+$/.test(name))
    .sort()
  if (!chunks.length) throw new Error('Missing packaged Data Analytics renderer chunks')
  const encoded = chunks.map(name => readFileSync(join(assets, name), 'utf8').trim()).join('')
  return gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8')
}
