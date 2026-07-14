import { Inject, Injectable, Optional } from '@nestjs/common'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, dirname, extname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import {
  MANAGED_QUEUE_SERVICE_TOKEN,
  SandboxJobsRuntimeCapability,
  WorkspaceFilesRuntimeCapability,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type AgentMiddlewareRuntimeCapabilityRegistry,
  type ManagedQueueService,
  type SandboxJobOutput,
  type SandboxJobsApi,
  type WorkspaceFileScope,
  type WorkspaceFilesApi
} from '@xpert-ai/plugin-sdk'
import {
  DASHIAI_UPSTREAM_COMMIT,
  PRESENTATION_SANDBOX_ACTION,
  PRESENTATION_SANDBOX_ACTION_VERSION,
  PRESENTATION_STUDIO_PLUGIN_NAME
} from './constants.js'
import { PresentationConfigService } from './presentation-config.service.js'
import { inlinePresentationHtml } from './presentation-html-inliner.js'
import type { PresentationAsset, PresentationDeckVersion } from './entities/index.js'
import type {
  PresentationDeckSpec,
  PresentationEditorState,
  PresentationExportCapabilities,
  PresentationExportKind,
  PresentationJsonObject,
  PresentationJsonValue,
  PresentationRenderResult
} from './types.js'
import { PresentationCatalogService } from './presentation-catalog.service.js'

const execFileAsync = promisify(execFile)
const requireFromHere = createRequire(import.meta.url)
const moduleDir = dirname(fileURLToPath(import.meta.url))

const PRESENTATION_EXPORT_STYLE = `<style id="xpert-presentation-export-style">
body[data-presentation-export="true"] #deck-topbar,
body[data-presentation-export="true"] #deck-save-status,
body[data-presentation-export="true"] #slide-rail,
body[data-presentation-export="true"] #preview-panel,
body[data-presentation-export="true"] #preview-panel-collapse,
body[data-presentation-export="true"] #deck-page-pager,
body[data-presentation-export="true"] .deck-export-overlay,
body[data-presentation-export="true"] #export-http-modal {
  display: none !important;
}
body[data-presentation-export="true"] #deck-viewport {
  border-radius: 0 !important;
  box-shadow: none !important;
}
</style>`

const PRESENTATION_EXPORT_GUARD = `<script id="xpert-presentation-export-guard">(function(){addEventListener('keydown',function(event){if(event.key==='Escape'&&document.body?.dataset.presentationExport==='true')event.stopImmediatePropagation()},true)})();</script>`

/**
 * Builds the shared Presentation render input and routes browser-backed exports
 * through the registered `presentation.export` Sandbox Action.
 */
@Injectable()
export class PresentationRendererService {
  private actionHealthCache?: { expiresAt: number; value: PresentationExportCapabilities }

  constructor(
    private readonly catalog: PresentationCatalogService,
    private readonly config: PresentationConfigService,
    @Optional()
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    private readonly runtimeCapabilities?: AgentMiddlewareRuntimeCapabilityRegistry,
    @Optional()
    @Inject(MANAGED_QUEUE_SERVICE_TOKEN)
    private readonly managedQueue?: ManagedQueueService
  ) {}

  async renderVersion(version: PresentationDeckVersion, assets: PresentationAsset[]): Promise<PresentationRenderResult> {
    const root = await mkdtemp(join(tmpdir(), 'presentation-studio-'))
    try {
      const deckDir = join(root, 'deck')
      const pptDir = join(deckDir, 'ppt')
      await mkdir(join(pptDir, 'assets', 'user-media'), { recursive: true })
      const assetPaths = await this.stageAssets(pptDir, assets)
      const goal = transformDeckForDashi(version.deckSpec, assetPaths, version.editorState)
      const goalPath = join(deckDir, 'goal.json')
      const indexHtmlPath = join(pptDir, 'index.html')
      await writeFile(goalPath, JSON.stringify(goal, null, 2))
      await this.runNode('scripts/validate-goal-spec.mjs', [goalPath], root)
      const tsxCli = requireFromHere.resolve('tsx/cli')
      await this.runExecutable(process.execPath, [tsxCli, join(this.catalog.vendorProjectRoot(), 'scripts/render-goal-deck.jsx'), goalPath, indexHtmlPath], root)
      return { directory: root, indexHtmlPath, goalPath, warnings: [] }
    } catch (error) {
      await this.cleanup(root)
      throw error
    }
  }

