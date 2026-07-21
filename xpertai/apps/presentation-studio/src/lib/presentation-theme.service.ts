import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, posix, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { Repository, type FindOptionsWhere } from 'typeorm'
import {
  WorkspaceFilesRuntimeCapability,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type AgentMiddlewareRuntimeCapabilityRegistry,
  type WorkspaceFile,
  type WorkspaceFilesApi,
  type WorkspacePortableFileReference,
  WORKSPACE_FILES_SOURCE
} from '@xpert-ai/plugin-sdk'
import { PRESENTATION_THEME_LABELS, PRESENTATION_THEME_PACKS } from './constants.js'
import { PresentationTheme } from './entities/index.js'
import type {
  PresentationAssetReference,
  PresentationJsonObject,
  PresentationScope,
  PresentationThemeReference,
  PresentationThemeRuntimeMetadata,
  PresentationThemeProgressStatus,
  PresentationThemeSourceType
} from './types.js'

const THEME_PACKAGE_SCHEMA = 'xpert.presentation-theme-package/v1'
const THEME_RUNTIME_SCHEMA = 'xpert.presentation-theme-runtime/v1'
const THEME_PACKAGE_MIME = 'application/vnd.xpert.presentation-theme+zip'
const MAX_THEME_SOURCE_BYTES = 100 * 1024 * 1024
const MAX_THEME_PACKAGE_BYTES = 150 * 1024 * 1024
const MAX_THEME_GENERATOR_BUNDLE_BYTES = 100 * 1024 * 1024
const THEME_KEY_PATTERN = /^theme(\d{2,})$/
const ADAPTER_MODES = new Set([
  'registry', 'preview-array', 'module-list', 'meta', 'html-order',
  'page-files', 'spec-slot', 'static-react-mixed', 'pptx-slide-tree', 'visual-archetype'
])
const REQUIRED_VERIFICATION_KEYS = [
  'generatedCapabilities', 'palette', 'ownedRender', 'renderContract', 'layoutQuality'
] as const
const THEME_GENERATION_POLICY_VERSION = 2
const THEME_GENERATION_POLICIES = {
  fidelity: { observed: 8, maxObserved: Number.POSITIVE_INFINITY, inferred: 8, ownedFamilies: 9 },
  'reuse-first': { observed: 2, maxObserved: 4, inferred: 0, ownedFamilies: 2 }
} as const
type ThemeGenerationMode = keyof typeof THEME_GENERATION_POLICIES
const THEME_GENERATOR_ARCHIVE_NAME = 'dashi-theme-generator.zip'
const THEME_AUTHORING_STATUSES = new Set(['prepared', 'analyzing', 'generating', 'validating'])
const moduleDir = dirname(fileURLToPath(import.meta.url))
let themeGeneratorBundlePromise: Promise<{ buffer: Buffer; skillMarkdown: string }> | undefined

export type ParsedThemePackage = {
  metadata: PresentationThemeRuntimeMetadata
  manifest: { layouts: Record<string, PresentationJsonObject> }
  browserRuntime: Buffer
  moduleRuntime: Buffer
  assets: Array<{ path: string; buffer: Buffer }>
  packageInfo: PresentationJsonObject
  qualityReport: PresentationJsonObject
}

@Injectable()
export class PresentationThemeService {
  constructor(
    @InjectRepository(PresentationTheme) private readonly repository: Repository<PresentationTheme>,
    @Optional() @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtimeCapabilities?: AgentMiddlewareRuntimeCapabilityRegistry
  ) {}

  async list(scope: PresentationScope) {
    const custom = await this.repository.find({ where: themeScopeWhere(scope), order: { updatedAt: 'DESC' } })
    return {
      builtIn: PRESENTATION_THEME_PACKS.map(key => ({ type: 'builtin' as const, key, name: PRESENTATION_THEME_LABELS[key], status: 'ready' as const })),
      custom: custom.map(themeListSummary)
    }
  }

