#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import JSZip from 'jszip'
import { resolveThemeGenerationPolicy, THEME_GENERATION_POLICY_VERSION } from './workflow/theme-generation-policy.mjs'

const args = parseArgs(process.argv.slice(2))
const root = path.resolve(args.project || path.join(import.meta.dirname, '..'))
const themeKey = String(args.theme || '')
const sourceType = String(args['source-type'] || '')
const adapterMode = String(args['adapter-mode'] || '')
const outputPath = path.resolve(args.out || path.join(root, 'output', `${themeKey}.xpert-theme.zip`))
const themeNumber = /^theme(\d{2,})$/.exec(themeKey)
if (!themeNumber || Number(themeNumber[1]) <= 14) throw new Error('--theme must be a numeric custom theme key greater than theme14.')
if (!['react', 'html', 'pptx', 'pdf', 'images', 'mixed'].includes(sourceType)) throw new Error('--source-type must be explicit.')
if (!['registry', 'preview-array', 'module-list', 'meta', 'html-order', 'page-files', 'spec-slot', 'static-react-mixed', 'pptx-slide-tree', 'visual-archetype'].includes(adapterMode)) throw new Error('--adapter-mode is unsupported.')

const themesDir = path.join(root, 'src', 'components', 'themes')
const themeDir = path.join(themesDir, themeKey)
const definition = await readJson(path.join(themeDir, 'definition.json'))
const modules = await readJson(path.join(themeDir, 'signature-modules.json'))
const verification = await readJson(path.resolve(required(args.verification, '--verification is required.')))
for (const key of ['generatedCapabilities', 'palette', 'ownedRender', 'renderContract', 'layoutQuality']) {
  if (verification[key] !== 'passed') throw new Error(`Verification gate did not pass: ${key}`)
}
if (definition.key !== themeKey || modules.themeKey !== themeKey) throw new Error('Theme definition identity is inconsistent.')

const generated = await import(`${pathToFileURL(path.join(themesDir, 'generated-metadata.js')).href}?package=${Date.now()}`)
const theme = generated.GENERATED_THEME_PACKS.find((item) => item.key === themeKey)
const pages = generated.GENERATED_THEME_PAGES.filter((item) => item.themeKey === themeKey)
if (!theme || pages.length < 76 || pages.length > 96) throw new Error('Generated metadata must contain 76-96 pages for the requested theme.')
const fullManifest = await readJson(path.join(root, 'layout-manifest.json'))
const layouts = Object.fromEntries(Object.entries(fullManifest.layouts || {}).filter(([key]) => key.startsWith(`${themeKey}_page`)))
if (Object.keys(layouts).length !== pages.length) throw new Error('Layout manifest does not match generated theme metadata.')

const implemented = Array.isArray(modules.modules) ? modules.modules.filter((item) => item.implementationStatus === 'implemented') : []
const observed = implemented.filter((item) => item.evidenceMode === 'observed')
const inferred = implemented.filter((item) => item.evidenceMode === 'inferred')
if (Number(definition.profile?.qualityVersion) >= 3 && !definition.profile?.generationMode) throw new Error('Quality v3 theme definition must explicitly declare generationMode.')
if (Number(modules.qualityVersion) >= 3 && !modules.generationMode) throw new Error('Quality v3 owned-module manifest must explicitly declare generationMode.')
if (Number(definition.profile?.qualityVersion) >= 3 && (!definition.profile?.policyVersion || !definition.recipe?.policyVersion)) throw new Error('Quality v3 theme definition and recipe must explicitly declare policyVersion.')
if (Number(modules.qualityVersion) >= 3 && !modules.policyVersion) throw new Error('Quality v3 owned-module manifest must explicitly declare policyVersion.')
const definitionGenerationMode = definition.profile?.generationMode
const manifestGenerationMode = modules.generationMode
if (definitionGenerationMode !== manifestGenerationMode) throw new Error('Theme definition and owned-module manifest generationMode do not match.')
const generationMode = definitionGenerationMode
const generationPolicy = resolveThemeGenerationPolicy(generationMode)
const definitionPolicyVersion = Number(definition.profile?.policyVersion)
const manifestPolicyVersion = Number(modules.policyVersion)
if (definitionPolicyVersion !== THEME_GENERATION_POLICY_VERSION || manifestPolicyVersion !== THEME_GENERATION_POLICY_VERSION) throw new Error(`Theme policyVersion must equal ${THEME_GENERATION_POLICY_VERSION}.`)
if (modules.planDigest && definition.recipe?.planDigest && modules.planDigest !== definition.recipe.planDigest) throw new Error('Theme definition and owned-module manifest planDigest do not match.')
const ownedStructureFamilies = [...new Set(implemented.map((item) => item.family).filter(Boolean))].sort()
const structureFamilies = [...new Set(pages.map((item) => item.moduleFamily).filter(Boolean))].sort()
if (observed.length < generationPolicy.minimumObservedModules || inferred.length < generationPolicy.minimumInferredModules || ownedStructureFamilies.length < generationPolicy.minimumOwnedFamilies) {
  throw new Error(`Owned module quality gates are incomplete for ${generationMode}.`)
}
if (structureFamilies.length < 9) throw new Error('Composed theme library must cover at least 9 structure families.')

