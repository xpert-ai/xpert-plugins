import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import {
  CollaborationRuntimeCapability,
  MANAGED_QUEUE_SERVICE_TOKEN,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type PluginContext,
  type RuntimeCapabilityKey,
  type RuntimeCapabilityRegistry,
  type XpertPlugin
} from '@xpert-ai/plugin-sdk'
import {
  DASHIAI_LAYOUT_COUNT,
  PRESENTATION_ASSISTANT_TEMPLATE_KEY,
  PRESENTATION_COLLABORATION_CAPABILITY,
  PRESENTATION_EXPORT_CAPABILITY,
  PRESENTATION_FEATURE,
  PRESENTATION_GENERATION_CAPABILITY,
  PRESENTATION_ICON,
  PRESENTATION_MIDDLEWARE_NAME,
  PRESENTATION_PLUGIN_NAME,
  PRESENTATION_PROVIDER_KEY,
  PRESENTATION_TEMPLATE_CAPABILITY,
  PRESENTATION_TEMPLATE_PROVIDER_KEY,
  PRESENTATION_VIEW_KEY,
  PRESENTATION_WORKBENCH_CAPABILITY
} from './lib/constants.js'
import { PRESENTATION_CONFIG_DEFAULTS } from './lib/presentation-config.service.js'
import { PresentationStudioPlugin } from './lib/presentation-studio.plugin.js'
import { presentationStudioTemplates } from './lib/presentation-studio.templates.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const requireFromPlugin = createRequire(import.meta.url)
const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
  dependencies?: Record<string, string>
}
const ConfigSchema = z.object({
  chromiumExecutablePath: z.string().min(1).optional(),
  exportConcurrency: z.number().int().min(1).max(4),
  maxPageCount: z.number().int().min(3).max(30),
  maxAssetBytes: z.number().int().positive(),
  maxDeckMediaBytes: z.number().int().positive(),
  maxPreviewBytes: z.number().int().positive(),
  debug: z.boolean()
})

