import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash } from 'node:crypto'
import { IsNull, Not } from 'typeorm'
import type { FindOptionsWhere, Repository } from 'typeorm'
import {
  XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN,
  XPERT_RUNTIME_CAPABILITIES_TOKEN
} from '@xpert-ai/plugin-sdk'
import type {
  AgentMiddlewareRuntimeCapabilityRegistry,
  AgentMiddlewareRuntimeServiceApi
} from '@xpert-ai/plugin-sdk'
import {
  OFFICE_CLI_MIME_TYPES,
  OFFICE_CLI_WORKSPACE_FILES_RUNTIME_CAPABILITY
} from './constants.js'
import { OfficeCliDocument, OfficeCliVersion } from './entities/index.js'
import {
  extensionFromFileName,
  isWriteCommand,
  OfficeCliRuntimeService
} from './office-cli-runtime.service.js'
import type {
  ApplyOfficeCliWordDesignInput,
  CreateOfficeCliDocumentInput,
  ExecuteOfficeCliCommandInput,
  ImportOfficeCliDocumentInput,
  OfficeCliDocumentFormat,
  OfficeCliGuidanceSkill,
  OfficeCliScope,
  OfficeCliVersionSource,
  OfficeCliWorkbenchQuery,
  OfficeCliWorkspaceFileScope,
  OfficeCliWorkspaceFilesApi,
  RestoreOfficeCliVersionInput
} from './types.js'

const MAX_OFFICE_FILE_BYTES = 100 * 1024 * 1024
const MAX_PREVIEW_HTML_BYTES = 12 * 1024 * 1024
const MAX_RETAINED_VERSIONS = 5
const OFFICE_CLI_WORKSPACE_DOCUMENTS_FOLDER = 'files/office-cli/documents'

@Injectable()
export class OfficeCliService {
  private readonly previewCache = new Map<string, Promise<string>>()

  constructor(
    @InjectRepository(OfficeCliDocument)
    private readonly documentRepository: Repository<OfficeCliDocument>,
    @InjectRepository(OfficeCliVersion)
    private readonly versionRepository: Repository<OfficeCliVersion>,
    private readonly runtime: OfficeCliRuntimeService,
    @Optional()
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    private readonly runtimeCapabilities?: AgentMiddlewareRuntimeCapabilityRegistry,
    @Optional()
    @Inject(XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN)
    private readonly runtimeService?: AgentMiddlewareRuntimeServiceApi
  ) {}

  async createDocument(scope: OfficeCliScope, input: CreateOfficeCliDocumentInput) {
    const title = normalizeRequired(input.title, 'OfficeCLI document title is required.')
    const format = input.format
    const document = await this.documentRepository.save(
      this.documentRepository.create({
        ...scopedCreate(scope),
        assistantId: normalizeOptional(input.assistantId) ?? normalizeOptional(scope.assistantId),
        conversationId: normalizeOptional(input.conversationId) ?? normalizeOptional(scope.conversationId),
        format,
        title,
        description: normalizeOptional(input.description),
        status: 'draft',
        fileName: `${safeFileStem(title)}.${format}`,
        mimeType: OFFICE_CLI_MIME_TYPES[format],
        size: 0,
        currentVersionNumber: 0,
        createdById: normalizeOptional(scope.userId)
      })
    )
    const documentId = requireId(document.id, 'OfficeCLI document id was not generated.')
    try {
      let buffer = await this.runtime.createDocument(format)
      if (format === 'docx') {
        buffer = (await this.applyWordDesignToBuffer(buffer, {
          includeTableOfContents: false
        })).buffer
      }
      return await this.saveVersion(scope, document, buffer, {
        source: 'create',
        command: 'create',
        commandArgs: [],
        changeSummary: 'Created with OfficeCLI'
      })
    } catch (error) {
      await this.documentRepository.delete({ id: documentId })
      throw error
    }
  }

  async importDocument(scope: OfficeCliScope, input: ImportOfficeCliDocumentInput) {
    const format = extensionFromFileName(input.fileName)
    validateOfficeBuffer(input.buffer)
    const title = normalizeOptional(input.title) ?? stripOfficeExtension(input.fileName)
    const document = await this.documentRepository.save(
      this.documentRepository.create({
        ...scopedCreate(scope),
        assistantId: normalizeOptional(input.assistantId) ?? normalizeOptional(scope.assistantId),
        conversationId: normalizeOptional(input.conversationId) ?? normalizeOptional(scope.conversationId),
        format,
        title,
        description: normalizeOptional(input.description),
        status: 'draft',
        fileName: normalizeFileName(input.fileName, format),
        mimeType: OFFICE_CLI_MIME_TYPES[format],
        size: input.buffer.byteLength,
        currentVersionNumber: 0,
        createdById: normalizeOptional(scope.userId)
      })
    )
    const documentId = requireId(document.id, 'OfficeCLI document id was not generated.')
    try {
      return await this.saveVersion(scope, document, input.buffer, {
        source: 'import',
        command: 'import',
        commandArgs: [],
        changeSummary: 'Imported into OfficeCLI'
      })
    } catch (error) {
      await this.documentRepository.delete({ id: documentId })
      throw error
    }
  }

