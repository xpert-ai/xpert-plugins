import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { LucidchartActionLog, LucidchartDocument, LucidchartDocumentVersion } from './entities/index.js'
import type {
  CreateLucidchartDocumentInput,
  LucidchartActionType,
  LucidchartActorType,
  LucidchartDocumentContentInput,
  LucidchartScope,
  LucidchartVersionSource,
  PatchLucidchartStandardImportInput,
  RegisterLucidchartExternalDocumentInput,
  ReportLucidchartFailureInput,
  SaveLucidchartMermaidDraftInput,
  SaveLucidchartStandardImportVersionInput,
  SearchLucidchartDocumentsInput,
  UpdateLucidchartDocumentMetadataInput,
  UpdateLucidchartDocumentStatusInput
} from './types.js'

type ScopedEntity = {
  tenantId?: string
  organizationId?: string | null
  workspaceId?: string | null
  projectId?: string | null
}

@Injectable()
export class LucidchartService {
  constructor(
    @InjectRepository(LucidchartDocument)
    private readonly documentRepository: Repository<LucidchartDocument>,
    @InjectRepository(LucidchartDocumentVersion)
    private readonly versionRepository: Repository<LucidchartDocumentVersion>,
    @InjectRepository(LucidchartActionLog)
    private readonly logRepository: Repository<LucidchartActionLog>
  ) {}

  async createDocument(scope: LucidchartScope, input: CreateLucidchartDocumentInput) {
    const title = normalizeRequired(input.title, 'Lucidchart document title is required.')
    const document = await this.documentRepository.save(
      this.documentRepository.create({
        ...scopedCreate(scope),
        assistantId: scope.assistantId ?? null,
        conversationId: scope.conversationId ?? null,
        createdById: scope.userId ?? null,
        title,
        description: normalizeOptional(input.description),
        kind: input.kind ?? 'diagram',
        status: 'draft',
        tags: normalizeStringArray(input.tags),
        source: normalizeOptional(input.source),
        product: input.product ?? 'lucidchart',
        lucidDocumentId: normalizeOptional(input.lucidDocumentId),
        lucidDocumentUrl: normalizeOptional(input.lucidDocumentUrl),
        embedUrl: normalizeOptional(input.embedUrl),
        embedId: normalizeOptional(input.embedId),
        previewUrl: normalizeOptional(input.previewUrl),
        currentVersionNumber: 0,
        lastEditedById: scope.userId ?? null,
        lastEditedAt: new Date()
      })
    )

    await this.writeLog(scope, {
      documentId: document.id,
      action: 'document_created',
      actorType: scope.assistantId ? 'agent' : 'user',
      message: `Lucidchart document "${title}" was created.`,
      snapshot: {
        title,
        kind: document.kind,
        source: document.source,
        lucidDocumentUrl: document.lucidDocumentUrl
      }
    })

    if (hasVersionContent(input)) {
      await this.createVersion(scope, document, {
        ...input,
        sourceType: resolveInitialSourceType(input),
        changeSummary: normalizeOptional(input.changeSummary) ?? 'Initial Lucidchart document draft'
      })
    }

    return this.getDocument(scope, document.id as string)
  }

  async saveStandardImportVersion(scope: LucidchartScope, input: SaveLucidchartStandardImportVersionInput) {
    const document = await this.requireDocument(scope, input.documentId)
    const version = await this.createVersion(scope, document, {
      ...input,
      sourceType: input.sourceType ?? 'agent_standard_import',
      changeSummary: normalizeOptional(input.changeSummary)
    })

    return {
      success: true,
      message: 'Lucidchart Standard Import version was saved.',
      document: await this.getDocument(scope, document.id as string),
      version
    }
  }

