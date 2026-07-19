import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import {
  CollaborationRuntimeCapability,
  MANAGED_QUEUE_SERVICE_TOKEN,
  SandboxJobsRuntimeCapability,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type ManagedQueueService,
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
  PRESENTATION_SANDBOX_ACTION,
  PRESENTATION_SANDBOX_ACTION_VERSION,
  PRESENTATION_STUDIO_ARTIFACT_NAMESPACE,
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
  exportBackend: z.enum(['sandbox-job', 'local']),
  /** @deprecated Local development only. Production exports use Sandbox Job profiles. */
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
    artifactNamespace: PRESENTATION_STUDIO_ARTIFACT_NAMESPACE,
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
  async checkHealth(ctx) {
    const parsedConfig = ConfigSchema.parse({ ...PRESENTATION_CONFIG_DEFAULTS, ...ctx.config })
    const exportBackend = process.env.NODE_ENV === 'production' ? 'sandbox-job' : parsedConfig.exportBackend
    const vendor = verifyVendorHealth()
    const managedQueue = resolveDependency<ManagedQueueService>(ctx, MANAGED_QUEUE_SERVICE_TOKEN)
    const queueAvailable = Boolean(managedQueue)
    const browserPoolHealth = exportBackend === 'sandbox-job' && managedQueue
      ? await managedQueue.getExecutionPoolHealth({ executionPool: 'sandbox-browser' }).catch((error) => ({
          executionPool: 'sandbox-browser' as const,
          available: false,
          workerCount: 0,
          warning: error instanceof Error ? error.message : String(error)
        }))
      : {
          executionPool: 'sandbox-browser' as const,
          available: queueAvailable,
          workerCount: queueAvailable ? 1 : 0,
          ...(!queueAvailable ? { warning: 'Managed Queue is unavailable.' } : {})
        }
    const sandboxJobs = resolveRuntimeCapability(ctx, SandboxJobsRuntimeCapability)
    const actionHealth = exportBackend === 'local'
      ? {
          action: 'local',
          actionVersion: 'development',
          available: Boolean([parsedConfig.chromiumExecutablePath, process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium']
            .find((candidate) => candidate && existsSync(candidate))),
          reason: 'LOCAL_BROWSER_UNAVAILABLE',
          message: 'Local Chromium is unavailable.'
        }
      : sandboxJobs
        ? await sandboxJobs.getActionHealth({
            pluginName: PRESENTATION_PLUGIN_NAME,
            action: PRESENTATION_SANDBOX_ACTION,
            actionVersion: PRESENTATION_SANDBOX_ACTION_VERSION
          }).catch((error) => ({
            action: PRESENTATION_SANDBOX_ACTION,
            actionVersion: PRESENTATION_SANDBOX_ACTION_VERSION,
            available: false,
            reason: 'PROFILE_UNHEALTHY' as const,
            message: error instanceof Error ? error.message : String(error)
          }))
        : null
    const collaborationAvailable = Boolean(resolveRuntimeCapability(ctx, CollaborationRuntimeCapability))
    return {
      status: vendor.ok ? 'up' : 'down',
      details: {
        vendor: vendor.ok
          ? { status: 'up', commit: vendor.commit, themes: 12, layouts: vendor.layouts, files: vendor.files, fontPackages: vendor.fonts }
          : { status: 'down', reason: vendor.reason },
        queue: queueAvailable && (exportBackend !== 'sandbox-job' || browserPoolHealth.available)
          ? { status: 'up', ...(exportBackend === 'sandbox-job' ? { executionPool: browserPoolHealth } : {}) }
          : {
              status: 'degraded',
              reason: browserPoolHealth.warning ?? 'Managed Queue is unavailable.',
              ...(exportBackend === 'sandbox-job' ? { executionPool: browserPoolHealth } : {})
            },
        collaboration: collaborationAvailable
          ? { status: 'up' }
          : { status: 'degraded', reason: 'Platform collaboration capability is unavailable.' },
        export: actionHealth?.available && queueAvailable && (exportBackend !== 'sandbox-job' || browserPoolHealth.available)
          ? {
              status: 'up',
              backend: exportBackend,
              action: PRESENTATION_SANDBOX_ACTION,
              actionVersion: PRESENTATION_SANDBOX_ACTION_VERSION,
              ...('runtimeProfile' in actionHealth && actionHealth.runtimeProfile
                ? { runtimeProfile: actionHealth.runtimeProfile, sandboxRuntimeVersion: actionHealth.sandboxRuntimeVersion }
                : {})
            }
          : {
              status: 'degraded',
              reason: [
                !queueAvailable ? 'Managed Queue unavailable.' : '',
                exportBackend === 'sandbox-job' && !browserPoolHealth.available
                  ? `WORKER_UNAVAILABLE: ${browserPoolHealth.warning ?? 'No Provider-owned Sandbox Runtime worker is active. The OSS base deployment does not deploy one.'}`
                  : '',
                exportBackend === 'sandbox-job' && !sandboxJobs ? 'Sandbox Jobs capability unavailable; PDF/PPTX unavailable.' : '',
                actionHealth && !actionHealth.available
                  ? `${actionHealth?.reason ?? 'ACTION_MISSING'}: ${actionHealth?.message ?? 'Sandbox Action unavailable.'}`
                  : ''
              ].filter(Boolean).join(' '),
              html: queueAvailable ? 'available' : 'unavailable'
            }
      }
    }
  }
}

function resolveRuntimeCapability<T>(ctx: PluginContext, capability: RuntimeCapabilityKey<T>) {
  try { return ctx.resolve<RuntimeCapabilityRegistry>(XPERT_RUNTIME_CAPABILITIES_TOKEN)?.get(capability) } catch { return undefined }
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
    const projectRoot = resolveDashiProjectRoot()
    for (const [pathName, expected] of Object.entries(metadata.sha256)) {
      const source = pathName.startsWith('dashiai-ppt/project/')
        ? join(projectRoot, pathName.slice('dashiai-ppt/project/'.length))
        : join(upstreamRoot, pathName)
      const actual = createHash('sha256').update(readFileSync(source)).digest('hex')
      if (actual !== expected) throw new Error(`checksum mismatch: ${pathName}`)
    }
    const vendorRoot = join(upstreamRoot, 'dashiai-ppt')
    if (existsSync(join(vendorRoot, 'project'))) {
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
    }
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
    return { ok: true as const, commit: metadata.commit, layouts, files: metadata.fileCount, fonts: fontDependencies.length }
  } catch (error) {
    return { ok: false as const, reason: error instanceof Error ? error.message : 'vendor verification failed', commit: '', layouts: 0, files: 0 }
  }
}

function resolveDashiProjectRoot() {
  const actionProject = join(moduleDir, 'sandbox-actions', 'presentation-export', 'bundle', 'project')
  return existsSync(actionProject)
    ? actionProject
    : join(moduleDir, '..', 'assets', 'upstream', 'dashiai-ppt', 'project')
}

function listVendorFiles(directory: string): string[] {
  // Finder metadata is local filesystem noise, not part of the pinned vendor inventory.
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.name !== '.DS_Store')
    .flatMap((entry) => entry.isDirectory() ? listVendorFiles(join(directory, entry.name)) : [join(directory, entry.name)])
    .sort()
}

function resolveDependency<T>(ctx: PluginContext, token: unknown): T | undefined {
  try { return ctx.resolve<T>(token) } catch { return undefined }
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