  async getWorkbenchData(scope: OfficeCliScope, query: OfficeCliWorkbenchQuery = {}) {
    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20))
    const where = scopedDocumentWhere(scope)
    const availableWhere = {
      ...where,
      status: 'active' as const,
      currentVersionId: Not(IsNull())
    }
    const [unfilteredItems, total] = await this.documentRepository.findAndCount({
      where: availableWhere,
      order: { updatedAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize
    })
    const search = normalizeOptional(query.search)?.toLowerCase()
    const items = search
      ? unfilteredItems.filter((item) =>
          item.title.toLowerCase().includes(search)
          || item.fileName.toLowerCase().includes(search))
      : unfilteredItems
    const documentId = normalizeOptional(query.documentId)
    const selected = documentId
      ? await this.getSelectedDocumentData(scope, documentId)
      : undefined

    return {
      tableKey: 'documents',
      table: {
        key: 'documents',
        items,
        total: search ? items.length : total,
        page,
        pageSize
      },
      items,
      total: search ? items.length : total,
      page,
      pageSize,
      selected,
      commandCatalog: {
        read: ['view', 'get', 'query', 'validate', 'dump', 'raw', 'help'],
        write: ['set', 'add', 'import', 'remove', 'move', 'swap', 'raw-set', 'add-part', 'batch', 'merge', 'refresh']
      }
    }
  }

  async readDocument(scope: OfficeCliScope, documentId: string) {
    const document = await this.requireDocument(scope, documentId)
    const version = await this.requireCurrentVersion(scope, document)
    const file = await this.readVersionBuffer(scope, version)
    const result = await this.runtime.executeDocumentCommand({
      buffer: file,
      format: document.format,
      command: 'get',
      args: ['/', '--depth', '2']
    })
    return {
      document,
      version,
      result: compactExecution(result)
    }
  }

  async executeCommand(scope: OfficeCliScope, input: ExecuteOfficeCliCommandInput) {
    const document = await this.requireDocument(scope, input.documentId)
    const currentVersion = await this.requireCurrentVersion(scope, document)
    if (isWriteCommand(input.command) && (input.expectedVersionNumber === undefined || input.expectedVersionNumber === null)) {
      throw new BadRequestException('OfficeCLI writes require expectedVersionNumber.')
    }
    assertExpectedVersion(document, input.expectedVersionNumber)
    if ((input.command === 'raw-set' || input.command === 'add-part') && input.dangerousConfirmed !== true) {
      throw new BadRequestException(
        `OfficeCLI ${input.command} requires explicit dangerousConfirmed=true because it changes raw package structure.`
      )
    }
    const buffer = await this.readVersionBuffer(scope, currentVersion)
    const result = await this.runtime.executeDocumentCommand({
      buffer,
      format: document.format,
      command: input.command,
      args: input.args,
      stdin: input.stdin
    })

    if (!isWriteCommand(input.command)) {
      return {
        document,
        version: currentVersion,
        result: compactExecution(result),
        mutated: false
      }
    }

    const saved = await this.saveVersion(scope, document, result.fileBuffer, {
      source: input.source ?? 'agent',
      command: input.command,
      commandArgs: input.args ?? [],
      sourceVersionId: currentVersion.id,
      changeSummary: normalizeOptional(input.changeSummary) ?? `OfficeCLI ${input.command}`
    })
    return {
      ...saved,
      result: compactExecution(result),
      mutated: true
    }
  }

  async listVersions(scope: OfficeCliScope, documentId: string) {
    await this.requireDocument(scope, documentId)
    return this.versionRepository.find({
      where: { documentId },
      order: { versionNumber: 'DESC' },
      take: 100
    })
  }

  async restoreVersion(scope: OfficeCliScope, input: RestoreOfficeCliVersionInput) {
    const document = await this.requireDocument(scope, input.documentId)
    assertExpectedVersion(document, input.expectedVersionNumber)
    const sourceVersion = await this.versionRepository.findOne({
      where: {
        id: input.versionId,
        documentId: input.documentId
      }
    })
    if (!sourceVersion) {
      throw new NotFoundException('OfficeCLI version was not found.')
    }
    const buffer = await this.readVersionBuffer(scope, sourceVersion)
    return this.saveVersion(scope, document, buffer, {
      source: 'restore',
      command: 'restore',
      commandArgs: [],
      sourceVersionId: sourceVersion.id,
      changeSummary: normalizeOptional(input.changeSummary)
        ?? `Restored version ${sourceVersion.versionNumber}`
    })
  }

  async getFile(scope: OfficeCliScope, documentId: string) {
    const document = await this.requireDocument(scope, documentId)
    const version = await this.requireCurrentVersion(scope, document)
    const storageFilePath = document.workspaceFilePath ?? version.workspaceFilePath
    const reference = await this.workspaceFiles(scope).resolveRuntimeReference({
      ...resolveVersionWorkspaceScope(scope, version),
      source: OFFICE_CLI_WORKSPACE_FILES_RUNTIME_CAPABILITY,
      filePath: storageFilePath,
      workspacePath: storageFilePath,
      originalName: document.fileName,
      name: document.fileName,
      mimeType: document.mimeType,
      size: version.size
    })
    return {
      documentId,
      versionId: version.id,
      versionNumber: version.versionNumber,
      fileName: document.fileName,
      filePath: reference.filePath,
      workspacePath: reference.workspacePath,
      storageFilePath,
      fileUrl: document.workspaceFileUrl ?? version.workspaceFileUrl ?? '',
      mimeType: document.mimeType,
      extension: document.format,
      size: version.size,
      checksum: version.checksum,
      fileRef: reference
    }
  }

  async deleteDocument(scope: OfficeCliScope, documentId: string) {
    const document = await this.requireDocument(scope, documentId)
    const versions = await this.versionRepository.find({
      where: { documentId }
    })
    let workspaceFiles: OfficeCliWorkspaceFilesApi | undefined
    try {
      workspaceFiles = this.workspaceFiles(scope)
    } catch {
      // Database cleanup remains valid when storage cleanup is unavailable.
    }
    let deletedWorkspaceFiles = 0
    let failedWorkspaceFiles = 0
    if (workspaceFiles) {
      await Promise.all(versions.map(async (version) => {
        try {
          await workspaceFiles.deleteFile({
            ...resolveVersionWorkspaceScope(scope, version),
            filePath: version.workspaceFilePath
          })
          deletedWorkspaceFiles += 1
        } catch {
          failedWorkspaceFiles += 1
        }
      }))
      const currentFilePath = normalizeOptional(document.workspaceFilePath)
      if (
        currentFilePath
        && !versions.some((version) =>
          version.workspaceCatalog === document.workspaceCatalog
          && version.workspaceScopeId === document.workspaceScopeId
          && version.workspaceFilePath === currentFilePath)
      ) {
        try {
          await workspaceFiles.deleteFile({
            ...resolveDocumentWorkspaceScope(scope, document),
            filePath: currentFilePath
          })
          deletedWorkspaceFiles += 1
        } catch {
          failedWorkspaceFiles += 1
        }
      }
    } else {
      failedWorkspaceFiles = versions.length + (document.workspaceFilePath ? 1 : 0)
    }
    await this.versionRepository.delete({ documentId })
    await this.documentRepository.delete({
      ...scopedDocumentWhere(scope),
      id: documentId
    })
    return {
      documentId,
      deleted: true,
      deletedVersions: versions.length,
      deletedWorkspaceFiles,
      workspaceFilesDeleted: failedWorkspaceFiles === 0,
      ...(failedWorkspaceFiles ? { failedWorkspaceFiles } : {})
    }
  }

  async help(args: string[] = []) {
    return compactExecution(await this.runtime.executeHelp(args))
  }

  async loadSkill(name: OfficeCliGuidanceSkill) {
    const result = await this.runtime.loadSkill(name)
    return {
      name,
      guidance: result.stdout,
      warnings: result.stderr || undefined,
      durationMs: result.durationMs
    }
  }

  async applyWordDesign(scope: OfficeCliScope, input: ApplyOfficeCliWordDesignInput) {
    const document = await this.requireDocument(scope, input.documentId)
    if (document.format !== 'docx') {
      throw new BadRequestException('Professional Word design can only be applied to DOCX documents.')
    }
    assertExpectedVersion(document, input.expectedVersionNumber)
    const currentVersion = await this.requireCurrentVersion(scope, document)
    const buffer = await this.readVersionBuffer(scope, currentVersion)
    const designed = await this.applyWordDesignToBuffer(buffer, input)
    const saved = await this.saveVersion(scope, document, designed.buffer, {
      source: 'agent',
      command: 'apply-word-design',
      commandArgs: [
        `includeTableOfContents=${input.includeTableOfContents === true}`,
        `bodyFont=${normalizeOptional(input.bodyFont) ?? 'Arial'}`,
        `eastAsiaFont=${normalizeOptional(input.eastAsiaFont) ?? '等线'}`,
        `accentColor=${normalizeWordAccentColor(input.accentColor)}`
      ],
      sourceVersionId: currentVersion.id,
      changeSummary: normalizeOptional(input.changeSummary) ?? 'Applied professional Word styles and structure'
    })
    return {
      ...saved,
      design: {
        styles: designed.styles,
        remappedParagraphs: designed.remappedParagraphs,
        tableOfContents: designed.tableOfContents,
        validation: designed.validation,
        warnings: designed.warnings
      }
    }
  }

  async prepareAssistantPrompt(scope: OfficeCliScope, documentId: string, instruction?: string | null) {
    const document = await this.requireDocument(scope, documentId)
    return {
      documentId,
      versionNumber: document.currentVersionNumber,
      prompt: [
        `Use OfficeCLI document ${documentId} (${document.fileName}).`,
        `Current version: ${document.currentVersionNumber ?? 0}.`,
        normalizeOptional(instruction) ?? 'Inspect the document before making a narrow, reviewable change.',
        'Use officecli_read_document or a read command first. Pass expectedVersionNumber for every write.'
      ].join('\n')
    }
  }

  private async getSelectedDocumentData(scope: OfficeCliScope, documentId: string) {
    const document = await this.requireDocument(scope, documentId)
    if (document.status !== 'active' || !document.currentVersionId) {
      // Failed imports can leave a draft row behind after a process restart.
      // Do not turn that row into a preview error during a normal refresh.
      return undefined
    }
    const version = await this.requireCurrentVersion(scope, document)
    const buffer = await this.readVersionBuffer(scope, version)
    let preview: { html?: string; error?: string; generatedAt?: string }

    try {
      const html = await this.renderPreview(version, buffer, document.format)
      if (Buffer.byteLength(html, 'utf8') > MAX_PREVIEW_HTML_BYTES) {
        throw new Error(`Preview HTML exceeded ${MAX_PREVIEW_HTML_BYTES} bytes.`)
      }
      preview = {
        html,
        generatedAt: new Date().toISOString()
      }
    } catch (error) {
      preview = { error: formatPreviewError(error) }
    }

    return {
      document,
      version,
      preview,
      file: await this.getFile(scope, documentId)
    }
  }

  private renderPreview(version: OfficeCliVersion, buffer: Buffer, format: OfficeCliDocumentFormat) {
    const cacheKey = `${version.id ?? 'unknown'}:${version.checksum}`
    const cached = this.previewCache.get(cacheKey)
    if (cached) return cached
    const rendering = this.runtime.renderHtml(buffer, format)
    this.previewCache.set(cacheKey, rendering)
    rendering.catch(() => {
      if (this.previewCache.get(cacheKey) === rendering) {
        this.previewCache.delete(cacheKey)
      }
    })
    while (this.previewCache.size > 20) {
      const oldestKey = this.previewCache.keys().next().value
      if (typeof oldestKey !== 'string') break
      this.previewCache.delete(oldestKey)
    }
    return rendering
  }

  private async applyWordDesignToBuffer(
    sourceBuffer: Buffer,
    input: Pick<
      ApplyOfficeCliWordDesignInput,
      'includeTableOfContents' | 'bodyFont' | 'eastAsiaFont' | 'accentColor'
    >
  ) {
    const bodyFont = normalizeOptional(input.bodyFont) ?? 'Arial'
    const eastAsiaFont = normalizeOptional(input.eastAsiaFont) ?? '等线'
    const accentColor = normalizeWordAccentColor(input.accentColor)
    let buffer = sourceBuffer
    const stylesResult = await this.runtime.executeDocumentCommand({
      buffer,
      format: 'docx',
      command: 'get',
      args: ['/styles', '--depth', '1']
    })
    const existingStyleIds = new Set(extractStyleIds(stylesResult.json))
    const styles = buildProfessionalWordStyles(bodyFont, eastAsiaFont, accentColor)
    const styleCommands = styles.flatMap((style) => [
      ...(existingStyleIds.has(style.id)
        ? [{ command: 'remove', path: `/styles/${style.id}` }]
        : []),
      {
        command: 'add',
        parent: '/styles',
        type: 'style',
        props: {
          id: style.id,
          name: style.name,
          type: 'paragraph',
          ...style.properties
        }
      }
    ])
    const styled = await this.runtime.executeDocumentCommand({
      buffer,
      format: 'docx',
      command: 'batch',
      args: ['--stop-on-error'],
      stdin: JSON.stringify(styleCommands)
    })
    buffer = styled.fileBuffer

    let remappedParagraphs = 0
    const remapCommands: Array<{
      command: 'set'
      path: string
      props: { style: string }
    }> = []
    for (const [legacyStyle, canonicalStyle] of [
      ['Heading 1', 'Heading1'],
      ['Heading 2', 'Heading2'],
      ['Heading 3', 'Heading3']
    ] as const) {
      const query = await this.runtime.executeDocumentCommand({
        buffer,
        format: 'docx',
        command: 'query',
        args: [`paragraph[style="${legacyStyle}"]`]
      })
      for (const path of extractResultPaths(query.json)) {
        remapCommands.push({
          command: 'set',
          path,
          props: { style: canonicalStyle }
        })
        remappedParagraphs += 1
      }
    }
    if (remapCommands.length) {
      const remapped = await this.runtime.executeDocumentCommand({
        buffer,
        format: 'docx',
        command: 'batch',
        args: ['--stop-on-error'],
        stdin: JSON.stringify(remapCommands)
      })
      buffer = remapped.fileBuffer
    }

    let tableOfContents: 'preserved' | 'created' | 'not_requested' =
      input.includeTableOfContents === true ? 'preserved' : 'not_requested'
    const warnings: string[] = []
    if (input.includeTableOfContents === true) {
      const tocQuery = await this.runtime.executeDocumentCommand({
        buffer,
        format: 'docx',
        command: 'query',
        args: ['toc']
      })
      if (extractResultPaths(tocQuery.json).length === 0) {
        const body = await this.runtime.executeDocumentCommand({
          buffer,
          format: 'docx',
          command: 'get',
          args: ['/body', '--depth', '1']
        })
        const firstParagraphPath = extractFirstParagraphPath(body.json)
        const added = await this.runtime.executeDocumentCommand({
          buffer,
          format: 'docx',
          command: 'add',
          args: [
            '/body',
            '--type',
            'toc',
            '--prop',
            'levels=1-3',
            '--prop',
            'title=目录',
            '--prop',
            'hyperlinks=true',
            '--prop',
            'pageNumbers=true'
          ]
        })
        buffer = added.fileBuffer
        tableOfContents = 'created'
        if (firstParagraphPath) {
          const moved = await this.runtime.executeDocumentCommand({
            buffer,
            format: 'docx',
            command: 'move',
            args: ['/toc[1]', '--after', firstParagraphPath]
          })
          buffer = moved.fileBuffer
        }
      }
      try {
        const settings = await this.runtime.executeDocumentCommand({
          buffer,
          format: 'docx',
          command: 'raw',
          args: ['/settings']
        })
        if (!containsWordUpdateFieldsSetting(settings.json, settings.stdout)) {
          const updateFields = await this.runtime.executeDocumentCommand({
            buffer,
            format: 'docx',
            command: 'raw-set',
            args: [
              '/settings',
              '--xpath',
              '/w:settings/w:compat',
              '--action',
              'insertbefore',
              '--xml',
              '<w:updateFields w:val="true"/>'
            ]
          })
          buffer = updateFields.fileBuffer
        }
      } catch (error) {
        warnings.push(
          `目录字段已创建，但未能设置“打开时更新目录”；请在 Word/WPS 中手动更新目录。${getErrorMessage(error)}`
        )
      }
    }

    const validationResult = await this.runtime.executeDocumentCommand({
      buffer,
      format: 'docx',
      command: 'validate',
      args: []
    })
    return {
      buffer: validationResult.fileBuffer,
      styles: styles.map((style) => style.id),
      remappedParagraphs,
      tableOfContents,
      warnings,
      validation: compactExecution(validationResult)
    }
  }

  private async saveVersion(
    scope: OfficeCliScope,
    document: OfficeCliDocument,
    buffer: Buffer,
    metadata: {
      source: OfficeCliVersionSource
      command?: string
      commandArgs?: string[]
      sourceVersionId?: string
      changeSummary?: string | null
    }
  ) {
    validateOfficeBuffer(buffer)
    const documentId = requireId(document.id, 'OfficeCLI document id is required.')
    const sourceVersionId = document.currentVersionId ?? null
    let currentDocument = await this.requireDocument(scope, documentId)
    if ((currentDocument.currentVersionId ?? null) !== sourceVersionId) {
      throw new ConflictException(
        `OfficeCLI document changed before the new version could be written. Current version is ${currentDocument.currentVersionNumber ?? 0}.`
      )
    }
    const nextVersionNumber = (currentDocument.currentVersionNumber ?? 0) + 1
    const checksum = sha256(buffer)
    const workspaceScope = resolveWorkspaceScope(scope)
    const workspaceFiles = this.workspaceFiles(scope)
    const versionFileName = `v${String(nextVersionNumber).padStart(6, '0')}-${checksum.slice(0, 12)}.${document.format}`
    const versionUpload = await workspaceFiles.writeRuntimeBuffer({
      ...workspaceScope,
      buffer,
      originalName: currentDocument.fileName,
      mimeType: currentDocument.mimeType,
      size: buffer.byteLength,
      folder: officeCliVersionFolder(documentId),
      fileName: versionFileName,
      metadata: {
        documentType: 'office-cli-version',
        documentId,
        versionNumber: nextVersionNumber,
        format: currentDocument.format,
        source: metadata.source,
        command: metadata.command
      }
    })
    let currentUpload: Awaited<ReturnType<OfficeCliWorkspaceFilesApi['writeRuntimeBuffer']>>
    try {
      currentUpload = await workspaceFiles.writeRuntimeBuffer({
        ...workspaceScope,
        buffer,
        originalName: currentDocument.fileName,
        mimeType: currentDocument.mimeType,
        size: buffer.byteLength,
        folder: officeCliDocumentFolder(documentId),
        fileName: currentDocument.fileName,
        metadata: {
          documentType: 'office-cli-current',
          documentId,
          versionNumber: nextVersionNumber,
          format: currentDocument.format,
          checksum
        }
      })
    } catch (error) {
      // The deterministic archive path may already belong to a concurrent writer.
      // Leave cleanup to a reference-aware retention/reconciliation pass.
      throw error
    }
    let persistedVersion: OfficeCliVersion | null = null
    try {
      currentDocument = await this.requireDocument(scope, documentId)
      if ((currentDocument.currentVersionId ?? null) !== sourceVersionId) {
        throw new ConflictException(
          `OfficeCLI document changed while the new version was being written. Current version is ${currentDocument.currentVersionNumber ?? 0}.`
        )
      }
      const version = await this.versionRepository.save(
        this.versionRepository.create({
          ...scopedCreate(scope),
          documentId,
          versionNumber: nextVersionNumber,
          source: metadata.source,
          workspaceFilePath: versionUpload.filePath,
          workspaceFileUrl: normalizeOptional(versionUpload.fileUrl) ?? normalizeOptional(versionUpload.url),
          workspaceCatalog: workspaceScope.catalog,
          workspaceScopeId: workspaceScope.scopeId,
          fileName: currentDocument.fileName,
          mimeType: currentDocument.mimeType,
          size: buffer.byteLength,
          checksum,
          command: normalizeOptional(metadata.command),
          commandArgs: metadata.commandArgs ?? [],
          sourceVersionId: normalizeOptional(metadata.sourceVersionId),
          changeSummary: normalizeOptional(metadata.changeSummary),
          createdById: normalizeOptional(scope.userId)
        })
      )
      persistedVersion = version
      const savedDocument = await this.documentRepository.save({
        ...currentDocument,
        status: 'active',
        size: buffer.byteLength,
        workspaceFilePath: currentUpload.filePath,
        workspaceFileUrl: normalizeOptional(currentUpload.fileUrl) ?? normalizeOptional(currentUpload.url),
        workspaceCatalog: workspaceScope.catalog,
        workspaceScopeId: workspaceScope.scopeId,
        currentVersionId: version.id,
        currentVersionNumber: nextVersionNumber,
        lastCommand: normalizeOptional(metadata.command),
        lastEditedById: normalizeOptional(scope.userId),
        lastEditedAt: new Date()
      })
      await this.pruneOldVersions(scope, documentId)
      return {
        document: savedDocument,
        version,
        file: {
          fileName: currentDocument.fileName,
          filePath: currentUpload.filePath,
          workspacePath: currentUpload.workspacePath,
          storageFilePath: currentUpload.filePath,
          fileUrl: currentUpload.fileUrl ?? currentUpload.url ?? '',
          mimeType: currentDocument.mimeType,
          extension: currentDocument.format,
          size: version.size,
          fileRef: currentUpload.reference
        }
      }
    } catch (error) {
      if (persistedVersion?.id) {
        try {
          await this.versionRepository.delete({
            id: persistedVersion.id,
            documentId
          })
        } catch {
          // Preserve the primary error; cleanup remains best effort.
        }
      }
      // Version paths are deterministic by version number and checksum. A concurrent
      // writer may already have committed the same path, so deleting it here can
      // remove the successful writer's archive. Orphan cleanup must verify database
      // references before removing a version file.
      const priorCurrentPath = normalizeOptional(currentDocument.workspaceFilePath)
      if (!priorCurrentPath || priorCurrentPath !== currentUpload.filePath) {
        try {
          await workspaceFiles.deleteFile({
            ...workspaceScope,
            filePath: currentUpload.filePath
          })
        } catch {
          // Preserve the primary error; cleanup remains best effort.
        }
      }
      throw error
    }
  }

  private async pruneOldVersions(scope: OfficeCliScope, documentId: string) {
    const obsoleteVersions = await this.versionRepository.find({
      where: { documentId },
      order: { versionNumber: 'DESC' },
      skip: MAX_RETAINED_VERSIONS
    })
    if (!obsoleteVersions.length) return
    let workspaceFiles: OfficeCliWorkspaceFilesApi | undefined
    try {
      workspaceFiles = this.workspaceFiles(scope)
    } catch {
      // Retention cleanup is best effort and must not fail a successful document save.
    }
    if (!workspaceFiles) return
    for (const version of obsoleteVersions) {
      if (!version.id) continue
      try {
        await workspaceFiles.deleteFile({
          ...resolveVersionWorkspaceScope(scope, version),
          filePath: version.workspaceFilePath
        })
        await this.versionRepository.delete({
          id: version.id,
          documentId
        })
      } catch {
        // Retention cleanup is best effort and must not fail a successful document save.
      }
    }
  }

  private async requireDocument(scope: OfficeCliScope, documentId: string) {
    const normalizedId = normalizeRequired(documentId, 'OfficeCLI document id is required.')
    const document = await this.documentRepository.findOne({
      where: {
        ...scopedDocumentWhere(scope),
        id: normalizedId
      }
    })
    if (!document || document.status === 'archived') {
      throw new NotFoundException('OfficeCLI document was not found.')
    }
    return document
  }

  private async requireCurrentVersion(scope: OfficeCliScope, document: OfficeCliDocument) {
    if (!document.currentVersionId) {
      throw new BadRequestException('OfficeCLI document has no current file version.')
    }
    const version = await this.versionRepository.findOne({
      where: {
        id: document.currentVersionId,
        documentId: requireId(document.id, 'OfficeCLI document id is required.')
      }
    })
    if (!version) {
      throw new NotFoundException('OfficeCLI current file version was not found.')
    }
    return version
  }

  private async readVersionBuffer(scope: OfficeCliScope, version: OfficeCliVersion) {
    const file = await this.workspaceFiles(scope).readBuffer({
      ...resolveVersionWorkspaceScope(scope, version),
      filePath: version.workspaceFilePath
    })
    validateOfficeBuffer(file.buffer)
    if (sha256(file.buffer) !== version.checksum) {
      throw new ConflictException('OfficeCLI workspace file checksum does not match the recorded version.')
    }
    return file.buffer
  }

  private workspaceFiles(scope: OfficeCliScope) {
    if (scope.runtimeWorkspaceFiles) {
      return scope.runtimeWorkspaceFiles
    }
    const scopedCapabilities = this.runtimeService?.createScopedApi({
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      userId: scope.userId,
      workspaceId: scope.projectId ? null : scope.workspaceId,
      projectId: scope.projectId,
      xpertId: scope.assistantId,
      conversationId: scope.conversationId,
      catalog: scope.workspaceFiles?.catalog,
      scopeId: scope.workspaceFiles?.scopeId,
      isolateByUser: scope.workspaceFiles?.isolateByUser
    }).capabilities
    const files = scopedCapabilities?.get<OfficeCliWorkspaceFilesApi>(OFFICE_CLI_WORKSPACE_FILES_RUNTIME_CAPABILITY)
      ?? (this.runtimeService
        ? undefined
        : this.runtimeCapabilities?.get<OfficeCliWorkspaceFilesApi>(OFFICE_CLI_WORKSPACE_FILES_RUNTIME_CAPABILITY))
    if (!files) {
      throw new BadRequestException('Xpert workspace file runtime capability is required for OfficeCLI storage.')
    }
    return files
  }
}

