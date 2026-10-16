import { readFile, readdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, relative } from 'node:path'
import { readWidgetHtmlAsset } from '@xpert-ai/community-data-analytics/renderer'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const digest = (value) => createHash('sha256').update(value).digest('hex')
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  return (await Promise.all(entries.map((entry) => entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]))).flat()
}
async function fingerprint(root) {
  const input = [...await files(join(root, 'src')), ...await files(join(root, 'scripts')), join(root, 'package.json'), join(root, 'tsconfig.remote.json')].sort()
  const sources = Object.fromEntries(await Promise.all(input.map(async (path) => [relative(root, path), digest(await readFile(path))])))
  const outputs = Object.fromEntries(await Promise.all(['app.js', 'app.css', 'renderer.html'].map(async (name) => [name, digest(await readFile(join(root, 'dist/remote', name)))])))
  return { sources, outputs, rendererSource: digest(readWidgetHtmlAsset('datascience-artifact-widget.html')),
    artifactDocumentSource: digest(await readFile(require.resolve('@xpert-ai/plugin-sdk/artifact-document'))) }
}
export async function writeDistManifest(root) {
  await writeFile(join(root, 'dist/remote/build-manifest.json'), JSON.stringify(await fingerprint(root), null, 2))
}
export async function verifyDist(root) {
  const saved = JSON.parse(await readFile(join(root, 'dist/remote/build-manifest.json'), 'utf8'))
  const current = await fingerprint(root)
  if (JSON.stringify(saved) !== JSON.stringify(current) || current.outputs['renderer.html'] !== current.rendererSource)
    throw new Error('Live Dashboard dist is stale; run the package build before deployment')
}