  async materializeGenerator(scope: PresentationScope, themeId: string, files: WorkspaceFilesApi = this.workspaceFiles()) {
    const theme = await this.requireById(scope, themeId)
    if (!THEME_AUTHORING_STATUSES.has(theme.status === 'draft' ? 'prepared' : theme.status)) {
      throw new BadRequestException(`Theme authoring cannot be opened from status ${theme.status}. Select a prepared or in-progress theme from presentation_list_themes; do not repeat this call unchanged.`)
    }
    const { buffer, skillMarkdown } = await loadThemeGeneratorBundle()
    const recommendedGenerationMode = theme.sourceType === 'images' || theme.sourceType === 'pdf' ? 'reuse-first' : 'fidelity'
    const file = await files.writeRuntimeBuffer({
      ...explicitThemeWorkspaceScope(scope),
      path: `files/presentation-studio/themes/${requiredId(theme.id)}/authoring/${THEME_GENERATOR_ARCHIVE_NAME}`,
      originalName: THEME_GENERATOR_ARCHIVE_NAME,
      mimeType: 'application/zip',
      size: buffer.length,
      buffer,
      metadata: {
        skill: 'dashi-theme-generator',
        source: 'presentation-studio-plugin',
        sha256: sha256(buffer)
      }
    })
    return {
      message: 'The Presentation Studio built-in dashi-theme-generator is ready in the current workspace.',
      theme: themeSummary(theme),
      authoring: {
        themeId: requiredId(theme.id),
        projectThemeKey: theme.themeKey,
        sourceType: theme.sourceType,
        recommendedGenerationMode,
        sourcePath: theme.sourceReference?.workspacePath,
        generatorArchivePath: file.workspacePath,
        nextStep: 'Extract generatorArchivePath into $PWD/.theme-work, then use sourcePath directly. Never search for or construct a themes/<id>/source directory.'
      },
      skill: 'dashi-theme-generator',
      delivery: 'presentation-studio-plugin',
      archivePath: file.workspacePath,
      archiveSha256: sha256(buffer),
      extractDirectory: '$PWD/.theme-work',
      skillPath: '$PWD/.theme-work/dashi-theme-generator/SKILL.md',
      instruction: `Extract the archive into $PWD/.theme-work, then follow the complete SKILL.md and its required references. Use generationMode=${recommendedGenerationMode} unless the user explicitly requests a different fidelity tradeoff. Reuse-first pins complete components from theme01-theme12 and requires only the external template signature modules. Scaffold output is non-terminal: the current agent must implement the remaining owned JSX modules and continue through validation, packaging, and registration. Do not ask the user to implement JSX and do not use skillsMiddleware.`,
      completionContract: {
        scaffoldIsTerminal: false,
        userManualCodingRequired: false,
        agentMustImplementOwnedModules: true,
        baselineComponentReuseAllowed: true,
        recommendedGenerationMode,
        successStatus: 'ready',
        failureTool: 'presentation_report_theme_failure'
      },
      skillMarkdown,
      file
    }
  }

  async prepareUploadedSource(
    scope: PresentationScope,
    input: { name: string; sourceType: PresentationThemeSourceType; fileName: string; mimeType?: string },
    buffer: Buffer
  ) {
    if (!buffer.length || buffer.length > MAX_THEME_SOURCE_BYTES) {
      throw new BadRequestException('Theme template must be between 1 byte and 100 MB.')
    }
    const workspaceScope = explicitThemeWorkspaceScope(scope)
    const id = randomUUID()
    const themeKey = themeKeyFromId(id)
    const uploaded = await this.workspaceFiles().uploadBuffer({
      ...workspaceScope,
      buffer,
      originalName: input.fileName,
      mimeType: input.mimeType,
      size: buffer.length,
      folder: `files/presentation-studio/themes/${id}/source`
    })
    return this.createPrepared(scope, {
      id,
      themeKey,
      name: requiredText(input.name, 'Theme name is required.'),
      sourceType: input.sourceType,
      sourceReference: assetReference(uploaded, workspaceScope, input.fileName, input.mimeType, buffer)
    })
  }

