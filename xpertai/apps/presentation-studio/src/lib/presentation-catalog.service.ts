import { BadRequestException, Injectable } from '@nestjs/common'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { DASHIAI_LAYOUT_COUNT, PRESENTATION_THEME_PACKS } from './constants.js'
import type { PresentationJsonObject, PresentationJsonValue, PresentationThemePack } from './types.js'

const execFileAsync = promisify(execFile)
const moduleDir = dirname(fileURLToPath(import.meta.url))

type LayoutManifestRecord = {
  key: string
  themePack: string
  pageNumber?: number
  label?: string
  slot?: string
  dataLayout?: string
  controls?: Array<{
    key?: string
    publicKey?: string
    label?: string
    desc?: string
    type?: string
    default?: PresentationJsonValue
    min?: number
    max?: number
    step?: number
    countKey?: string
    options?: PresentationJsonValue[]
  }>
  countBindings?: PresentationJsonValue[]
  lengthBindings?: PresentationJsonValue[]
  numberBounds?: PresentationJsonObject
  freeTextFields?: PresentationJsonValue[]
}

type LayoutManifest = {
  layouts: Record<string, LayoutManifestRecord>
}

export interface SearchLayoutsInput {
  theme: PresentationThemePack
  role?: string
  keyword?: string
  needsMedia?: boolean
  mediaCount?: number
  mediaKind?: 'image' | 'video' | 'mixed'
  requireInitialMedia?: boolean
  limit?: number
  seed?: string
}

@Injectable()
export class PresentationCatalogService {
  private manifestPromise?: Promise<LayoutManifest>
  private readonly nativeRuntimeCache = new Map<PresentationThemePack, Promise<{
    protocolVersion: 1
    themePack: PresentationThemePack
    runtimeVersion: string
    runtimeChecksum: string
    script: string
    layouts: Record<string, LayoutManifestRecord>
  }>>()

  vendorProjectRoot() {
    const actionBundle = join(moduleDir, '..', 'sandbox-actions', 'presentation-export', 'bundle', 'project')
    return existsSync(actionBundle)
      ? actionBundle
      : join(moduleDir, '..', '..', 'assets', 'upstream', 'dashiai-ppt', 'project')
  }

  async stats() {
    const manifest = await this.manifest()
    return {
      themes: PRESENTATION_THEME_PACKS.length,
      layouts: Object.keys(manifest.layouts).length
    }
  }

  async requireLayout(layout: string, theme: PresentationThemePack) {
    const manifest = await this.manifest()
    const record = manifest.layouts[layout]
    if (!record) throw new BadRequestException(`Unknown presentation layout: ${layout}`)
    if (record.themePack !== theme) {
      throw new BadRequestException(`Layout ${layout} belongs to ${record.themePack}, not ${theme}.`)
    }
    return record
  }

  async searchLayouts(input: SearchLayoutsInput): Promise<PresentationJsonObject> {
    const args = ['--theme', input.theme, '--limit', String(Math.min(12, Math.max(1, input.limit ?? 12)))]
    appendArg(args, '--role', input.role)
    appendArg(args, '--keyword', input.keyword)
    appendArg(args, '--media-kind', input.mediaKind)
    appendArg(args, '--media-count', input.mediaCount)
    appendArg(args, '--seed', input.seed)
    if (input.needsMedia) args.push('--needs-media')
    if (input.requireInitialMedia) args.push('--require-initial-media')
    return this.runJson('scripts/layout-query.mjs', args)
  }

  async inspectLayouts(layouts: string[]): Promise<PresentationJsonObject> {
    if (!layouts.length || layouts.length > 8) {
      throw new BadRequestException('Inspect between 1 and 8 presentation layouts at a time.')
    }
    const inspection = await this.runJson('scripts/inspect-layout.mjs', ['--compact', ...layouts])
    return annotateLayoutInspection(inspection)
  }

  async loadNativeThemeRuntime(themePack: PresentationThemePack) {
    const theme = requireThemePack(themePack)
    let cached = this.nativeRuntimeCache.get(theme)
    if (!cached) {
      cached = this.buildNativeThemeRuntime(theme)
      this.nativeRuntimeCache.set(theme, cached)
    }
    return cached
  }