  async exportRendered(rendered: PresentationRenderResult, kind: PresentationExportKind, title: string): Promise<{
    buffer: Buffer
    mimeType: string
    extension: string
    report: PresentationJsonObject
  }> {
    if (kind === 'html') {
      const source = await readFile(rendered.indexHtmlPath, 'utf8')
      await writeFile(rendered.indexHtmlPath, preparePresentationHtmlForExport(source))
      const html = await inlinePresentationHtml(dirname(rendered.indexHtmlPath))
      return { buffer: Buffer.from(html), mimeType: 'text/html', extension: 'html', report: { selfContained: true } }
    }
    const outputPath = join(rendered.directory, `presentation.${kind}`)
    const reportPath = join(rendered.directory, `presentation.${kind}.report.json`)
    const args = [dirname(rendered.indexHtmlPath), outputPath, '--title', title, '--report', reportPath]
    if (kind === 'pdf') args.push('--pdf')
    await this.runNode('scripts/export-pptx.mjs', args, rendered.directory)
    const reportValue: unknown = JSON.parse(await readFile(reportPath, 'utf8'))
    const report = isPresentationJsonObject(reportValue) ? reportValue : {}
    return {
      buffer: await readFile(outputPath),
      mimeType: kind === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      extension: kind,
      report: { ...report, upstreamCommit: DASHIAI_UPSTREAM_COMMIT, renderer: 'dashi-playwright-pptxgenjs' }
    }
  }