  async prepareRuntimeSource(
    scope: PresentationScope,
    input: { name: string; sourceType: PresentationThemeSourceType },
    file: { name: string; mimeType?: string; size?: number; buffer: Buffer; reference: WorkspacePortableFileReference }
  ) {
    if (!file.buffer.length || file.buffer.length > MAX_THEME_SOURCE_BYTES) {
      throw new BadRequestException('Theme template must be between 1 byte and 100 MB.')
    }
    const id = randomUUID()
    return this.createPrepared(scope, {
      id,
      themeKey: themeKeyFromId(id),
      name: requiredText(input.name, 'Theme name is required.'),
      sourceType: input.sourceType,
      sourceReference: {
        reference: file.reference,
        fileName: file.name,
        mimeType: file.mimeType,
        size: file.size ?? file.buffer.length,
        sha256: sha256(file.buffer),
        workspacePath: file.reference.workspacePath
      }
    })
  }

  async prepareRuntimeImageSources(
    scope: PresentationScope,
    input: { name: string },
    files: Array<{ name: string; buffer: Buffer }>
  ) {
    if (files.length < 8 || files.length > 30) {
      throw new BadRequestException('Image evidence must contain between 8 and 30 images.')
    }
    const archive = new JSZip()
    let totalBytes = 0
    files.forEach((file, index) => {
      totalBytes += file.buffer.length
      const image = supportedImage(file.buffer)
      archive.file(`evidence/page-${String(index + 1).padStart(2, '0')}.${image.extension}`, file.buffer)
    })
    if (totalBytes > MAX_THEME_SOURCE_BYTES) {
      throw new BadRequestException('Theme image evidence must not exceed 100 MB.')
    }
    archive.file('evidence-index.json', `${JSON.stringify({
      schema: 'xpert.presentation-theme-image-evidence/v1',
      imageCount: files.length,
      sources: files.map((file, index) => ({ page: index + 1, originalName: file.name }))
    }, null, 2)}\n`)
    const buffer = await archive.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
    return this.prepareUploadedSource(scope, {
      name: input.name,
      sourceType: 'images',
      fileName: `${safeFileStem(input.name)}.images.zip`,
      mimeType: 'application/zip'
    }, buffer)
  }

  async updateGenerationStatus(scope: PresentationScope, themeId: string, status: PresentationThemeProgressStatus) {
    const theme = await this.requireById(scope, themeId)
    const expected = nextGenerationStatus(theme.status)
    if (status !== expected) {
      throw new BadRequestException(`Theme generation status must advance from ${theme.status} to ${expected ?? 'no further stage'}.`)
    }
    theme.status = status
    theme.failureReason = undefined
    await this.repository.save(theme)
    return themeSummary(theme)
  }

  async registerRuntimePackage(
    scope: PresentationScope,
    themeId: string,
    file: { name: string; mimeType?: string; size?: number; buffer: Buffer; reference: WorkspacePortableFileReference }
  ) {
    const theme = await this.requireById(scope, themeId)
    if (theme.status !== 'validating') {
      throw new BadRequestException('Theme package can be registered only after the validating stage is reported.')
    }
    if (!file.buffer.length || file.buffer.length > MAX_THEME_PACKAGE_BYTES) {
      throw new BadRequestException('Theme package must be between 1 byte and 150 MB.')
    }
    const parsed = await parseThemePackage(file.buffer, theme)
    theme.status = 'ready'
    theme.adapterMode = stringValue(parsed.packageInfo.adapterMode)
    theme.packageReference = {
      reference: file.reference,
      fileName: file.name,
      mimeType: file.mimeType ?? THEME_PACKAGE_MIME,
      size: file.size ?? file.buffer.length,
      sha256: sha256(file.buffer),
      workspacePath: file.reference.workspacePath
    }
    theme.packageSha256 = sha256(file.buffer)
    theme.packageSize = file.buffer.length
    theme.runtimeMetadata = parsed.metadata
    theme.qualityReport = parsed.qualityReport
    theme.failureReason = undefined
    await this.repository.save(theme)
    return {
      message: 'Custom presentation theme registered.',
      theme: themeSummary(theme),
      pageCount: parsed.metadata.pages.length,
      generationMode: parsed.packageInfo.generationMode,
      structureFamilies: parsed.packageInfo.structureFamilies,
      observedModules: parsed.packageInfo.observedModuleCount,
      inferredModules: parsed.packageInfo.inferredModuleCount,
      paletteMode: parsed.packageInfo.paletteMode
    }
  }

