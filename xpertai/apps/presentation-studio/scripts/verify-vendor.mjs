import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PRESENTATION_FONT_PACKAGES,
  stagePresentationFontPack
} from '../assets/upstream/dashiai-ppt/project/src/font-pack.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const upstreamRoot = join(root, 'assets', 'upstream')
const metadata = JSON.parse(await readFile(join(upstreamRoot, 'UPSTREAM.json'), 'utf8'))
for (const [relativePath, expected] of Object.entries(metadata.sha256)) {
  const actual = createHash('sha256').update(await readFile(join(upstreamRoot, relativePath))).digest('hex')
  if (actual !== expected) throw new Error(`Vendor checksum mismatch: ${relativePath}`)
}
const vendorRoot = join(upstreamRoot, 'dashiai-ppt')
const vendorFiles = await listFiles(vendorRoot)
const treeHash = createHash('sha256')
for (const file of vendorFiles) {
  const relativePath = relative(vendorRoot, file).split(sep).join('/')
  const fileHash = createHash('sha256').update(await readFile(file)).digest('hex')
  treeHash.update(`${relativePath}\0${fileHash}\n`)
}
if (vendorFiles.length !== metadata.fileCount || treeHash.digest('hex') !== metadata.treeSha256) {
  throw new Error('Vendored DashiAI source tree does not match its SHA-256 inventory.')
}
const manifest = JSON.parse(await readFile(join(upstreamRoot, 'dashiai-ppt', 'project', 'layout-manifest.json'), 'utf8'))
const layouts = Object.values(manifest.layouts ?? {})
const controls = layouts.reduce((sum, layout) => sum + (Array.isArray(layout.controls) ? layout.controls.length : 0), 0)
const themes = new Set(layouts.map((layout) => layout.themePack))
if (layouts.length !== 1188 || controls !== 9942 || themes.size !== 14) {
  throw new Error(`Incomplete DashiAI catalog: themes=${themes.size} layouts=${layouts.length} controls=${controls}`)
}
for (let index = 1; index <= 14; index += 1) {
  const key = `theme${String(index).padStart(2, '0')}`
  const runtimeRoot = join(upstreamRoot, 'dashiai-ppt', 'project', 'dist', 'theme-runtime')
  if (index <= 12) await readFile(join(runtimeRoot, `imported-theme-runtime.${key}.js`))
  await readFile(join(runtimeRoot, `${key}.module.mjs`))
}
const generatedRuntime = JSON.parse(await readFile(
  join(upstreamRoot, 'dashiai-ppt', 'project', 'dist', 'theme-runtime', 'generated-runtime-manifest.json'),
  'utf8'
))
if (generatedRuntime.themeKeys?.join(',') !== 'theme13,theme14') {
  throw new Error('Generated runtime manifest must contain only theme13 and theme14.')
}
for (const key of ['theme13', 'theme14']) {
  if (existsSync(join(upstreamRoot, 'dashiai-ppt', 'project', 'dist', 'theme-runtime', `imported-theme-runtime.${key}.js`))) {
    throw new Error(`Generated theme ${key} must reuse the shared ESM graph instead of a standalone IIFE.`)
  }
}
await verifyFontPack(vendorRoot)
console.log(`Verified DashiAI ${metadata.commit}: 14 themes, 1188 layouts, 9942 controls, ${Object.keys(PRESENTATION_FONT_PACKAGES).length} managed font packages.`)

async function verifyFontPack(vendorRoot) {
  const projectRoot = join(vendorRoot, 'project')
  const legacyFonts = join(projectRoot, 'assets', 'vendor', 'fonts')
  if (existsSync(legacyFonts)) throw new Error('Font binaries must not be stored in the vendored source tree.')
  const template = await readFile(join(projectRoot, 'assets', 'template-swiss.html'), 'utf8')
  if (template.includes('assets/vendor/fonts') || template.includes('@font-face')) {
    throw new Error('The presentation template still contains embedded vendor font declarations.')
  }
  if (!template.includes('assets/fonts/font-pack.css') || !template.includes('assets/fonts/FONT-LICENSES.txt')) {
    throw new Error('The presentation template is missing the managed font pack links.')
  }

  const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  for (const packageName of Object.keys(PRESENTATION_FONT_PACKAGES)) {
    if (!/^\d+\.\d+\.\d+$/.test(packageJson.dependencies?.[packageName] ?? '')) {
      throw new Error(`Fontsource dependency must use an exact version: ${packageName}`)
    }
  }

  const output = await mkdtemp(join(tmpdir(), 'presentation-font-pack-'))
  try {
    const pack = stagePresentationFontPack(projectRoot, output)
    if (pack.packages.length !== Object.keys(PRESENTATION_FONT_PACKAGES).length) {
      throw new Error(`Font pack is incomplete: expected ${Object.keys(PRESENTATION_FONT_PACKAGES).length} packages, got ${pack.packages.length}.`)
    }
    if (pack.files.length !== 186) {
      throw new Error(`Font pack file inventory changed: expected 186 WOFF2 files, got ${pack.files.length}.`)
    }
    for (const file of pack.files) {
      const buffer = await readFile(join(output, file.path))
      const actual = createHash('sha256').update(buffer).digest('hex')
      if (buffer.byteLength !== file.bytes || actual !== file.sha256) {
        throw new Error(`Generated font pack checksum mismatch: ${file.path}`)
      }
    }
  } finally {
    await rm(output, { recursive: true, force: true })
  }
}

async function listFiles(directory) {
  // Finder metadata is not part of the pinned upstream source inventory.
  const entries = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.name !== '.DS_Store')
  const files = await Promise.all(entries.map((entry) => {
    const target = join(directory, entry.name)
    return entry.isDirectory() ? listFiles(target) : [target]
  }))
  return files.flat().sort()
}