  /** Executes PDF/PPTX in Sandbox Jobs using only structured payload and portable asset references. */
  async exportVersionInSandbox(input: {
    exportId: string
    checksum: string
    version: PresentationDeckVersion
    assets: PresentationAsset[]
    kind: 'pdf' | 'pptx'
    title: string
    fileName: string
    tenantId: string
    organizationId?: string | null
    userId?: string | null
    destination: WorkspaceFileScope & { folder: string }
  }): Promise<{ jobId: string; output: SandboxJobOutput; report: PresentationJsonObject }> {
    const assetPaths = new Map<string, string>()
    const files = input.assets.flatMap((asset) => {
      if (!asset.id || !asset.fileReference?.reference) return []
      const safeName = sanitizeFileName(asset.fileName, asset.mimeType)
      const targetPath = `assets/user-media/${asset.id}/${safeName}`
      assetPaths.set(asset.id, targetPath)
      return [{
        reference: asset.fileReference.reference,
        targetPath,
        size: asset.size,
        sha256: asset.sha256
      }]
    })
    const goal = transformDeckForDashi(input.version.deckSpec, assetPaths, input.version.editorState)
    const mimeType = input.kind === 'pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    const result = await this.sandboxJobs().run({
      jobId: input.exportId,
      action: PRESENTATION_SANDBOX_ACTION,
      actionVersion: PRESENTATION_SANDBOX_ACTION_VERSION,
      idempotencyKey: `presentation-export:${input.exportId}:${input.checksum}`,
      scope: {
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        userId: input.userId,
        pluginName: PRESENTATION_STUDIO_PLUGIN_NAME,
        businessResourceType: 'presentation-export',
        businessResourceId: input.exportId
      },
      payload: {
        kind: input.kind,
        title: input.title,
        goal
      },
      files,
      outputs: [{
        path: `presentation.${input.kind}`,
        originalName: input.fileName,
        mimeType,
        destination: input.destination
      }],
      timeoutMs: 300_000
    })
    const output = result.outputs.find((candidate) => candidate.path === `presentation.${input.kind}`)
    if (!output) throw new Error(`Sandbox export did not return presentation.${input.kind}.`)
    return {
      jobId: result.id,
      output,
      report: {
        upstreamCommit: DASHIAI_UPSTREAM_COMMIT,
        renderer: 'sandbox-job',
        action: PRESENTATION_SANDBOX_ACTION,
        actionVersion: PRESENTATION_SANDBOX_ACTION_VERSION,
        runtimeProfile: result.runtimeProfile,
        sandboxRuntimeVersion: result.sandboxRuntimeVersion,
        sandboxJobId: result.id,
        attempt: result.attempt
      }
    }
  }

  /**
   * Aggregates Action/Runtime health with Managed Queue pool health. HTML never
   * depends on Browser Runtime and remains available when PDF/PPTX are disabled.
   */
  async getExportCapabilities(force = false): Promise<PresentationExportCapabilities> {
    const config = this.config.get()
    if (config.exportBackend === 'local') {
      const chromium = resolveLocalChromium(config.chromiumExecutablePath)
      const reason = chromium ? undefined : 'LOCAL_BROWSER_UNAVAILABLE' as const
      return {
        backend: 'local',
        html: { available: true },
        pdf: { available: Boolean(chromium), ...(reason ? { reason, message: 'Local Chromium is unavailable.' } : {}) },
        pptx: { available: Boolean(chromium), ...(reason ? { reason, message: 'Local Chromium is unavailable.' } : {}) }
      }
    }
    if (!force && this.actionHealthCache && this.actionHealthCache.expiresAt > Date.now()) {
      return this.actionHealthCache.value
    }
    const jobs = this.runtimeCapabilities?.get(SandboxJobsRuntimeCapability)
    if (!jobs) {
      return sandboxUnavailableCapabilities(
        'PROVIDER_UNAVAILABLE',
        capabilityWarning('PROVIDER_UNAVAILABLE', 'Platform Sandbox Jobs capability is unavailable.')
      )
    }
    const health = await jobs.getActionHealth({
        pluginName: PRESENTATION_STUDIO_PLUGIN_NAME,
        action: PRESENTATION_SANDBOX_ACTION,
        actionVersion: PRESENTATION_SANDBOX_ACTION_VERSION
      }).catch((error) => ({
        available: false as const,
        reason: 'PROFILE_UNHEALTHY' as const,
        message: error instanceof Error ? error.message : String(error)
      }))
    let value: PresentationExportCapabilities
    if (!health.available) {
      const reason = health.reason ?? 'PROFILE_UNHEALTHY'
      value = sandboxUnavailableCapabilities(reason, capabilityWarning(reason, health.message))
    } else if (!this.managedQueue) {
      value = sandboxUnavailableCapabilities(
        'WORKER_UNAVAILABLE',
        capabilityWarning('WORKER_UNAVAILABLE', 'Managed Queue is unavailable; PDF/PPTX export cannot be scheduled.')
      )
    } else {
      const poolHealth = await this.managedQueue.getExecutionPoolHealth({ executionPool: 'sandbox-browser' }).catch((error) => ({
        executionPool: 'sandbox-browser' as const,
        available: false,
        workerCount: 0,
        warning: error instanceof Error ? error.message : String(error)
      }))
      value = poolHealth.available
        ? {
          backend: 'sandbox-job',
          action: PRESENTATION_SANDBOX_ACTION,
          actionVersion: PRESENTATION_SANDBOX_ACTION_VERSION,
          runtimeProfile: health.runtimeProfile,
          sandboxRuntimeVersion: health.sandboxRuntimeVersion,
          provider: health.provider,
          runtimeBindingId: health.runtimeBindingId,
          artifactDigest: health.artifactDigest,
          html: { available: true },
          pdf: { available: true },
          pptx: { available: true }
        }
        : sandboxUnavailableCapabilities(
            'WORKER_UNAVAILABLE',
            capabilityWarning(
              'WORKER_UNAVAILABLE',
              poolHealth.warning ?? 'No active worker is consuming the sandbox-browser execution pool.'
            )
          )
    }
    this.actionHealthCache = { expiresAt: Date.now() + 30_000, value }
    return value
  }

  async cleanup(directory: string) {
    if (basename(directory).startsWith('presentation-studio-')) await rm(directory, { recursive: true, force: true })
  }

  private workspaceFiles(): WorkspaceFilesApi {
    const files = this.runtimeCapabilities?.get(WorkspaceFilesRuntimeCapability)
    if (!files) throw new Error('Platform workspace files capability is not available.')
    return files
  }

  private sandboxJobs(): SandboxJobsApi {
    const jobs = this.runtimeCapabilities?.get(SandboxJobsRuntimeCapability)
    if (!jobs) throw new Error('Platform Sandbox Jobs capability is not available.')
    return jobs
  }

  private async stageAssets(pptDir: string, assets: PresentationAsset[]) {
    const result = new Map<string, string>()
    for (const asset of assets) {
      if (!asset.id) continue
      const source = asset.fileReference?.reference
      if (!source) continue
      const file = await this.workspaceFiles().readBuffer(source)
      const digest = createHash('sha256').update(file.buffer).digest('hex')
      if (digest !== asset.sha256 || file.buffer.byteLength !== asset.size) {
        throw new Error(`Presentation asset ${asset.id} changed after it was registered.`)
      }
      const safeName = sanitizeFileName(asset.fileName, asset.mimeType)
      const relativePath = `assets/user-media/${asset.id}/${safeName}`
      const outputPath = join(pptDir, relativePath)
      await mkdir(dirname(outputPath), { recursive: true })
      await writeFile(outputPath, file.buffer)
      result.set(asset.id, relativePath)
    }
    return result
  }

  private runNode(script: string, args: string[], cwd: string) {
    return this.runExecutable(process.execPath, [join(this.catalog.vendorProjectRoot(), script), ...args], cwd)
  }

  private async runExecutable(command: string, args: string[], cwd: string) {
    const config = this.config.get()
    try {
      await execFileAsync(command, args, {
        cwd,
        env: {
          ...process.env,
          INIT_CWD: cwd,
          DASHI_PPT_THEME_RUNTIME: 'prebuilt',
          DASHI_PPT_CERT_DIR: join(cwd, '.https-preview'),
          ...(config.chromiumExecutablePath ? { CHROME_PATH: config.chromiumExecutablePath } : {})
        },
        maxBuffer: 50 * 1024 * 1024
      })
    } catch (error) {
      const output = error instanceof Error && 'stderr' in error ? String((error as Error & { stderr?: string }).stderr ?? '') : ''
      const message = output.trim() || (error instanceof Error ? error.message : 'Presentation renderer command failed.')
      throw new Error(scrubRendererError(message))
    }
  }
}