  async markFailed(scope: PresentationScope, themeId: string, reason: string) {
    const theme = await this.requireById(scope, themeId)
    if (theme.status === 'ready') throw new BadRequestException('A ready theme cannot be marked failed.')
    theme.status = 'failed'
    theme.failureReason = requiredText(reason, 'Theme failure reason is required.').slice(0, 4000)
    await this.repository.save(theme)
    return themeSummary(theme)
  }

  async resolveReference(scope: PresentationScope, themeKey: string): Promise<PresentationThemeReference> {
    if ((PRESENTATION_THEME_PACKS as readonly string[]).includes(themeKey)) {
      return { type: 'builtin', key: themeKey as (typeof PRESENTATION_THEME_PACKS)[number] }
    }
    const theme = await this.requireReadyByKey(scope, themeKey)
    return { type: 'custom', key: theme.themeKey, themeId: requiredId(theme.id) }
  }

  async requireReadyByKey(scope: PresentationScope, themeKey: string) {
    const theme = await this.repository.findOne({ where: { ...themeScopeWhere(scope), themeKey, status: 'ready' } })
    if (!theme) throw new NotFoundException(`Custom presentation theme is not ready or does not exist: ${themeKey}`)
    return theme
  }

  async loadReadyPackage(scope: PresentationScope, themeKey: string) {
    const theme = await this.requireReadyByKey(scope, themeKey)
    const reference = theme.packageReference?.reference
    if (!reference) throw new NotFoundException('Custom presentation theme package is missing.')
    const file = await this.workspaceFiles().readRuntimeBuffer(reference)
    if (theme.packageSha256 && sha256(file.buffer) !== theme.packageSha256) {
      throw new BadRequestException('Custom presentation theme package changed after registration.')
    }
    return { theme, parsed: await parseThemePackage(file.buffer, theme) }
  }

  async withStagedTheme<T>(scope: PresentationScope, themeKey: string, callback: (environment: NodeJS.ProcessEnv) => Promise<T>) {
    const root = await mkdtemp(join(tmpdir(), 'presentation-theme-'))
    try {
      const environment = await this.stageReadyTheme(scope, themeKey, root)
      return await callback(environment)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }

  async stageThemeReference(reference: PresentationThemeReference | undefined, root: string, scope: PresentationScope) {
    if (!reference || reference.type === 'builtin') return {}
    const theme = await this.requireById(scope, reference.themeId)
    if (theme.themeKey !== reference.key || theme.status !== 'ready') {
      throw new BadRequestException('Custom presentation theme reference is stale or not ready.')
    }
    return this.stageTheme(theme, await this.readPackage(theme), root)
  }

  async getSandboxPackage(reference: PresentationThemeReference, scope: PresentationScope) {
    if (reference.type !== 'custom') return undefined
    const theme = await this.requireById(scope, reference.themeId)
    if (theme.themeKey !== reference.key || theme.status !== 'ready' || !theme.packageReference?.reference) {
      throw new BadRequestException('Custom presentation theme reference is stale or not ready.')
    }
    return {
      themeKey: theme.themeKey,
      sourceType: theme.sourceType,
      reference: theme.packageReference.reference,
      size: theme.packageSize ?? theme.packageReference.size,
      sha256: theme.packageSha256 ?? theme.packageReference.sha256
    }
  }

  private async stageReadyTheme(scope: PresentationScope, themeKey: string, root: string) {
    const { theme, parsed } = await this.loadReadyPackage(scope, themeKey)
    return this.stageTheme(theme, parsed, root)
  }

  private async stageTheme(theme: PresentationTheme, parsed: ParsedThemePackage, root: string) {
    const runtimeRoot = join(root, 'runtime')
    const assetRoot = join(root, 'assets')
    const metadataPath = join(root, 'external-theme-metadata.json')
    await mkdir(runtimeRoot, { recursive: true })
    await writeFile(join(runtimeRoot, `imported-theme-runtime.${theme.themeKey}.js`), parsed.browserRuntime)
    await writeFile(join(runtimeRoot, `${theme.themeKey}.module.mjs`), parsed.moduleRuntime)
    await writeFile(metadataPath, `${JSON.stringify(parsed.metadata)}\n`, 'utf8')
    for (const asset of parsed.assets) {
      const target = join(assetRoot, ...asset.path.split('/'))
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, asset.buffer)
    }
    return {
      DASHI_PPT_EXTERNAL_THEME_METADATA: metadataPath,
      DASHI_PPT_THEME_RUNTIME_DIR: runtimeRoot,
      ...(parsed.assets.length ? { DASHI_PPT_EXTERNAL_THEME_ASSETS_DIR: assetRoot } : {})
    }
  }

