import { Inject, Injectable, Optional } from '@nestjs/common'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, dirname, extname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import {
  WorkspaceFilesRuntimeCapability,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type AgentMiddlewareRuntimeCapabilityRegistry,
  type WorkspaceFilesApi
} from '@xpert-ai/plugin-sdk'
import { DASHIAI_UPSTREAM_COMMIT } from './constants.js'
import { PresentationConfigService } from './presentation-config.service.js'
import { inlinePresentationHtml } from './presentation-html-inliner.js'
import type { PresentationAsset, PresentationDeckVersion } from './entities/index.js'
import type { PresentationDeckSpec, PresentationEditorState, PresentationExportKind, PresentationJsonObject, PresentationJsonValue, PresentationRenderResult } from './types.js'
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

@Injectable()
export class PresentationRendererService {
  constructor(
    private readonly catalog: PresentationCatalogService,
    private readonly config: PresentationConfigService,
    @Optional()
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    private readonly runtimeCapabilities?: AgentMiddlewareRuntimeCapabilityRegistry
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

  async cleanup(directory: string) {
    if (basename(directory).startsWith('presentation-studio-')) await rm(directory, { recursive: true, force: true })
  }

  private workspaceFiles(): WorkspaceFilesApi {
    const files = this.runtimeCapabilities?.get(WorkspaceFilesRuntimeCapability)
    if (!files) throw new Error('Platform workspace files capability is not available.')
    return files
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