type ProfessionalWordStyle = {
  id: string
  name: string
  properties: Record<string, string>
}

function buildProfessionalWordStyles(
  bodyFont: string,
  eastAsiaFont: string,
  accentColor: string
): ProfessionalWordStyle[] {
  const fonts = {
    'font.latin': bodyFont,
    'font.ea': eastAsiaFont
  }
  return [
    {
      id: 'Normal',
      name: 'Normal',
      properties: {
        next: 'Normal',
        ...fonts,
        size: '11pt',
        lineSpacing: '1.5x',
        spaceAfter: '6pt',
        widowControl: 'true'
      }
    },
    {
      id: 'Title',
      name: 'Title',
      properties: {
        basedOn: 'Normal',
        next: 'Normal',
        ...fonts,
        size: '22pt',
        bold: 'true',
        align: 'center',
        color: accentColor,
        spaceBefore: '12pt',
        spaceAfter: '18pt',
        keepNext: 'true'
      }
    },
    {
      id: 'Subtitle',
      name: 'Subtitle',
      properties: {
        basedOn: 'Normal',
        next: 'Normal',
        ...fonts,
        size: '13pt',
        align: 'center',
        color: '666666',
        spaceAfter: '14pt',
        keepNext: 'true'
      }
    },
    {
      id: 'Heading1',
      name: 'Heading 1',
      properties: {
        basedOn: 'Normal',
        next: 'Normal',
        ...fonts,
        size: '18pt',
        bold: 'true',
        color: accentColor,
        outlineLvl: '0',
        spaceBefore: '14pt',
        spaceAfter: '8pt',
        keepNext: 'true',
        keepLines: 'true'
      }
    },
    {
      id: 'Heading2',
      name: 'Heading 2',
      properties: {
        basedOn: 'Normal',
        next: 'Normal',
        ...fonts,
        size: '14pt',
        bold: 'true',
        color: accentColor,
        outlineLvl: '1',
        spaceBefore: '12pt',
        spaceAfter: '6pt',
        keepNext: 'true',
        keepLines: 'true'
      }
    },
    {
      id: 'Heading3',
      name: 'Heading 3',
      properties: {
        basedOn: 'Normal',
        next: 'Normal',
        ...fonts,
        size: '12pt',
        bold: 'true',
        color: accentColor,
        outlineLvl: '2',
        spaceBefore: '10pt',
        spaceAfter: '4pt',
        keepNext: 'true',
        keepLines: 'true'
      }
    },
    {
      id: 'TOCHeading',
      name: 'TOC Heading',
      properties: {
        basedOn: 'Heading1',
        next: 'Normal',
        ...fonts,
        size: '16pt',
        bold: 'true',
        color: accentColor,
        spaceBefore: '12pt',
        spaceAfter: '10pt',
        keepNext: 'true'
      }
    },
    {
      id: 'TOC1',
      name: 'toc 1',
      properties: {
        basedOn: 'Normal',
        next: 'Normal',
        ...fonts,
        size: '11pt',
        spaceAfter: '3pt'
      }
    },
    {
      id: 'TOC2',
      name: 'toc 2',
      properties: {
        basedOn: 'Normal',
        next: 'Normal',
        ...fonts,
        size: '10.5pt',
        leftIndent: '18pt',
        spaceAfter: '2pt'
      }
    },
    {
      id: 'TOC3',
      name: 'toc 3',
      properties: {
        basedOn: 'Normal',
        next: 'Normal',
        ...fonts,
        size: '10pt',
        leftIndent: '36pt',
        spaceAfter: '2pt'
      }
    }
  ]
}