  async patchStandardImport(scope: LucidchartScope, input: PatchLucidchartStandardImportInput) {
    const document = await this.requireDocument(scope, input.documentId)
    const currentVersion = await this.getCurrentVersion(scope, document)
    const currentStandardImport = normalizeRecord(currentVersion?.standardImport)
    const replacement = input.standardImport === undefined ? undefined : normalizeRecord(input.standardImport)
    const patch = normalizeRecord(input.standardImportPatch)
    const nextStandardImport =
      replacement ??
      (Object.keys(patch).length > 0
        ? input.merge === false
          ? patch
          : shallowMerge(currentStandardImport, patch)
        : currentStandardImport)

    const version = await this.createVersion(scope, document, {
      standardImport: nextStandardImport,
      mermaidSource:
        input.mermaidSource === undefined
          ? normalizeNullableText(currentVersion?.mermaidSource)
          : normalizeNullableText(input.mermaidSource),
      lucidDocumentId:
        input.lucidDocumentId === undefined
          ? normalizeNullableText(currentVersion?.lucidDocumentId)
          : normalizeNullableText(input.lucidDocumentId),
      lucidDocumentUrl:
        input.lucidDocumentUrl === undefined
          ? normalizeNullableText(currentVersion?.lucidDocumentUrl)
          : normalizeNullableText(input.lucidDocumentUrl),
      embedUrl:
        input.embedUrl === undefined ? normalizeNullableText(currentVersion?.embedUrl) : normalizeNullableText(input.embedUrl),
      embedId:
        input.embedId === undefined ? normalizeNullableText(currentVersion?.embedId) : normalizeNullableText(input.embedId),
      previewUrl:
        input.previewUrl === undefined ? normalizeNullableText(currentVersion?.previewUrl) : normalizeNullableText(input.previewUrl),
      product: input.product ?? currentVersion?.product ?? document.product ?? 'lucidchart',
      importFileName:
        input.importFileName === undefined
          ? normalizeNullableText(currentVersion?.importFileName)
          : normalizeNullableText(input.importFileName),
      sourceType: 'agent_patch',
      changeSummary: normalizeOptional(input.changeSummary) ?? 'Agent patched Standard Import draft'
    })

    await this.writeLog(scope, {
      documentId: document.id,
      versionId: version.id,
      action: 'standard_import_patched',
      actorType: 'agent',
      message: input.changeSummary,
      snapshot: {
        merge: input.merge !== false,
        patchedKeys: Object.keys(patch),
        replaced: Boolean(replacement)
      }
    })

    return {
      success: true,
      message: 'Lucidchart Standard Import patch was saved as a new version.',
      document: await this.getDocument(scope, document.id as string),
      version
    }
  }

  async saveMermaidDraft(scope: LucidchartScope, input: SaveLucidchartMermaidDraftInput) {
    const mermaidSource = normalizeRequired(input.mermaidSource, 'Mermaid source is required.')
    const document = input.documentId
      ? await this.requireDocument(scope, input.documentId)
      : (
          await this.createDocument(scope, {
            title: input.title ?? 'Untitled Lucidchart Mermaid Draft',
            description: input.description,
            kind: input.kind ?? 'flowchart',
            source: 'agent_mermaid'
          })
        ).item

    const version = await this.createVersion(scope, document, {
      mermaidSource,
      product: document.product ?? 'lucidchart',
      sourceType: 'agent_mermaid',
      changeSummary: normalizeOptional(input.changeSummary) ?? 'Mermaid draft'
    })

    await this.writeLog(scope, {
      documentId: document.id,
      versionId: version.id,
      action: 'mermaid_draft_saved',
      actorType: 'agent',
      message: input.changeSummary,
      snapshot: { mermaidSource }
    })

    return {
      success: true,
      message: 'Mermaid draft was saved for Lucidchart review.',
      document: await this.getDocument(scope, document.id as string),
      version
    }
  }

  async registerExternalDocument(scope: LucidchartScope, input: RegisterLucidchartExternalDocumentInput) {
    if (!input.lucidDocumentId && !input.lucidDocumentUrl && !input.embedUrl) {
      throw new BadRequestException('A Lucid document id, document URL, or embed URL is required.')
    }

    const document = input.documentId
      ? await this.requireDocument(scope, input.documentId)
      : (
          await this.createDocument(scope, {
            title: input.title ?? 'Untitled Lucidchart Document',
            description: input.description,
            kind: input.kind ?? 'diagram',
            source: 'external_lucid',
            lucidDocumentId: input.lucidDocumentId,
            lucidDocumentUrl: input.lucidDocumentUrl,
            embedUrl: input.embedUrl,
            embedId: input.embedId,
            previewUrl: input.previewUrl,
            product: input.product ?? 'lucidchart'
          })
        ).item

    const version = await this.createVersion(scope, document, {
      lucidDocumentId: input.lucidDocumentId,
      lucidDocumentUrl: input.lucidDocumentUrl,
      embedUrl: input.embedUrl,
      embedId: input.embedId,
      previewUrl: input.previewUrl,
      product: input.product ?? document.product ?? 'lucidchart',
      sourceType: 'external_lucid',
      changeSummary: normalizeOptional(input.changeSummary) ?? 'Registered external Lucid document'
    })

    await this.writeLog(scope, {
      documentId: document.id,
      versionId: version.id,
      action: 'external_document_registered',
      actorType: scope.assistantId ? 'agent' : 'user',
      message: input.changeSummary,
      snapshot: {
        lucidDocumentId: version.lucidDocumentId,
        lucidDocumentUrl: version.lucidDocumentUrl,
        embedUrl: version.embedUrl
      }
    })

    return {
      success: true,
      message: 'External Lucidchart document was registered.',
      document: await this.getDocument(scope, document.id as string),
      version
    }
  }