  private async readPackage(theme: PresentationTheme) {
    const reference = theme.packageReference?.reference
    if (!reference) throw new NotFoundException('Custom presentation theme package is missing.')
    const file = await this.workspaceFiles().readRuntimeBuffer(reference)
    if (theme.packageSha256 && sha256(file.buffer) !== theme.packageSha256) {
      throw new BadRequestException('Custom presentation theme package changed after registration.')
    }
    return parseThemePackage(file.buffer, theme)
  }

  private async createPrepared(scope: PresentationScope, input: {
    id: string
    themeKey: string
    name: string
    sourceType: PresentationThemeSourceType
    sourceReference: PresentationAssetReference
  }) {
    const theme = await this.repository.save(this.repository.create({
      id: input.id,
      ...themeScopeFields(scope),
      themeKey: input.themeKey,
      name: input.name,
      sourceType: input.sourceType,
      status: 'prepared',
      sourceReference: input.sourceReference,
      createdById: stringValue(scope.userId)
    }))
    return {
      message: 'Theme source prepared. No background generation has started.',
      theme: themeSummary(theme),
      authoring: {
        skill: 'dashi-theme-generator',
        projectThemeKey: theme.themeKey,
        sourceType: theme.sourceType,
        sourcePath: theme.sourceReference.workspacePath,
        outputContract: THEME_PACKAGE_SCHEMA,
        nextAction: {
          tool: 'presentation_open_dashi_theme_generator',
          input: { themeId: requiredId(theme.id) }
        },
        nextStep: 'Call presentation_open_dashi_theme_generator exactly once with nextAction.input, then use its returned sourcePath and archivePath. Do not search for or construct a source directory.'
      }
    }
  }

  private async requireById(scope: PresentationScope, id: string) {
    const theme = await this.repository.findOne({ where: { ...themeScopeWhere(scope), id } })
    if (!theme) throw new NotFoundException('Presentation theme was not found.')
    return theme
  }

  private workspaceFiles(): WorkspaceFilesApi {
    const files = this.runtimeCapabilities?.get(WorkspaceFilesRuntimeCapability)
    if (!files) throw new Error('Platform workspace files capability is not available.')
    return files
  }
}