const browserRuntime = path.join(root, 'dist', 'theme-runtime', `imported-theme-runtime.${themeKey}.js`)
const moduleRuntime = path.join(root, 'dist', 'theme-runtime', `${themeKey}.module.mjs`)
const zip = new JSZip()
const packageInfo = {
  schema: 'xpert.presentation-theme-package/v1',
  themeKey,
  sourceType,
  adapterMode,
  generationMode,
  policyVersion:THEME_GENERATION_POLICY_VERSION,
  planDigest:modules.planDigest||definition.recipe?.planDigest||null,
  pageCount: pages.length,
  observedModuleCount: observed.length,
  inferredModuleCount: inferred.length,
  structureFamilies,
  ownedStructureFamilies,
  paletteMode: definition.profile?.paletteMode,
  verification,
  generatedAt: new Date().toISOString()
}
zip.file('package.json', `${JSON.stringify(packageInfo, null, 2)}\n`)
zip.file('metadata.json', `${JSON.stringify({ schema: 'xpert.presentation-theme-runtime/v1', theme, pages }, null, 2)}\n`)
zip.file('layout-manifest.json', `${JSON.stringify({ version: fullManifest.version, layouts }, null, 2)}\n`)
zip.file('runtime/imported-theme-runtime.js', await readFile(browserRuntime))
zip.file('runtime/theme.module.mjs', await readFile(moduleRuntime))
for (const file of await collectThemeAssets(themeDir)) {
  zip.file(`assets/${file.relativePath}`, await readFile(file.absolutePath))
}
const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 }, platform: 'UNIX' })
await mkdir(path.dirname(outputPath), { recursive: true })
await writeFile(outputPath, buffer)
process.stdout.write(`${JSON.stringify({ outputPath, bytes: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex'), ...packageInfo })}\n`)

async function collectThemeAssets(directory) {
  const result = []
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name)
      if (entry.isDirectory()) await visit(absolutePath)
      else if (entry.isFile() && /\.(?:avif|gif|jpe?g|png|svg|webp|woff2?|ttf|otf|mp4|webm)$/i.test(entry.name)) {
        result.push({ absolutePath, relativePath: path.relative(directory, absolutePath).split(path.sep).join('/') })
      }
    }
  }
  if ((await stat(directory)).isDirectory()) await visit(directory)
  return result.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
}
async function readJson(file) { return JSON.parse(await readFile(file, 'utf8')) }
function required(value, message) { if (typeof value !== 'string' || !value.trim()) throw new Error(message); return value }
function parseArgs(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith('--')) continue
    const key = argv[index].slice(2)
    const next = argv[index + 1]
    result[key] = next && !next.startsWith('--') ? (index += 1, next) : true
  }
  return result
}