  async validateLayoutProps(layout: string, props: PresentationJsonObject) {
    const tempDirectory = await mkdtemp(join(tmpdir(), 'presentation-props-'))
    const propsFile = join(tempDirectory, 'props.json')
    try {
      await writeFile(propsFile, JSON.stringify(rewritePortableMediaForVendor(props)), 'utf8')
      let stdout = ''
      try {
        const result = await execFileAsync(process.execPath, [
          join(this.vendorProjectRoot(), 'scripts/write-safe-props.mjs'),
          layout,
          propsFile
        ], {
          cwd: this.vendorProjectRoot(),
          env: { ...process.env, DASHI_PPT_THEME_RUNTIME: 'prebuilt' },
          maxBuffer: 20 * 1024 * 1024
        })
        stdout = result.stdout
      } catch (error) {
        stdout = commandStdout(error)
        if (!stdout) throw error
      }
      const result: unknown = JSON.parse(stdout)
      if (!isJsonObject(result)) throw new Error('DashiAI props validator returned a non-object JSON value.')
      const errors = compactValidationErrors(stringArray(result.errors))
      if (errors.length) throw new BadRequestException(errors.join('; '))
      return { warnings: stringArray(result.warnings) }
    } catch (error) {
      if (error instanceof BadRequestException) throw error
      throw new BadRequestException(error instanceof Error ? error.message : 'DashiAI props validation failed.')
    } finally {
      await rm(tempDirectory, { recursive: true, force: true })
    }
  }

  private async manifest() {
    this.manifestPromise ??= readFile(join(this.vendorProjectRoot(), 'layout-manifest.json'), 'utf8')
      .then((text) => JSON.parse(text) as LayoutManifest)
      .then((manifest) => {
        if (Object.keys(manifest.layouts ?? {}).length !== DASHIAI_LAYOUT_COUNT) {
          throw new Error(`DashiAI layout catalog is incomplete; expected ${DASHIAI_LAYOUT_COUNT}.`)
        }
        return manifest
      })
    return this.manifestPromise
  }

  private async buildNativeThemeRuntime(themePack: PresentationThemePack) {
    const [manifest, source] = await Promise.all([
      this.manifest(),
      readFile(join(this.vendorProjectRoot(), 'dist', 'theme-runtime', `imported-theme-runtime.${themePack}.js`), 'utf8')
    ])
    const script = await inlineNativeRuntimeAssets(this.vendorProjectRoot(), source)
    const layouts = Object.fromEntries(
      Object.entries(manifest.layouts).filter(([, layout]) => layout.themePack === themePack)
    )
    if (!Object.keys(layouts).length) throw new Error(`Native presentation runtime ${themePack} has no layouts.`)
    return {
      protocolVersion: 1 as const,
      themePack,
      runtimeVersion: `dashi-${DASHIAI_NATIVE_RUNTIME_VERSION}`,
      runtimeChecksum: createHash('sha256').update(script).digest('hex'),
      script,
      layouts
    }
  }

  private async runJson(script: string, args: string[]): Promise<PresentationJsonObject> {
    try {
      const { stdout } = await execFileAsync(process.execPath, [join(this.vendorProjectRoot(), script), ...args], {
        cwd: this.vendorProjectRoot(),
        env: { ...process.env, DASHI_PPT_THEME_RUNTIME: 'prebuilt' },
        maxBuffer: 20 * 1024 * 1024
      })
      const value: unknown = JSON.parse(stdout)
      if (!isJsonObject(value)) throw new Error('DashiAI command returned a non-object JSON value.')
      return value
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'DashiAI catalog command failed.')
    }
  }
}