async function parseThemePackage(buffer: Buffer, expected: PresentationTheme): Promise<ParsedThemePackage> {
  let archive: JSZip
  try {
    archive = await JSZip.loadAsync(buffer, { checkCRC32: true })
  } catch {
    throw new BadRequestException('Theme package is not a valid ZIP archive.')
  }
  for (const name of Object.keys(archive.files)) assertSafeArchivePath(name)
  const packageInfo = await readJsonEntry(archive, 'package.json')
  if (packageInfo.schema !== THEME_PACKAGE_SCHEMA) throw new BadRequestException(`Theme package must use ${THEME_PACKAGE_SCHEMA}.`)
  if (packageInfo.themeKey !== expected.themeKey || packageInfo.sourceType !== expected.sourceType) {
    throw new BadRequestException('Theme package identity or sourceType does not match the prepared theme.')
  }
  const adapterMode = stringValue(packageInfo.adapterMode)
  if (!adapterMode || !ADAPTER_MODES.has(adapterMode)) throw new BadRequestException('Theme package adapterMode is missing or unsupported.')
  const observed = integerValue(packageInfo.observedModuleCount)
  const inferred = integerValue(packageInfo.inferredModuleCount)
  const families = stringArray(packageInfo.structureFamilies)
  const generationMode = stringValue(packageInfo.generationMode) as ThemeGenerationMode | undefined
  if (!generationMode) throw new BadRequestException('Theme package generationMode is required.')
  const generationPolicy = THEME_GENERATION_POLICIES[generationMode]
  if (!generationPolicy) throw new BadRequestException('Theme package generationMode must be fidelity or reuse-first.')
  if (integerValue(packageInfo.policyVersion) !== THEME_GENERATION_POLICY_VERSION) {
    throw new BadRequestException(`Theme package policyVersion must equal ${THEME_GENERATION_POLICY_VERSION}.`)
  }
  const ownedFamilies = stringArray(packageInfo.ownedStructureFamilies ?? packageInfo.structureFamilies)
  if (observed < generationPolicy.observed || observed > generationPolicy.maxObserved || inferred < generationPolicy.inferred || ownedFamilies.length < generationPolicy.ownedFamilies) {
    throw new BadRequestException(`Theme package does not satisfy the ${generationMode} owned-module policy.`)
  }
  if (families.length < 9) throw new BadRequestException('Theme package composed library must contain at least 9 structure families.')
  if (packageInfo.paletteMode !== 'adaptive' && packageInfo.paletteMode !== 'strict') {
    throw new BadRequestException('Theme package paletteMode must be adaptive or strict.')
  }
  const qualityReport = isObject(packageInfo.verification) ? packageInfo.verification : {}
  for (const key of REQUIRED_VERIFICATION_KEYS) {
    if (qualityReport[key] !== 'passed') throw new BadRequestException(`Theme verification gate did not pass: ${key}`)
  }

  const metadataValue = await readJsonEntry(archive, 'metadata.json')
  if (metadataValue.schema !== THEME_RUNTIME_SCHEMA || !isObject(metadataValue.theme) || !Array.isArray(metadataValue.pages)) {
    throw new BadRequestException(`metadata.json must use ${THEME_RUNTIME_SCHEMA}.`)
  }
  const metadata = metadataValue as PresentationThemeRuntimeMetadata
  if (metadata.theme.key !== expected.themeKey || metadata.pages.length < 76 || metadata.pages.length > 96) {
    throw new BadRequestException('Theme runtime metadata identity or page count is invalid.')
  }
  if (metadata.pages.length !== integerValue(packageInfo.pageCount)) {
    throw new BadRequestException('Theme package pageCount does not match metadata.json.')
  }
  const manifestValue = await readJsonEntry(archive, 'layout-manifest.json')
  if (!isObject(manifestValue.layouts)) throw new BadRequestException('layout-manifest.json must contain layouts.')
  const manifest = manifestValue as { layouts: Record<string, PresentationJsonObject> }
  const pageKeys = new Set<string>()
  for (const page of metadata.pages) {
    const key = stringValue(page.key)
    if (!key || page.themeKey !== expected.themeKey || !key.startsWith(`${expected.themeKey}_page`) || pageKeys.has(key)) {
      throw new BadRequestException('Theme runtime metadata contains an invalid or duplicate page identity.')
    }
    pageKeys.add(key)
  }
  const manifestKeys = Object.keys(manifest.layouts)
  if (manifestKeys.length !== pageKeys.size || manifestKeys.some(key => !pageKeys.has(key) || manifest.layouts[key]?.themePack !== expected.themeKey)) {
    throw new BadRequestException('Theme layout manifest does not match runtime metadata.')
  }
  const browserRuntime = await readBufferEntry(archive, 'runtime/imported-theme-runtime.js')
  const moduleRuntime = await readBufferEntry(archive, 'runtime/theme.module.mjs')
  if (!browserRuntime.length || !moduleRuntime.length) throw new BadRequestException('Theme package runtimes are empty.')
  const assets: ParsedThemePackage['assets'] = []
  for (const [name, entry] of Object.entries(archive.files)) {
    if (entry.dir || !name.startsWith('assets/')) continue
    const relative = name.slice('assets/'.length)
    if (!relative) continue
    assets.push({ path: relative, buffer: await entry.async('nodebuffer') })
  }
  return { metadata, manifest, browserRuntime, moduleRuntime, assets, packageInfo, qualityReport }
}

function assertSafeArchivePath(name: string) {
  const normalized = posix.normalize(name)
  if (!name || name.startsWith('/') || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../') || name.includes('\\')) {
    throw new BadRequestException(`Theme package contains an unsafe path: ${name}`)
  }
}

async function readJsonEntry(archive: JSZip, name: string): Promise<PresentationJsonObject> {
  const entry = archive.file(name)
  if (!entry) throw new BadRequestException(`Theme package is missing ${name}.`)
  try {
    const value: unknown = JSON.parse(await entry.async('string'))
    if (!isObject(value)) throw new Error('not an object')
    return value
  } catch {
    throw new BadRequestException(`Theme package ${name} is not valid JSON.`)
  }
}