function sandboxUnavailableCapabilities(
  reason: NonNullable<PresentationExportCapabilities['pdf']['reason']>,
  message?: string
): PresentationExportCapabilities {
  return {
    backend: 'sandbox-job',
    action: PRESENTATION_SANDBOX_ACTION,
    actionVersion: PRESENTATION_SANDBOX_ACTION_VERSION,
    html: { available: true },
    pdf: { available: false, reason, ...(message ? { message } : {}) },
    pptx: { available: false, reason, ...(message ? { message } : {}) }
  }
}

function capabilityWarning(
  reason: NonNullable<PresentationExportCapabilities['pdf']['reason']>,
  detail?: string
): string {
  const guidance: Partial<Record<NonNullable<PresentationExportCapabilities['pdf']['reason']>, string>> = {
    ACTION_MISSING: 'Update or reinstall Presentation Studio so its Sandbox Action Bundle is registered.',
    ACTION_INVALID: 'Rebuild Presentation Studio and verify the Action Bundle hash and package contents.',
    PROFILE_MISSING: 'Upgrade Xpert so the required Browser Runtime Definition is installed.',
    VERSION_MISMATCH: 'Install matching Presentation Studio and Sandbox Runtime Suite versions.',
    RUNTIME_UNBOUND: 'A Runtime worker is online but has no compatible Binding. Provider distributions must bind the Browser Runtime Definition; Pro supplies the Docker Binding.',
    PROVIDER_UNAVAILABLE: 'The OSS base deployment intentionally does not include a Sandbox Runtime worker. HTML remains available. Install a compatible Provider/worker distribution; Pro includes the Docker Provider worker.',
    PROFILE_UNHEALTHY: 'Check the Provider-owned Sandbox Runtime worker; the Browser Runtime artifact may still be warming or may have failed manifest validation.',
    WORKER_UNAVAILABLE: 'No worker is consuming the sandbox-browser execution pool. The OSS base deployment does not deploy one; install a Provider distribution or use the Pro Docker worker overlay.',
    LOCAL_BROWSER_UNAVAILABLE: 'Local export is deprecated; use Sandbox Jobs or install Chromium for development only.'
  }
  return [detail?.trim(), guidance[reason]].filter(Boolean).join(' ')
}