function extractStyleIds(value: unknown) {
  const styleIds: string[] = []
  for (const result of extractOfficeCliResults(value)) {
    const children = Array.isArray(result['children']) ? result['children'] : []
    for (const child of children) {
      if (!isRecord(child) || !isRecord(child['format'])) continue
      const styleId = child['format']['styleId']
      if (typeof styleId === 'string' && styleId) styleIds.push(styleId)
    }
  }
  return styleIds
}

function extractResultPaths(value: unknown) {
  return extractOfficeCliResults(value)
    .map((item) => item['path'])
    .filter((path): path is string => typeof path === 'string' && Boolean(path))
}

function extractFirstParagraphPath(value: unknown) {
  for (const result of extractOfficeCliResults(value)) {
    const children = Array.isArray(result['children']) ? result['children'] : []
    for (const child of children) {
      if (
        isRecord(child)
        && child['type'] === 'paragraph'
        && typeof child['path'] === 'string'
      ) {
        return child['path']
      }
    }
  }
  return undefined
}

function extractOfficeCliResults(value: unknown): Record<string, unknown>[] {
  if (!isRecord(value)) return []
  const data = isRecord(value['data']) ? value['data'] : value
  const results = data['results']
  return Array.isArray(results) ? results.filter(isRecord) : []
}