async function readBufferEntry(archive: JSZip, name: string) {
  const entry = archive.file(name)
  if (!entry) throw new BadRequestException(`Theme package is missing ${name}.`)
  return entry.async('nodebuffer')
}

function themeKeyFromId(id: string) {
  const numeric = BigInt(`0x${id.replaceAll('-', '')}`).toString(10)
  return `theme${numeric}`
}

function themeSummary(theme: PresentationTheme) {
  return {
    id: theme.id,
    type: 'custom',
    key: theme.themeKey,
    name: theme.name,
    sourceType: theme.sourceType,
    adapterMode: theme.adapterMode,
    status: theme.status === 'draft' ? 'prepared' : theme.status,
    sourceFileName: theme.sourceReference?.fileName,
    sourcePath: theme.sourceReference?.workspacePath,
    pageCount: Array.isArray(theme.runtimeMetadata?.pages) ? theme.runtimeMetadata.pages.length : 0,
    qualityReport: theme.qualityReport,
    failureReason: theme.failureReason,
    createdAt: theme.createdAt,
    updatedAt: theme.updatedAt
  }
}

function themeListSummary(theme: PresentationTheme) {
  const summary = themeSummary(theme)
  if (summary.status !== 'prepared' || !theme.id) return summary
  return {
    ...summary,
    nextAction: {
      tool: 'presentation_open_dashi_theme_generator',
      input: { themeId: theme.id },
      instruction: 'Open this prepared theme once and use the returned sourcePath. Do not call prepare again or search a guessed source directory.'
    }
  }
}

function themeScopeFields(scope: PresentationScope) {
  return {
    tenantId: stringValue(scope.tenantId),
    organizationId: stringValue(scope.organizationId),
    workspaceId: stringValue(scope.workspaceId),
    projectId: stringValue(scope.projectId),
    assistantId: stringValue(scope.xpertId) ?? stringValue(scope.assistantId)
  }
}

function themeScopeWhere(scope: PresentationScope): FindOptionsWhere<PresentationTheme> {
  const fields = themeScopeFields(scope)
  const where: FindOptionsWhere<PresentationTheme> = {}
  if (fields.tenantId) where.tenantId = fields.tenantId
  if (fields.organizationId) where.organizationId = fields.organizationId
  if (fields.workspaceId) where.workspaceId = fields.workspaceId
  if (fields.projectId) where.projectId = fields.projectId
  if (fields.assistantId) where.assistantId = fields.assistantId
  return where
}

function explicitThemeWorkspaceScope(scope: PresentationScope) {
  if (scope.projectId) return { tenantId: scope.tenantId, userId: scope.userId, catalog: 'projects' as const, scopeId: scope.projectId, projectId: scope.projectId }
  const xpertId = scope.xpertId ?? scope.assistantId
  if (xpertId) return { tenantId: scope.tenantId, userId: scope.userId, catalog: 'xperts' as const, scopeId: xpertId, xpertId, isolateByUser: false }
  throw new BadRequestException('Theme generation requires a project or Xpert workspace scope.')
}

function assetReference(
  file: WorkspaceFile,
  scope: ReturnType<typeof explicitThemeWorkspaceScope>,
  originalName: string,
  mimeType: string | undefined,
  buffer: Buffer
): PresentationAssetReference {
  const reference: WorkspacePortableFileReference = {
    source: WORKSPACE_FILES_SOURCE,
    filePath: file.filePath,
    workspacePath: file.workspacePath,
    catalog: scope.catalog,
    scopeId: scope.scopeId,
    tenantId: scope.tenantId,
    userId: scope.userId,
    ...('projectId' in scope ? { projectId: scope.projectId } : {}),
    ...('xpertId' in scope ? { xpertId: scope.xpertId, isolateByUser: false } : {}),
    originalName,
    name: file.name,
    mimeType: file.mimeType ?? mimeType,
    size: file.size ?? buffer.length
  }
  return {
    reference,
    fileName: originalName,
    mimeType: file.mimeType ?? mimeType,
    size: file.size ?? buffer.length,
    sha256: sha256(buffer),
    fileUrl: file.fileUrl ?? file.url,
    workspacePath: file.workspacePath
  }
}