  async searchDocuments(scope: LucidchartScope, query: SearchLucidchartDocumentsInput = {}) {
    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.max(1, Math.min(query.pageSize ?? 20, 100))
    const search = query.search?.trim().toLowerCase() ?? ''
    const documents = await this.documentRepository.find({
      where: scopedWhere(scope),
      order: {
        updatedAt: 'DESC'
      }
    })
    const filtered = documents.filter((document) => {
      if (query.status && document.status !== query.status) {
        return false
      }
      if (query.kind && document.kind !== query.kind) {
        return false
      }
      if (!search) {
        return true
      }
      return [
        document.title,
        document.description,
        document.kind,
        document.lucidDocumentId,
        document.lucidDocumentUrl,
        document.embedUrl,
        ...(document.tags ?? [])
      ]
        .filter(isString)
        .some((value) => value.toLowerCase().includes(search))
    })
    const start = (page - 1) * pageSize

    return {
      items: filtered.slice(start, start + pageSize),
      total: filtered.length,
      page,
      pageSize,
      search
    }
  }

  async getDocument(scope: LucidchartScope, documentId: string) {
    const document = await this.requireDocument(scope, documentId)
    const [versions, logs] = await Promise.all([
      this.versionRepository.find({
        where: scopedWhere(scope, { documentId }),
        order: {
          versionNumber: 'DESC'
        }
      }),
      this.logRepository.find({
        where: scopedWhere(scope, { documentId }),
        order: {
          createdAt: 'DESC'
        }
      })
    ])
    const currentVersion = versions.find((version) => version.id === document.currentVersionId) ?? versions[0] ?? null

    return {
      item: document,
      currentVersion,
      versions,
      logs,
      total: versions.length,
      summary: {
        versionCount: versions.length,
        currentVersionNumber: document.currentVersionNumber ?? currentVersion?.versionNumber ?? 0,
        hasStandardImport: versions.some((version) => Boolean(version.standardImport)),
        hasMermaidDraft: versions.some((version) => Boolean(version.mermaidSource)),
        hasExternalDocument: Boolean(document.lucidDocumentUrl || document.embedUrl || document.lucidDocumentId)
      }
    }
  }

  async getWorkbenchData(scope: LucidchartScope, query: SearchLucidchartDocumentsInput & { documentId?: string } = {}) {
    if (query.documentId) {
      return this.getDocument(scope, query.documentId)
    }
    const result = await this.searchDocuments(scope, query)
    return {
      ...result,
      summary: {
        page: result.page,
        pageSize: result.pageSize,
        search: result.search
      }
    }
  }

  async updateDocumentStatus(scope: LucidchartScope, input: UpdateLucidchartDocumentStatusInput) {
    const document = await this.requireDocument(scope, input.documentId)
    const updated = await this.documentRepository.save({
      ...document,
      status: input.status,
      lastEditedById: scope.userId ?? null,
      lastEditedAt: new Date()
    })

    await this.writeLog(scope, {
      documentId: document.id,
      versionId: document.currentVersionId,
      action: input.status === 'archived' ? 'document_archived' : 'status_updated',
      actorType: scope.assistantId ? 'agent' : 'user',
      message: input.reason ?? `Status updated to ${input.status}`,
      snapshot: { status: input.status }
    })

    return {
      success: true,
      message: 'Lucidchart document status was updated.',
      item: updated
    }
  }

  async updateDocumentMetadata(scope: LucidchartScope, input: UpdateLucidchartDocumentMetadataInput) {
    const document = await this.requireDocument(scope, input.documentId)
    const title = normalizeRequired(input.title, 'Lucidchart document title is required.')
    const updated = await this.documentRepository.save({
      ...document,
      title,
      description: normalizeNullableText(input.description),
      kind: input.kind ?? document.kind ?? 'diagram',
      lastEditedById: scope.userId ?? null,
      lastEditedAt: new Date()
    })

    await this.writeLog(scope, {
      documentId: document.id,
      versionId: document.currentVersionId,
      action: 'metadata_updated',
      actorType: 'user',
      message: normalizeOptional(input.changeSummary) ?? 'Lucidchart document metadata was updated.',
      snapshot: {
        title: updated.title,
        description: updated.description,
        kind: updated.kind
      }
    })

    return {
      success: true,
      message: 'Lucidchart document metadata was updated.',
      item: updated
    }
  }