const DASHIAI_NATIVE_RUNTIME_VERSION = '69ac66443e36e11cfca4a7f30721dc71a4278d28'
const RUNTIME_ASSET_PATTERN = /(["'])assets\/(3d|unicorn|vendor)\/([^"']+)\1/g

async function inlineNativeRuntimeAssets(projectRoot: string, source: string) {
  const replacements = new Map<string, string>()
  for (const match of source.matchAll(RUNTIME_ASSET_PATTERN)) {
    const relativePath = `assets/${match[2]}/${match[3]}`
    if (replacements.has(relativePath)) continue
    const filePath = match[2] === '3d'
      ? join(projectRoot, 'src', 'components', 'themes', 'theme03', 'source', relativePath)
      : join(projectRoot, relativePath)
    const buffer = await readFile(filePath)
    replacements.set(relativePath, `data:${mimeTypeForRuntimeAsset(relativePath)};base64,${buffer.toString('base64')}`)
  }
  return source.replace(RUNTIME_ASSET_PATTERN, (_match, quote: string, directory: string, suffix: string) => {
    const path = `assets/${directory}/${suffix}`
    const dataUrl = replacements.get(path)
    if (!dataUrl) throw new Error(`Native runtime asset was not resolved: ${path}`)
    return `${quote}${dataUrl}${quote}`
  })
}

function mimeTypeForRuntimeAsset(path: string) {
  if (path.endsWith('.png')) return 'image/png'
  if (path.endsWith('.json')) return 'application/json'
  if (path.endsWith('.js')) return 'text/javascript'
  return 'application/octet-stream'
}

function requireThemePack(value: string): PresentationThemePack {
  if ((PRESENTATION_THEME_PACKS as readonly string[]).includes(value)) return value as PresentationThemePack
  throw new BadRequestException(`Unsupported presentation theme: ${value}`)
}

function appendArg(args: string[], name: string, value: string | number | undefined) {
  if (value !== undefined && value !== '') args.push(name, String(value))
}

function isJsonObject(value: unknown): value is PresentationJsonObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function rewritePortableMediaForVendor(value: PresentationJsonValue): PresentationJsonValue {
  if (typeof value === 'string' && value.startsWith('asset://')) {
    const safeId = value.slice('asset://'.length).replace(/[^a-zA-Z0-9_-]/g, '')
    return `assets/user-media/${safeId || 'asset'}.bin`
  }
  if (Array.isArray(value)) return value.map(rewritePortableMediaForVendor)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, rewritePortableMediaForVendor(item)])
  )
}

function commandStdout(error: unknown) {
  if (!error || typeof error !== 'object' || !('stdout' in error)) return ''
  const stdout = error.stdout
  if (typeof stdout === 'string') return stdout
  return Buffer.isBuffer(stdout) ? stdout.toString('utf8') : ''
}

function stringArray(value: PresentationJsonValue | undefined) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function annotateLayoutInspection(inspection: PresentationJsonObject): PresentationJsonObject {
  const layouts = Array.isArray(inspection.layouts)
    ? inspection.layouts.map((layout) => isJsonObject(layout) ? annotateSingleLayoutInspection(layout) : layout)
    : undefined
  return {
    inspectionLimits: {
      maximumLayoutsPerCall: 8,
      batchingRule: 'When more than 8 layouts are selected, call presentation_inspect_layouts repeatedly with batches of at most 8.'
    },
    ...(layouts ? { ...inspection, layouts } : annotateSingleLayoutInspection(inspection))
  }
}

function annotateSingleLayoutInspection(inspection: PresentationJsonObject): PresentationJsonObject {
  const propShapes = isJsonObject(inspection.propShapes) ? inspection.propShapes : {}
  const arrayItemContracts: PresentationJsonObject = {}
  for (const [key, shape] of Object.entries(propShapes)) {
    const itemShape = Array.isArray(shape) && isJsonObject(shape[0]) ? shape[0] : null
    if (!itemShape) continue
    const allowedKeys = Object.keys(itemShape)
    arrayItemContracts[key] = {
      allowedKeys,
      allowedPaths: allowedKeys.map((itemKey) => `${key}[].${itemKey}`),
      itemShape
    }
  }
  const { layout, ...rest } = inspection
  return {
    ...(typeof layout === 'string' ? { layout } : {}),
    authoringContract: {
      strictArrayItems: true,
      arrayItemContracts,
      rules: [
        'Use each array itemShape exactly and do not add inferred nested keys.',
        'Top-level copy fields remain top-level props; they are not valid inside array items unless listed in allowedKeys.',
        'Before presentation_add_slide, compare every authored array item with its allowedKeys.'
      ]
    },
    ...rest
  }
}

function compactValidationErrors(errors: string[]) {
  const unique = [...new Set(errors)]
  return unique.filter((error) => !unique.some((candidate) => candidate !== error && error.includes(candidate)))
}