function resolveLocalChromium(configured?: string) {
  return [configured, process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium']
    .find((candidate): candidate is string => Boolean(candidate && existsSync(candidate)))
}

function transformDeckForDashi(spec: PresentationDeckSpec, assets: Map<string, string>, editorState?: PresentationEditorState) {
  return {
    title: spec.title,
    goal: spec.goal,
    themePack: spec.themePack,
    pageCount: spec.pageCount,
    allowMediaReuse: spec.allowMediaReuse === true,
    text: sanitizePresentationEditorText(editorState?.text ?? {}),
    preview: { ...(spec.preview ?? {}), ...(editorState?.preview ?? {}), autosave: false, themeSwitcher: false },
    slides: spec.slides
      .filter((slide) => slide.status === 'active')
      .map((slide) => ({
        id: slide.id,
        layout: slide.layout,
        props: replaceAssetReferences({ ...slide.props, ...(editorState?.props[slide.id] ?? {}) }, assets)
      }))
  }
}

export function sanitizePresentationEditorText(text: Record<string, string>) {
  return Object.fromEntries(Object.entries(text).map(([key, value]) => [key, plainTextFromEditorHtml(value)]))
}

function plainTextFromEditorHtml(value: string) {
  if (!/[<&]/.test(value)) return value
  const withoutMarkup = value
    .replace(/<br\s*\/?\s*>/giu, '\n')
    .replace(/<\/(?:div|p|li|h[1-6])\s*>/giu, '\n')
    .replace(/<[^>]*>/gu, '')
  return withoutMarkup
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/&quot;/giu, '"')
    .replace(/&#(?:39|x27);/giu, "'")
    .replace(/&#(\d+);/gu, (_match, code: string) => safeCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/giu, (_match, code: string) => safeCodePoint(Number.parseInt(code, 16)))
}

function safeCodePoint(code: number) {
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
}

function replaceAssetReferences(value: PresentationJsonValue, assets: Map<string, string>): PresentationJsonValue {
  if (Array.isArray(value)) return value.map((item) => replaceAssetReferences(item, assets))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceAssetReferences(item, assets)]))
  }
  if (typeof value === 'string' && value.startsWith('asset://')) {
    const id = value.slice('asset://'.length)
    const path = assets.get(id)
    if (!path) throw new Error(`Presentation asset reference is missing: ${id}`)
    return path
  }
  return value
}

function sanitizeFileName(fileName: string, mimeType?: string) {
  const name = basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '')
  if (name) return name
  const extension = mimeType?.startsWith('video/') ? '.mp4' : mimeType?.includes('png') ? '.png' : '.bin'
  return `asset${extension}`
}

function isPresentationJsonObject(value: unknown): value is PresentationJsonObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function scrubRendererError(value: string) {
  return [
    [moduleDir, '<plugin>'],
    [process.cwd(), '<workspace>'],
    [tmpdir(), '<tmp>'],
    [process.env.HOME, '<home>']
  ].reduce((message, [pathName, replacement]) => pathName ? message.split(pathName).join(replacement) : message, value)
}

export function preparePresentationHtmlForExport(html: string) {
  const document = html.replace(/<body\b([^>]*)>/iu, (_match, attributes: string) => {
    const normalized = attributes
      .replace(/\sdata-mode=("[^"]*"|'[^']*')/iu, '')
      .replace(/\sdata-presentation-export=("[^"]*"|'[^']*')/iu, '')
    return `<body${normalized} data-mode="present" data-presentation-export="true">`
  })
  return document.replace('</head>', `${PRESENTATION_EXPORT_STYLE}${PRESENTATION_EXPORT_GUARD}</head>`)
}