  async restoreVersion(scope: LucidchartScope, documentId: string, versionId: string, changeSummary?: string) {
    const document = await this.requireDocument(scope, documentId)
    const version = await this.versionRepository.findOne({
      where: scopedWhere(scope, { id: versionId, documentId })
    })
    if (!version) {
      throw new NotFoundException('Lucidchart document version was not found.')
    }

    const restored = await this.createVersion(scope, document, {
      standardImport: normalizeRecord(version.standardImport),
      mermaidSource: normalizeNullableText(version.mermaidSource),
      lucidDocumentId: normalizeNullableText(version.lucidDocumentId),
      lucidDocumentUrl: normalizeNullableText(version.lucidDocumentUrl),
      embedUrl: normalizeNullableText(version.embedUrl),
      embedId: normalizeNullableText(version.embedId),
      previewUrl: normalizeNullableText(version.previewUrl),
      product: version.product ?? document.product ?? 'lucidchart',
      importFileName: normalizeNullableText(version.importFileName),
      sourceType: 'restore',
      changeSummary: normalizeOptional(changeSummary) ?? `Restored version ${version.versionNumber}`
    })

    await this.writeLog(scope, {
      documentId,
      versionId: restored.id,
      action: 'version_restored',
      actorType: 'user',
      message: changeSummary,
      snapshot: { restoredFromVersionId: versionId, restoredFromVersionNumber: version.versionNumber }
    })

    return {
      success: true,
      message: 'Lucidchart document version was restored.',
      document: await this.getDocument(scope, documentId),
      version: restored
    }
  }

  async reportFailure(scope: LucidchartScope, input: ReportLucidchartFailureInput) {
    const log = await this.writeLog(scope, {
      documentId: input.documentId,
      versionId: input.versionId,
      action: 'failure_reported',
      actorType: scope.assistantId ? 'agent' : 'system',
      message: input.operation,
      errorMessage: input.errorMessage,
      snapshot: {
        recoverable: input.recoverable,
        evidence: input.evidence
      }
    })

    return {
      success: true,
      message: 'Lucidchart failure was recorded.',
      log
    }
  }

  private async createVersion(
    scope: LucidchartScope,
    document: LucidchartDocument,
    input: LucidchartDocumentContentInput & {
      sourceType: LucidchartVersionSource
      changeSummary?: string
    }
  ) {
    const currentVersionNumber = document.currentVersionNumber ?? 0
    const versionNumber = currentVersionNumber + 1
    const version = await this.versionRepository.save(
      this.versionRepository.create({
        ...scopedCreate(scope),
        documentId: document.id as string,
        versionNumber,
        sourceType: input.sourceType,
        standardImport: normalizeRecord(input.standardImport),
        mermaidSource: normalizeNullableText(input.mermaidSource),
        product: input.product ?? document.product ?? 'lucidchart',
        lucidDocumentId: normalizeNullableText(input.lucidDocumentId),
        lucidDocumentUrl: normalizeNullableText(input.lucidDocumentUrl),
        embedUrl: normalizeNullableText(input.embedUrl),
        embedId: normalizeNullableText(input.embedId),
        previewUrl: normalizeNullableText(input.previewUrl),
        importFileName: normalizeNullableText(input.importFileName),
        changeSummary: normalizeOptional(input.changeSummary),
        createdById: scope.userId ?? null,
        assistantId: scope.assistantId ?? null,
        conversationId: scope.conversationId ?? null
      })
    )

    await this.documentRepository.save({
      ...document,
      ...contentToDocumentUpdates(input),
      product: input.product ?? document.product ?? 'lucidchart',
      currentVersionId: version.id,
      currentVersionNumber: version.versionNumber,
      lastEditedById: scope.userId ?? null,
      lastEditedAt: new Date()
    })

    await this.writeLog(scope, {
      documentId: document.id,
      versionId: version.id,
      action: 'version_saved',
      actorType: input.sourceType.startsWith('agent') ? 'agent' : 'user',
      message: input.changeSummary,
      snapshot: {
        versionNumber,
        sourceType: input.sourceType,
        hasStandardImport: Boolean(version.standardImport),
        hasMermaidSource: Boolean(version.mermaidSource),
        hasExternalDocument: Boolean(version.lucidDocumentUrl || version.embedUrl || version.lucidDocumentId)
      }
    })

    return version
  }