function sha256(value: Buffer) { return createHash('sha256').update(value).digest('hex') }
function nextGenerationStatus(status: PresentationTheme['status']): PresentationThemeProgressStatus | undefined {
  if (status === 'draft' || status === 'prepared') return 'analyzing'
  if (status === 'analyzing') return 'generating'
  if (status === 'generating') return 'validating'
  return undefined
}
function supportedImage(buffer: Buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { extension: 'png', mimeType: 'image/png' }
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: 'jpg', mimeType: 'image/jpeg' }
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return { extension: 'webp', mimeType: 'image/webp' }
  }
  throw new BadRequestException('Image evidence accepts only valid PNG, JPEG, or WebP files.')
}
function safeFileStem(value: string) {
  return requiredText(value, 'Theme name is required.').replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'presentation-theme'
}
function stringValue(value: unknown) { return typeof value === 'string' && value.trim() ? value.trim() : undefined }
function requiredText(value: unknown, message: string) { const text = stringValue(value); if (!text) throw new BadRequestException(message); return text }
function requiredId(value: unknown) { const id = stringValue(value); if (!id) throw new Error('Theme id is missing.'); return id }
function integerValue(value: unknown) { return typeof value === 'number' && Number.isInteger(value) ? value : -1 }
function stringArray(value: unknown) { return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map(item => item.trim()))] : [] }
function isObject(value: unknown): value is PresentationJsonObject { return Boolean(value && typeof value === 'object' && !Array.isArray(value)) }

async function loadThemeGeneratorBundle() {
  themeGeneratorBundlePromise ??= buildThemeGeneratorBundle().catch((error) => {
    themeGeneratorBundlePromise = undefined
    throw error
  })
  return themeGeneratorBundlePromise
}

async function buildThemeGeneratorBundle() {
  const root = findThemeGeneratorRoot()
  const skillMarkdown = await readFile(join(root, 'SKILL.md'), 'utf8')
  const archive = new JSZip()
  const archiveDate = new Date('1980-01-01T00:00:00.000Z')
  let sourceBytes = 0

  async function visit(directory: string) {
    const entries = (await readdir(directory, { withFileTypes: true }))
      .filter(entry => entry.name !== 'node_modules' && entry.name !== '.git')
      .sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      const absolutePath = join(directory, entry.name)
      if (entry.isDirectory()) {
        await visit(absolutePath)
        continue
      }
      if (!entry.isFile()) throw new Error(`Unsupported file in bundled dashi-theme-generator: ${absolutePath}`)
      const buffer = await readFile(absolutePath)
      sourceBytes += buffer.length
      if (sourceBytes > MAX_THEME_GENERATOR_BUNDLE_BYTES) {
        throw new Error('Bundled dashi-theme-generator exceeds the 100 MB workspace delivery limit.')
      }
      const archivePath = ['dashi-theme-generator', ...relative(root, absolutePath).split(sep)].join('/')
      archive.file(archivePath, buffer, { date: archiveDate, createFolders: true })
    }
  }

  await visit(root)
  const buffer = await archive.generateAsync({ type: 'nodebuffer', compression: 'STORE', platform: 'UNIX' })
  if (buffer.length > MAX_THEME_GENERATOR_BUNDLE_BYTES) {
    throw new Error('Bundled dashi-theme-generator archive exceeds the 100 MB workspace delivery limit.')
  }
  return { buffer, skillMarkdown }
}

function findThemeGeneratorRoot() {
  const candidates = [
    join(moduleDir, '..', '..', 'skills', 'dashi-theme-generator'),
    join(process.cwd(), 'apps', 'presentation-studio', 'skills', 'dashi-theme-generator'),
    join(process.cwd(), 'xpertai', 'apps', 'presentation-studio', 'skills', 'dashi-theme-generator'),
    join(process.cwd(), 'skills', 'dashi-theme-generator')
  ]
  const root = candidates.find(candidate => existsSync(join(candidate, 'SKILL.md')))
  if (!root) throw new Error(`Bundled dashi-theme-generator was not found: ${candidates.join(', ')}`)
  return root
}