const capabilities = [
  PRESENTATION_FEATURE,
  PRESENTATION_GENERATION_CAPABILITY,
  PRESENTATION_WORKBENCH_CAPABILITY,
  PRESENTATION_COLLABORATION_CAPABILITY,
  PRESENTATION_EXPORT_CAPABILITY,
  PRESENTATION_TEMPLATE_CAPABILITY
]

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name || PRESENTATION_PLUGIN_NAME,
    version: packageJson.version,
    artifactNamespace: 'presentation_studio',
    level: 'system',
    targetApps: ['data-xpert', 'xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['workbench-view', 'assistant-tool', 'business-app'],
        capabilities,
        marketplace: {
          contents: [
            { type: 'app', name: 'presentation-studio', displayName: 'Presentation Studio', description: 'Generate, edit, collaborate on, and export DashiAI presentations.', icon: { type: 'svg', value: PRESENTATION_ICON, color: '#7c3aed' }, operations: [
              { name: 'generate-presentation', displayName: 'Generate presentation', description: 'Create decks from structured content with Agent middleware tools.', access: 'write' },
              { name: 'collaborate-presentation', displayName: 'Collaborate', description: 'Synchronize presentation edits through Yjs rooms.', access: 'write' },
              { name: 'export-presentation', displayName: 'Export presentation', description: 'Export self-contained HTML, PDF, and PPTX files.', access: 'write' }
            ] },
            { type: 'view', name: PRESENTATION_VIEW_KEY, displayName: 'Presentation Studio Workbench', description: 'Review, edit, version, collaborate, and export presentations.' },
            { type: 'tool', name: PRESENTATION_MIDDLEWARE_NAME, displayName: 'Presentation Studio Tools', description: 'Agent middleware tools for the 1020-layout presentation workflow.' },
            { type: 'assistant-template', name: PRESENTATION_ASSISTANT_TEMPLATE_KEY, displayName: 'Presentation Studio Assistant', description: 'Prebuilt presentation generation assistant.' }
          ]
        },
        runtime: { middlewareProviders: [PRESENTATION_MIDDLEWARE_NAME], viewProviders: [PRESENTATION_PROVIDER_KEY], templateProviders: [PRESENTATION_TEMPLATE_PROVIDER_KEY] }
      },
      xpert: {
        types: ['assistant-template', 'skill', 'app', 'xpertai-bundle'],
        capabilities,
        marketplace: { contents: [
          { type: 'skill', name: 'presentation-studio', displayName: 'Presentation Studio Skill', description: 'Agent workflow for DashiAI presentation generation and export.', tags: ['presentation', 'pptx', 'dashi', 'yjs'] },
          { type: 'assistant-template', name: PRESENTATION_ASSISTANT_TEMPLATE_KEY, displayName: 'Presentation Studio Assistant', description: 'Assistant template for presentation workflows.' },
          { type: 'app', name: 'presentation-studio', displayName: 'Presentation Studio', description: 'Presentation Workbench and Agent middleware tools.' }
        ] }
      }
    },
    category: 'middleware',
    icon: { type: 'svg', value: PRESENTATION_ICON, color: '#7c3aed' },
    displayName: 'Presentation Studio',
    description: 'Agentic presentation generation with 12 DashiAI themes, 1020 layouts, Yjs collaboration, and HTML/PDF/PPTX export.',
    keywords: ['presentation', 'pptx', 'pdf', 'html', 'dashi', 'yjs', 'collaboration', 'agentic-app'],
    author: 'XpertAI Team'
  },
  config: { schema: ConfigSchema, defaults: PRESENTATION_CONFIG_DEFAULTS },
  permissions: [
    { type: 'user', operations: ['read'] }
  ],
  templates: presentationStudioTemplates,
  register(ctx) {
    ctx.logger.log('register presentation studio plugin')
    return { module: PresentationStudioPlugin, global: true }
  },
  async onStart(ctx) { ctx.logger.log('presentation studio plugin started') },
  async onStop(ctx) { ctx.logger.log('presentation studio plugin stopped') },
  checkHealth(ctx) {
    const config = ConfigSchema.parse({ ...PRESENTATION_CONFIG_DEFAULTS, ...ctx.config })
    const vendor = verifyVendorHealth()
    const chromium = resolveChromium(config.chromiumExecutablePath)
    const queueAvailable = resolveDependency(ctx, MANAGED_QUEUE_SERVICE_TOKEN)
    const collaborationAvailable = resolveRuntimeCapability(ctx, CollaborationRuntimeCapability)
    return {
      status: vendor.ok ? 'up' : 'down',
      details: {
        vendor: vendor.ok
          ? { status: 'up', commit: vendor.commit, themes: 12, layouts: vendor.layouts, files: vendor.files, fontPackages: vendor.fonts }
          : { status: 'down', reason: vendor.reason },
        queue: queueAvailable ? { status: 'up' } : { status: 'degraded', reason: 'Managed Queue is unavailable.' },
        collaboration: collaborationAvailable
          ? { status: 'up' }
          : { status: 'degraded', reason: 'Platform collaboration capability is unavailable.' },
        export: chromium && queueAvailable
          ? { status: 'up', chromium }
          : {
              status: 'degraded',
              reason: [!queueAvailable ? 'Managed Queue unavailable.' : '', !chromium ? 'Chromium not found; PDF/PPTX unavailable.' : ''].filter(Boolean).join(' '),
              html: queueAvailable ? 'available' : 'unavailable'
            }
      }
    }
  }
}