  private async getCurrentVersion(scope: LucidchartScope, document: LucidchartDocument) {
    if (!document.currentVersionId) {
      return null
    }
    return this.versionRepository.findOne({
      where: scopedWhere(scope, { id: document.currentVersionId, documentId: document.id as string })
    })
  }

  private async requireDocument(scope: LucidchartScope, documentId: string) {
    const document = await this.documentRepository.findOne({
      where: scopedWhere(scope, { id: normalizeRequired(documentId, 'Lucidchart document id is required.') })
    })
    if (!document) {
      throw new NotFoundException('Lucidchart document was not found.')
    }
    return document
  }

  private async writeLog(
    scope: LucidchartScope,
    input: {
      documentId?: string
      versionId?: string
      action: LucidchartActionType
      actorType?: LucidchartActorType
      message?: string
      errorMessage?: string
      snapshot?: unknown
    }
  ) {
    return this.logRepository.save(
      this.logRepository.create({
        ...scopedCreate(scope),
        documentId: input.documentId ?? null,
        versionId: input.versionId ?? null,
        action: input.action,
        actorType: input.actorType ?? 'system',
        actorId: scope.userId ?? scope.assistantId ?? null,
        message: normalizeOptional(input.message),
        errorMessage: normalizeOptional(input.errorMessage),
        snapshot: input.snapshot
      })
    )
  }
}

function scopedCreate(scope: LucidchartScope): ScopedEntity & { createdById?: string | null } {
  return {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId ?? null,
    workspaceId: scope.workspaceId ?? null,
    projectId: scope.projectId ?? null,
    createdById: scope.userId ?? null
  }
}

function scopedWhere<T extends Record<string, unknown>>(scope: LucidchartScope, extra?: Partial<T>): Partial<T> {
  const where = {
    tenantId: scope.tenantId
  } as Record<string, unknown>
  if (scope.organizationId != null) {
    where.organizationId = scope.organizationId
  }
  if (scope.projectId != null) {
    where.projectId = scope.projectId
  } else if (scope.workspaceId != null) {
    where.workspaceId = scope.workspaceId
  }
  return {
    ...where,
    ...(extra ?? {})
  } as Partial<T>
}

function normalizeRequired(value: string | undefined | null, message: string) {
  const normalized = normalizeOptional(value)
  if (!normalized) {
    throw new BadRequestException(message)
  }
  return normalized
}

function normalizeOptional(value: string | undefined | null) {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function normalizeNullableText(value: string | undefined | null) {
  return normalizeOptional(value) ?? null
}

function normalizeStringArray(values: string[] | undefined | null) {
  const normalized = (values ?? []).map((value) => normalizeOptional(value)).filter(isString)
  return normalized.length ? Array.from(new Set(normalized)) : undefined
}

function normalizeRecord(value: unknown) {
  return isPlainObject(value) ? value : {}
}

function hasVersionContent(input: LucidchartDocumentContentInput) {
  return Boolean(
    (input.standardImport && Object.keys(normalizeRecord(input.standardImport)).length > 0) ||
      input.mermaidSource ||
      input.lucidDocumentId ||
      input.lucidDocumentUrl ||
      input.embedUrl ||
      input.previewUrl
  )
}

function resolveInitialSourceType(input: LucidchartDocumentContentInput): LucidchartVersionSource {
  if (input.lucidDocumentId || input.lucidDocumentUrl || input.embedUrl) {
    return 'external_lucid'
  }
  if (input.mermaidSource) {
    return 'agent_mermaid'
  }
  return 'agent_standard_import'
}

function contentToDocumentUpdates(input: LucidchartDocumentContentInput) {
  const updates: Partial<LucidchartDocument> = {}
  if (input.lucidDocumentId !== undefined) {
    updates.lucidDocumentId = normalizeOptional(input.lucidDocumentId)
  }
  if (input.lucidDocumentUrl !== undefined) {
    updates.lucidDocumentUrl = normalizeOptional(input.lucidDocumentUrl)
  }
  if (input.embedUrl !== undefined) {
    updates.embedUrl = normalizeOptional(input.embedUrl)
  }
  if (input.embedId !== undefined) {
    updates.embedId = normalizeOptional(input.embedId)
  }
  if (input.previewUrl !== undefined) {
    updates.previewUrl = normalizeOptional(input.previewUrl)
  }
  return updates
}

function shallowMerge(base: Record<string, unknown>, patch: Record<string, unknown>) {
  return {
    ...base,
    ...patch
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}