function containsWordUpdateFieldsSetting(json: unknown, stdout: string) {
  return `${JSON.stringify(json ?? '')}\n${stdout}`.includes('updateFields')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function normalizeWordAccentColor(value: string | null | undefined) {
  const normalized = normalizeOptional(value)?.replace(/^#/, '') ?? '1F4E79'
  if (!/^[0-9A-Fa-f]{6}$/.test(normalized)) {
    throw new BadRequestException('Word accentColor must be a six-digit hexadecimal color.')
  }
  return normalized.toUpperCase()
}

function scopedCreate(scope: OfficeCliScope) {
  const projectId = normalizeOptional(scope.projectId)
  return {
    tenantId: normalizeOptional(scope.tenantId),
    organizationId: normalizeOptional(scope.organizationId),
    workspaceId: projectId ? null : normalizeOptional(scope.workspaceId),
    projectId
  }
}

function scopedDocumentWhere(scope: OfficeCliScope): FindOptionsWhere<OfficeCliDocument> {
  const projectId = normalizeOptional(scope.projectId)
  const assistantId = normalizeOptional(scope.assistantId)
  return {
    tenantId: normalizeOptional(scope.tenantId) ?? IsNull(),
    organizationId: normalizeOptional(scope.organizationId) ?? IsNull(),
    workspaceId: projectId ? IsNull() : normalizeOptional(scope.workspaceId) ?? IsNull(),
    projectId: projectId ?? IsNull(),
    ...(projectId
      ? {}
      : {
          assistantId: assistantId ?? IsNull(),
          ...(scope.workspaceFiles?.isolateByUser
            ? { createdById: normalizeOptional(scope.userId) ?? IsNull() }
            : {})
        })
  }
}

function resolveWorkspaceScope(scope: OfficeCliScope): OfficeCliWorkspaceFileScope {
  if (scope.workspaceFiles) {
    return { ...scope.workspaceFiles }
  }
  const projectId = normalizeOptional(scope.projectId)
  if (projectId) {
    return {
      tenantId: normalizeOptional(scope.tenantId),
      userId: normalizeOptional(scope.userId),
      catalog: 'projects',
      scopeId: projectId,
      projectId,
      isolateByUser: false
    }
  }
  const xpertId = normalizeOptional(scope.assistantId) ?? normalizeOptional(scope.workspaceId)
  if (!xpertId) {
    throw new BadRequestException('OfficeCLI requires an Agent or project workspace scope.')
  }
  return {
    tenantId: normalizeOptional(scope.tenantId),
    userId: normalizeOptional(scope.userId),
    catalog: 'xperts',
    scopeId: xpertId,
    xpertId,
    isolateByUser: false
  }
}

function resolveVersionWorkspaceScope(scope: OfficeCliScope, version: OfficeCliVersion): OfficeCliWorkspaceFileScope {
  if (version.workspaceCatalog === 'projects') {
    return {
      tenantId: normalizeOptional(scope.tenantId),
      userId: normalizeOptional(scope.userId),
      catalog: 'projects',
      scopeId: version.workspaceScopeId,
      projectId: version.workspaceScopeId,
      isolateByUser: false
    }
  }
  if (version.workspaceCatalog === 'user-xperts') {
    return {
      tenantId: normalizeOptional(scope.tenantId),
      userId: normalizeOptional(scope.userId),
      catalog: 'user-xperts',
      scopeId: version.workspaceScopeId,
      xpertId: version.workspaceScopeId,
      isolateByUser: true
    }
  }
  return {
    tenantId: normalizeOptional(scope.tenantId),
    userId: normalizeOptional(scope.userId),
    catalog: 'xperts',
    scopeId: version.workspaceScopeId,
    xpertId: version.workspaceScopeId,
    isolateByUser: false
  }
}

function resolveDocumentWorkspaceScope(
  scope: OfficeCliScope,
  document: OfficeCliDocument
): OfficeCliWorkspaceFileScope {
  if (document.workspaceCatalog === 'projects' && document.workspaceScopeId) {
    return {
      tenantId: normalizeOptional(scope.tenantId),
      userId: normalizeOptional(scope.userId),
      catalog: 'projects',
      scopeId: document.workspaceScopeId,
      projectId: document.workspaceScopeId,
      isolateByUser: false
    }
  }
  if (document.workspaceCatalog === 'user-xperts' && document.workspaceScopeId) {
    return {
      tenantId: normalizeOptional(scope.tenantId),
      userId: normalizeOptional(scope.userId),
      catalog: 'user-xperts',
      scopeId: document.workspaceScopeId,
      xpertId: document.workspaceScopeId,
      isolateByUser: true
    }
  }
  if (document.workspaceCatalog === 'xperts' && document.workspaceScopeId) {
    return {
      tenantId: normalizeOptional(scope.tenantId),
      userId: normalizeOptional(scope.userId),
      catalog: 'xperts',
      scopeId: document.workspaceScopeId,
      xpertId: document.workspaceScopeId,
      isolateByUser: false
    }
  }
  return resolveWorkspaceScope(scope)
}

function officeCliDocumentFolder(documentId: string) {
  return `${OFFICE_CLI_WORKSPACE_DOCUMENTS_FOLDER}/${normalizePathSegment(documentId)}`
}

function officeCliVersionFolder(documentId: string) {
  return `${officeCliDocumentFolder(documentId)}/.versions`
}

function assertExpectedVersion(document: OfficeCliDocument, expected?: number | null) {
  if (expected !== undefined && expected !== null && expected !== document.currentVersionNumber) {
    throw new ConflictException(
      `OfficeCLI document version conflict: expected ${expected}, current ${document.currentVersionNumber ?? 0}.`
    )
  }
}

function validateOfficeBuffer(buffer: Buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.byteLength === 0) {
    throw new BadRequestException('OfficeCLI file is empty.')
  }
  if (buffer.byteLength > MAX_OFFICE_FILE_BYTES) {
    throw new BadRequestException(`OfficeCLI files must not exceed ${MAX_OFFICE_FILE_BYTES} bytes.`)
  }
}

export function formatPreviewError(error: unknown) {
  const message = getErrorMessage(error)
  if (
    /unable to prepare officecli|download attempt|download timed out|fetch failed|github releases/i.test(message)
  ) {
    return 'OfficeCLI 运行时尚未准备完成。请确认 Xpert 服务端可以访问 GitHub Releases，或配置 OFFICECLI_BINARY_PATH；初始化成功后，后续打开会直接复用本地运行时。'
  }
  if (/timed out|timeout/i.test(message)) {
    return 'OfficeCLI 生成预览超时。原文件不会丢失，请稍后点击“刷新”重试。'
  }
  return `OfficeCLI 预览生成失败：${message}`
}

function compactExecution(result: {
  command: string
  args: string[]
  exitCode: number
  stdout: string
  stderr: string
  json?: unknown
  durationMs: number
}) {
  return {
    command: result.command,
    args: result.args,
    exitCode: result.exitCode,
    output: result.json ?? result.stdout,
    warnings: result.stderr || undefined,
    durationMs: result.durationMs
  }
}

function sha256(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function safeFileStem(value: string) {
  return value
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'office-document'
}

function normalizePathSegment(value: string) {
  const normalized = value.trim()
  if (!normalized || !/^[A-Za-z0-9._-]+$/.test(normalized)) {
    throw new BadRequestException('Invalid OfficeCLI workspace path segment.')
  }
  return normalized
}

function normalizeFileName(fileName: string, format: OfficeCliDocumentFormat) {
  return `${safeFileStem(stripOfficeExtension(fileName))}.${format}`
}

function stripOfficeExtension(fileName: string) {
  return fileName.replace(/\.(docx|xlsx|pptx)$/i, '').trim() || 'Office document'
}

function normalizeRequired(value: string | null | undefined, message: string) {
  const normalized = normalizeOptional(value)
  if (!normalized) {
    throw new BadRequestException(message)
  }
  return normalized
}

function normalizeOptional(value: string | null | undefined) {
  const normalized = value?.trim()
  return normalized || undefined
}

function requireId(value: string | undefined, message: string) {
  if (!value) {
    throw new Error(message)
  }
  return value
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