function resolveChromium(configured?: string) {
  for (const candidate of [configured, process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium']) {
    if (candidate && existsSync(candidate)) return candidate
  }
  try {
    const output = execFileSync(process.platform === 'win32' ? 'where' : 'which', ['google-chrome'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split(/\r?\n/)[0]
    return output && existsSync(output) ? output : undefined
  } catch { return undefined }
}

function resolveRuntimeCapability<T>(ctx: PluginContext, capability: RuntimeCapabilityKey<T>) {
  try { return Boolean(ctx.resolve<RuntimeCapabilityRegistry>(XPERT_RUNTIME_CAPABILITIES_TOKEN)?.has(capability)) } catch { return false }
}

let vendorHealthCache: ReturnType<typeof computeVendorHealth> | undefined

function verifyVendorHealth() {
  vendorHealthCache ??= computeVendorHealth()
  return vendorHealthCache
}

function computeVendorHealth() {
  try {
    const upstreamRoot = join(moduleDir, '..', 'assets', 'upstream')
    const metadata = JSON.parse(readFileSync(join(upstreamRoot, 'UPSTREAM.json'), 'utf8')) as {
      commit: string
      fileCount: number
      treeSha256: string
      sha256: Record<string, string>
    }
    for (const [pathName, expected] of Object.entries(metadata.sha256)) {
      const actual = createHash('sha256').update(readFileSync(join(upstreamRoot, pathName))).digest('hex')
      if (actual !== expected) throw new Error(`checksum mismatch: ${pathName}`)
    }
    const vendorRoot = join(upstreamRoot, 'dashiai-ppt')
    const files = listVendorFiles(vendorRoot)
    const treeHash = createHash('sha256')
    for (const file of files) {
      const pathName = relative(vendorRoot, file).split(sep).join('/')
      const fileHash = createHash('sha256').update(readFileSync(file)).digest('hex')
      treeHash.update(`${pathName}\0${fileHash}\n`)
    }
    if (files.length !== metadata.fileCount || treeHash.digest('hex') !== metadata.treeSha256) {
      throw new Error('source tree SHA-256 mismatch')
    }
    const projectRoot = join(vendorRoot, 'project')
    const manifest = JSON.parse(readFileSync(join(projectRoot, 'layout-manifest.json'), 'utf8')) as { layouts?: object }
    const layouts = Object.keys(manifest.layouts ?? {}).length
    if (layouts !== DASHIAI_LAYOUT_COUNT) throw new Error(`layout catalog count is ${layouts}`)
    for (let index = 1; index <= 12; index += 1) {
      const theme = `theme${String(index).padStart(2, '0')}`
      if (!existsSync(join(projectRoot, 'dist', 'theme-runtime', `imported-theme-runtime.${theme}.js`))) {
        throw new Error(`missing runtime ${theme}`)
      }
    }
    const fontDependencies = Object.entries(packageJson.dependencies ?? {}).filter(([name]) => name.startsWith('@fontsource/'))
    if (fontDependencies.length !== 10) throw new Error(`font package count is ${fontDependencies.length}`)
    for (const [name, expectedVersion] of fontDependencies) {
      if (!/^\d+\.\d+\.\d+$/.test(expectedVersion)) throw new Error(`font dependency is not pinned: ${name}`)
      const fontPackage = JSON.parse(readFileSync(requireFromPlugin.resolve(`${name}/package.json`), 'utf8')) as { version?: string; license?: string }
      if (fontPackage.version !== expectedVersion || fontPackage.license !== 'OFL-1.1') {
        throw new Error(`font package integrity mismatch: ${name}`)
      }
    }
    return { ok: true as const, commit: metadata.commit, layouts, files: files.length, fonts: fontDependencies.length }
  } catch (error) {
    return { ok: false as const, reason: error instanceof Error ? error.message : 'vendor verification failed', commit: '', layouts: 0, files: 0 }
  }
}

function listVendorFiles(directory: string): string[] {
  // Finder metadata is local filesystem noise, not part of the pinned vendor inventory.
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.name !== '.DS_Store')
    .flatMap((entry) => entry.isDirectory() ? listVendorFiles(join(directory, entry.name)) : [join(directory, entry.name)])
    .sort()
}

function resolveDependency(ctx: PluginContext, token: unknown) {
  try { return Boolean(ctx.resolve(token)) } catch { return false }
}

export default plugin
export * from './lib/constants.js'
export * from './lib/types.js'
export * from './lib/entities/index.js'
export * from './lib/presentation-studio.plugin.js'
export * from './lib/presentation-studio.service.js'
export * from './lib/presentation-studio.middleware.js'
export * from './lib/presentation-studio-view.provider.js'
export * from './lib/presentation-collaboration.provider.js'
export * from './lib/presentation-studio.templates.js'
