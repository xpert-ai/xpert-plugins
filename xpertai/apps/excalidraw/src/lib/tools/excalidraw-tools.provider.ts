import { BadRequestException, Injectable } from '@nestjs/common'
import { serializeTypographyPresets } from '@xpert-ai/design-fonts'
import {
  XpertTool,
  XpertToolProvider,
  defineMcpApp,
  type IAgentMiddlewareContext,
  type XpertBusinessToolContext
} from '@xpert-ai/plugin-sdk'
import { randomUUID } from 'node:crypto'
import { z } from 'zod/v3'
import { EXCALIDRAW_FEATURE, EXCALIDRAW_ICON, EXCALIDRAW_MIDDLEWARE_NAME } from '../constants.js'
import { ArtifactTemplateCatalogService } from '../diagram-engine/artifact-template-catalog.service.js'
import { DiagramIrService } from '../diagram-engine/diagram-ir.service.js'
import { createChangeSummaryToolEventWrapper } from '../diagram-engine/diagram-tool-events.js'
import { ExcalidrawOperationService } from '../excalidraw-operation.service.js'
import { ExcalidrawReadService } from '../excalidraw-read.service.js'
import { ExcalidrawService } from '../excalidraw.service.js'
import { ExcalidrawRenderService } from '../rendering/excalidraw-render.service.js'
import { jobResultSchema } from '../rendering/render-contracts.js'
import type { ExcalidrawScope } from '../types.js'
import * as c from './contracts.js'
import * as out from './result-schemas.js'
import * as dto from './result-dto.js'
import { jobDto, exportDto, imageDto } from './render-result-dto.js'
import * as ir from './diagram-contracts.js'
import * as d from './drawing-contracts.js'
import { projectResult, projectImageResult } from './result-recovery.js'
import { recoverableSchema } from './result-recovery.schema.js'
import { excalidrawMiddlewareExtensions } from './middleware-extensions.js'

const READ = { risk: 'read', sideEffect: 'none', idempotency: 'safe' } as const
const WRITE = { risk: 'write', sideEffect: 'reversible', idempotency: 'idempotent' } as const
const CONTEXT = ['tenant', 'organization', 'principal'] as const
export const EXCALIDRAW_MCP_APP = defineMcpApp({
  key: 'excalidraw_preview',
  entry: 'dist/mcp-apps/preview/index.html',
  title: 'Excalidraw Preview',
  description: 'Inspect the current Excalidraw scene and technical diagram quality.',
  csp: { connectDomains: [], resourceDomains: [] }
})
const toolMeta = (en_US: string, zh_Hans: string) => ({ toolName: { en_US, zh_Hans } })
function drawingId(input: { drawingId?: string }) {
  if (!input.drawingId) throw new BadRequestException('no_active_context')
  return input.drawingId
}
export function excalidrawToolScope(context: XpertBusinessToolContext): ExcalidrawScope {
  if (!context.tenantId || !context.organizationId || !context.principal.id)
    throw new BadRequestException('missing_execution_context')
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId,
    actorId: context.principal.id,
    userId: context.principal.userId ?? (context.principal.type === 'user' ? context.principal.id : null),
    surface: context.surface,
    workspaceId: context.surface === 'mcp' ? null : context.workspaceId ?? null,
    projectId: context.surface === 'mcp' ? null : context.projectId ?? null,
    assistantId: context.surface === 'mcp' ? null : context.xpertId ?? null,
    conversationId: context.surface === 'mcp' ? null : context.conversationId ?? null
  }
}
function operationId(input: { operationId?: string }, context: XpertBusinessToolContext) {
  if (context.surface === 'mcp' && !input.operationId) throw new BadRequestException('operation_id_required')
  return input.operationId ?? context.requestId ?? randomUUID()
}
function requireRevision(input: { expectedRevision?: number }, context: XpertBusinessToolContext) {
  if (context.surface === 'mcp' && input.expectedRevision === undefined)
    throw new BadRequestException('expected_revision_required')
}

@XpertToolProvider({
  provider: 'excalidraw_tools',
  componentKey: 'excalidraw-tools',
  name: 'Excalidraw',
  description: 'Organization-wide Excalidraw drawing, technical diagrams, previews, versions and governed sharing.',
  instructions:
    'Search drawings and read the current revision before editing. MCP targets must have an explicit drawingId. Reuse operationId on retries. Wait for submitted render jobs and read the actual preview image before recording a visual review. Tools, including public sharing, are authorized by the application policy without interactive confirmation.',
  icon: { type: 'svg', value: EXCALIDRAW_ICON },
  apps: [EXCALIDRAW_MCP_APP],
  defaultMiddleware: EXCALIDRAW_MIDDLEWARE_NAME,
  middlewares: [
    {
      provider: EXCALIDRAW_MIDDLEWARE_NAME,
      meta: {
        name: EXCALIDRAW_MIDDLEWARE_NAME,
        label: { en_US: 'Excalidraw drawing', zh_Hans: 'Excalidraw 绘图' },
        description: { en_US: 'Create and edit shared drawings.', zh_Hans: '创建和编辑共享图形。' },
        icon: { type: 'svg', value: EXCALIDRAW_ICON },
        features: [EXCALIDRAW_FEATURE, 'excalidraw-artifact-sharing']
      }
    },
    {
      provider: ir.EXCALIDRAW_DIAGRAM_ENGINE_MIDDLEWARE_NAME,
      meta: {
        name: ir.EXCALIDRAW_DIAGRAM_ENGINE_MIDDLEWARE_NAME,
        label: { en_US: 'Technical diagram engine', zh_Hans: '技术图引擎' },
        description: { en_US: 'Templates, DiagramIR and quality review.', zh_Hans: '模板、DiagramIR 和质量审核。' },
        icon: { type: 'svg', value: EXCALIDRAW_ICON },
        features: [EXCALIDRAW_FEATURE, 'diagram-ir']
      }
    }
  ]
})
@Injectable()
export class ExcalidrawTools {
  constructor(
    private readonly drawings: ExcalidrawService,
    private readonly reads: ExcalidrawReadService,
    private readonly operations: ExcalidrawOperationService,
    private readonly catalog: ArtifactTemplateCatalogService,
    private readonly diagrams: DiagramIrService,
    private readonly renders: ExcalidrawRenderService
  ) {}
  getMiddlewareExtensions(provider: string, _options: object, _context: IAgentMiddlewareContext) {
    return provider === EXCALIDRAW_MIDDLEWARE_NAME
      ? excalidrawMiddlewareExtensions()
      : { wrapToolCall: createChangeSummaryToolEventWrapper(new Set(ir.EXCALIDRAW_DIAGRAM_TOOL_NAMES)) }
  }
  private mutate(
    input: object & { operationId?: string },
    context: XpertBusinessToolContext,
    name: string,
    action: (scope: ExcalidrawScope) => Promise<c.Receipt>
  ) {
    const scope = excalidrawToolScope(context)
    const opId = operationId(input, context)
    return this.operations.run(
      scope,
      name,
      opId,
      c.jsonValueSchema.parse(input),
      c.receiptSchema,
      () => action(scope)
    ).then(result => projectResult(() => dto.mutationDto(result), { ...result, operationId: opId }))
  }
  private async receipt(scope: ExcalidrawScope, id: string, message: string, extra: Partial<c.Receipt> = {}) {
    const drawing = await this.drawings.requireDrawing(scope, id)
    return {
      success: true,
      drawingId: id,
      sceneRevision: drawing.revision ?? 0,
      status: drawing.status,
      message,
      ...extra
    }
  }

  @XpertTool({
    name: 'excalidraw_list_typography_presets',
    description: 'List supported Excalidraw font families. Use these numeric mappings for text elements.',
    inputSchema: c.emptySchema,
    outputSchema: recoverableSchema(out.fontsResultSchema),
    middleware: true,
    mcp: { behavior: READ, requiredContext: CONTEXT },
    metadata: toolMeta('Read font presets', '读取字体预设')
  })
  fonts() {
    const items = serializeTypographyPresets('excalidraw').map(({ id, label, fontFamilyId, excalidrawFamily, languages }) => ({ id, label, fontFamilyId, excalidrawFamily, languages }))
    return projectResult(() => ({ items }))
  }

  @XpertTool({
    name: 'excalidraw_create_drawing',
    description:
      'Create a new drawing record with metadata only. For additions to an existing drawing use add_elements with its drawingId. Next add small batches of elements.',
    inputSchema: d.createDrawingSchema,
    outputSchema: recoverableSchema(out.mutationResultSchema),
    middleware: true,
    mcp: { defaultApprovalMode: 'allow', behavior: WRITE, requiredContext: CONTEXT },
    metadata: toolMeta('Create drawing', '创建图形')
  })
  create(input: z.infer<typeof d.createDrawingSchema>, context: XpertBusinessToolContext) {
    return this.mutate(input, context, 'excalidraw_create_drawing', async (scope) => {
      const result = await this.drawings.createDrawing(scope, { ...input, title: input.title })
      return this.receipt(scope, result.item.id, 'Drawing created.')
    })
  }

  @XpertTool({
    name: 'excalidraw_search_drawings',
    description:
      'Search organization drawings with bounded pagination. MCP includes all projects in the authenticated organization.',
    inputSchema: d.searchSchema,
    outputSchema: recoverableSchema(out.searchResultSchema),
    middleware: true,
    mcp: { behavior: READ, requiredContext: CONTEXT },
    metadata: toolMeta('Search drawings', '搜索图形')
  })
  search(input: z.infer<typeof d.searchSchema>, context: XpertBusinessToolContext) {
    return this.reads.search(excalidrawToolScope(context), input).then(result => projectResult(() => dto.searchDto(result)))
  }

  @XpertTool({
    name: 'excalidraw_get_drawing',
    description:
      'Read drawing metadata, scene revision and optional paged element refs. Use list_versions for history and get_scene_item for editable element fields.',
    inputSchema: d.getDrawingSchema,
    outputSchema: recoverableSchema(out.drawingResultSchema),
    middleware: true,
    mcp: {
      behavior: READ,
      requiredContext: CONTEXT,
      visibility: ['model', 'app'],
      app: { resourceKey: 'excalidraw_preview' }
    },
    metadata: toolMeta('Read drawing', '读取图形')
  })
  get(input: z.infer<typeof d.getDrawingSchema>, context: XpertBusinessToolContext) {
    return this.reads.get(excalidrawToolScope(context), { ...input, drawingId: drawingId(input) }).then(result => projectResult(() => dto.drawingResultDto(result, input), { drawingId: input.drawingId }))
  }

  @XpertTool({
    name: 'excalidraw_get_scene_item',
    description:
      'Read one element, appState, Mermaid source or file metadata. Binary preview bytes are available through read_preview.',
    inputSchema: d.getItemSchema,
    outputSchema: recoverableSchema(out.sceneItemResultSchema),
    middleware: true,
    mcp: { behavior: READ, requiredContext: CONTEXT },
    metadata: toolMeta('Read scene item', '读取场景项')
  })
  item(input: z.infer<typeof d.getItemSchema>, context: XpertBusinessToolContext) {
    return this.reads.item(excalidrawToolScope(context), {
      ...input,
      drawingId: drawingId(input),
      itemType: input.itemType
    }).then(result => projectResult(() => dto.sceneItemDto(result), { drawingId: input.drawingId }))
  }

  @XpertTool({
    name: 'excalidraw_add_elements',
    description:
      'Append 1-20 related shorthand elements to an existing drawing. Prefer 1-5 elements per call. Existing elements are preserved.',
    inputSchema: d.addElementsSchema,
    outputSchema: recoverableSchema(out.mutationResultSchema),
    middleware: true,
    mcp: { defaultApprovalMode: 'allow', behavior: WRITE, requiredContext: CONTEXT },
    metadata: toolMeta('Add elements', '添加元素')
  })
  add(input: z.infer<typeof d.addElementsSchema>, context: XpertBusinessToolContext) {
    return this.mutate(input, context, 'excalidraw_add_elements', async (scope) => {
      const id = drawingId(input)
      const result = await this.drawings.patchScene(scope, {
        drawingId: id,
        addElements: input.elements,
        appStatePatch: input.appStatePatch,
        files: input.files,
        changeSummary: input.changeSummary
      })
      return this.receipt(scope, id, 'Elements added.', {
        changedIds: result.patch.addedIds,
        changedCount: result.patch.addCount
      })
    })
  }

  @XpertTool({
    name: 'excalidraw_patch_scene',
    description:
      'Apply a bounded element patch by stable ids. Unknown ids, duplicate ids and type changes fail. Deletion requires expectedRevision.',
    inputSchema: d.patchSceneSchema,
    outputSchema: recoverableSchema(out.mutationResultSchema),
    middleware: true,
    mcp: { defaultApprovalMode: 'allow', behavior: WRITE, requiredContext: CONTEXT },
    metadata: toolMeta('Edit scene', '修改场景')
  })
  patch(input: z.infer<typeof d.patchSceneSchema>, context: XpertBusinessToolContext) {
    if (input.deleteElementIds?.length) requireRevision(input, context)
    return this.mutate(input, context, 'excalidraw_patch_scene', async (scope) => {
      const id = drawingId(input)
      const result = await this.drawings.patchScene(scope, {
        ...input,
        drawingId: id,
        updateElements: input.updateElements?.map((item) => ({ ...item, id: item.id }))
      })
      return this.receipt(scope, id, 'Scene updated.', {
        changedIds: [...result.patch.addedIds, ...result.patch.updatedIds, ...result.patch.deletedIds],
        changedCount: result.patch.addCount + result.patch.updateCount + result.patch.deleteCount
      })
    })
  }

  @XpertTool({
    name: 'excalidraw_save_scene_version',
    description:
      'Replace the current scene. This existing tool updates the working version; use checkpoint_version to create a historical checkpoint. Read the scene revision first.',
    inputSchema: d.saveSceneSchema,
    outputSchema: recoverableSchema(out.mutationResultSchema),
    middleware: true,
    mcp: { defaultApprovalMode: 'allow', behavior: WRITE, requiredContext: CONTEXT },
    metadata: toolMeta('Save current scene', '保存当前场景')
  })
  save(input: z.infer<typeof d.saveSceneSchema>, context: XpertBusinessToolContext) {
    requireRevision(input, context)
    return this.mutate(input, context, 'excalidraw_save_scene_version', async (scope) => {
      const id = drawingId(input)
      await this.drawings.saveCurrentScene(scope, { ...input, drawingId: id })
      return this.receipt(scope, id, 'Current scene saved.')
    })
  }

  @XpertTool({
    name: 'excalidraw_save_mermaid_draft',
    description: 'Save Mermaid source as a draft. Call convert_mermaid to convert it without opening Workbench.',
    inputSchema: d.mermaidSchema,
    outputSchema: recoverableSchema(out.mutationResultSchema),
    middleware: true,
    mcp: { defaultApprovalMode: 'allow', behavior: WRITE, requiredContext: CONTEXT },
    metadata: toolMeta('Save Mermaid draft', '保存 Mermaid 草稿')
  })
  mermaidDraft(input: z.infer<typeof d.mermaidSchema>, context: XpertBusinessToolContext) {
    return this.mutate(input, context, 'excalidraw_save_mermaid_draft', async (scope) => {
      const result = await this.drawings.saveMermaidDraft(scope, { ...input, mermaidSource: input.mermaidSource })
      return this.receipt(scope, result.version.drawingId, 'Mermaid draft saved.')
    })
  }

  @XpertTool({
    name: 'excalidraw_update_drawing_status',
    description: 'Set a drawing to draft, reviewed or archived. Archiving preserves drawing data.',
    inputSchema: d.statusSchema,
    outputSchema: recoverableSchema(out.mutationResultSchema),
    middleware: true,
    mcp: { defaultApprovalMode: 'allow', behavior: WRITE, requiredContext: CONTEXT },
    metadata: toolMeta('Update drawing status', '更新图形状态')
  })
  status(input: z.infer<typeof d.statusSchema>, context: XpertBusinessToolContext) {
    return this.mutate(input, context, 'excalidraw_update_drawing_status', async (scope) => {
      const id = drawingId(input)
      await this.drawings.updateDrawingStatus(scope, { ...input, drawingId: id, status: input.status })
      return this.receipt(scope, id, 'Status updated.')
    })
  }

  @XpertTool({
    name: 'excalidraw_report_failure',
    description: 'Record one recoverable drawing or conversion failure with a bounded diagnostic.',
    inputSchema: d.failureSchema,
    outputSchema: recoverableSchema(out.mutationResultSchema),
    middleware: true,
    mcp: { defaultApprovalMode: 'allow', behavior: WRITE, requiredContext: CONTEXT },
    metadata: toolMeta('Record drawing failure', '记录绘图失败')
  })
  failure(input: z.infer<typeof d.failureSchema>, context: XpertBusinessToolContext) {
    return this.mutate(input, context, 'excalidraw_report_failure', async (scope) => {
      await this.drawings.reportFailure(scope, {
        ...input,
        operation: input.operation,
        errorMessage: input.errorMessage
      })
      return { success: true, drawingId: input.drawingId, message: 'Failure recorded.' }
    })
  }

  @XpertTool({
    name: 'excalidraw_checkpoint_version',
    description: 'Freeze the current authoritative scene as a new explicit business version.',
    inputSchema: d.checkpointSchema,
    outputSchema: recoverableSchema(out.mutationResultSchema),
    middleware: true,
    mcp: { defaultApprovalMode: 'allow', behavior: WRITE, requiredContext: CONTEXT },
    metadata: toolMeta('Create version checkpoint', '创建版本检查点')
  })
  checkpoint(input: z.infer<typeof d.checkpointSchema>, context: XpertBusinessToolContext) {
    requireRevision(input, context)
    return this.mutate(input, context, 'excalidraw_checkpoint_version', async (scope) => {
      const id = drawingId(input)
      const { version } = await this.reads.snapshot(scope, id)
      const checkpoint = await this.drawings.saveSceneVersion(scope, {
        drawingId: id,
        isCheckpoint: true,
        elements: version?.elements ?? [],
        appState: version?.appState ?? {},
        files: version?.files ?? {},
        mermaidSource: version?.mermaidSource,
        expectedRevision: input.expectedRevision,
        changeSummary: input.changeSummary
      })
      return this.receipt(scope, id, 'Version checkpoint created.', { versionId: checkpoint.version.id, versionNumber: checkpoint.version.versionNumber })
    })
  }

  @XpertTool({
    name: 'excalidraw_list_versions',
    description: 'List bounded version metadata without returning scene snapshots.',
    inputSchema: d.versionsSchema,
    outputSchema: recoverableSchema(out.versionsResultSchema),
    middleware: true,
    mcp: { behavior: READ, requiredContext: CONTEXT, visibility: ['model', 'app'] },
    metadata: toolMeta('List drawing versions', '查看图形版本')
  })
  versions(input: z.infer<typeof d.versionsSchema>, context: XpertBusinessToolContext) {
    return this.reads.listVersions(excalidrawToolScope(context), drawingId(input), input.page, input.pageSize).then(result => projectResult(() => dto.versionsDto(result), { drawingId: input.drawingId }))
  }

  @XpertTool({
    name: 'excalidraw_restore_version',
    description: 'Restore one historical version after reading expectedRevision. Preserves history as a new version.',
    inputSchema: d.restoreSchema,
    outputSchema: recoverableSchema(out.mutationResultSchema),
    middleware: true,
    mcp: { defaultApprovalMode: 'allow', behavior: WRITE, requiredContext: CONTEXT },
    metadata: toolMeta('Restore drawing version', '恢复图形版本')
  })
  restore(input: z.infer<typeof d.restoreSchema>, context: XpertBusinessToolContext) {
    requireRevision(input, context)
    return this.mutate(input, context, 'excalidraw_restore_version', async (scope) => {
      const id = drawingId(input)
      const drawing = await this.drawings.requireCanonicalDrawing(scope, id)
      this.drawings.assertSceneRevision(drawing, input.expectedRevision)
      await this.drawings.restoreVersion(scope, id, input.versionId, input.changeSummary, input.expectedRevision)
      await this.drawings.markSceneDiverged(scope, id)
      return this.receipt(scope, id, 'Version restored.')
    })
  }

  @XpertTool({
    name: 'excalidraw_publish_artifact_link',
    description:
      'Publish or reuse a fixed-version read-only Artifact link. Public access is permitted by the application policy without interactive confirmation. Read expectedRevision before calling.',
    inputSchema: d.publishSchema,
    outputSchema: recoverableSchema(out.mutationResultSchema),
    middleware: true,
    mcp: { defaultApprovalMode: 'allow', behavior: { ...WRITE, risk: 'dangerous', sideEffect: 'irreversible' }, requiredContext: CONTEXT },
    metadata: toolMeta('Share drawing', '分享图形')
  })
  async publish(input: z.infer<typeof d.publishSchema>, context: XpertBusinessToolContext) {
    requireRevision(input, context)
    const scope = excalidrawToolScope(context),
      id = drawingId(input)
    operationId(input, context)
    const existing = await this.operations.lookup(
      scope,
      'excalidraw_publish_artifact_link',
      operationId(input, context),
      c.jsonValueSchema.parse(input),
      c.receiptSchema
    )
    if (existing) return projectResult(() => dto.mutationDto(existing), { ...existing, operationId: input.operationId })
    const drawing = await this.drawings.requireCanonicalDrawing(scope, id)
    this.drawings.assertSceneRevision(drawing, input.expectedRevision)
    return this.mutate(input, context, 'excalidraw_publish_artifact_link', async (current) => {
      this.drawings.assertSceneRevision(
        await this.drawings.requireCanonicalDrawing(current, id),
        input.expectedRevision
      )
      const result = await this.drawings.publishDrawingViewerArtifact(current, {
        drawingId: id,
        versionMode: 'version',
        expectedRevision: input.expectedRevision,
        accessMode: input.accessMode,
        publicLinkAuthorization: 'application_policy'
      })
      return this.receipt(current, id, 'Artifact link ready.', { shareUrl: result.publicUrl })
    })
  }

  @XpertTool({
    name: 'excalidraw_revoke_artifact_link',
    description: 'Revoke the active drawing Artifact link.',
    inputSchema: d.revokeSchema,
    outputSchema: recoverableSchema(out.mutationResultSchema),
    middleware: true,
    mcp: { defaultApprovalMode: 'allow', behavior: WRITE, requiredContext: CONTEXT },
    metadata: toolMeta('Revoke drawing link', '撤销图形链接')
  })
  revoke(input: z.infer<typeof d.revokeSchema>, context: XpertBusinessToolContext) {
    return this.mutate(input, context, 'excalidraw_revoke_artifact_link', async (scope) => {
      const id = drawingId(input)
      await this.drawings.revokeArtifactShare(scope, id)
      return this.receipt(scope, id, 'Artifact link revoked.')
    })
  }

  @XpertTool({
    name: 'excalidraw_create_preview',
    description:
      'Submit a native Excalidraw PNG preview of the actual current scene. Wait for the returned job and then read_preview.',
    inputSchema: d.previewSchema,
    outputSchema: recoverableSchema(jobResultSchema),
    middleware: true,
    mcp: {
      defaultApprovalMode: 'allow',
      behavior: WRITE,
      requiredContext: CONTEXT,
      visibility: ['model', 'app'],
      app: { resourceKey: 'excalidraw_preview' }
    },
    metadata: toolMeta('Create preview', '生成预览')
  })
  preview(input: z.infer<typeof d.previewSchema>, context: XpertBusinessToolContext) {
    const opId = operationId(input, context)
    return this.renders.submit(excalidrawToolScope(context), {
      drawingId: drawingId(input),
      operationId: opId,
      kind: 'preview',
      expectedRevision: input.expectedRevision
    }).then(result => projectResult(() => jobDto(result), { ...result, operationId: opId }))
  }

  @XpertTool({
    name: 'excalidraw_convert_mermaid',
    description:
      'Convert Mermaid in Browser Runtime without opening Workbench. Completion applies only if the scene revision still matches.',
    inputSchema: d.mermaidSchema,
    outputSchema: recoverableSchema(jobResultSchema),
    middleware: true,
    mcp: {
      defaultApprovalMode: 'allow',
      behavior: WRITE,
      requiredContext: CONTEXT,
      visibility: ['model', 'app'],
      app: { resourceKey: 'excalidraw_preview' }
    },
    metadata: toolMeta('Convert Mermaid', '转换 Mermaid')
  })
  convert(input: z.infer<typeof d.mermaidSchema>, context: XpertBusinessToolContext) {
    const opId = operationId(input, context)
    requireRevision(input, context)
    return this.renders.submit(excalidrawToolScope(context), {
      drawingId: drawingId(input),
      operationId: opId,
      kind: 'mermaid',
      expectedRevision: input.expectedRevision,
      mermaidSource: input.mermaidSource
    }).then(result => projectResult(() => jobDto(result), { ...result, operationId: opId }))
  }

  @XpertTool({
    name: 'excalidraw_export_drawing',
    description:
      'Export an immutable drawing as Excalidraw JSON, SVG or PNG. Outputs stay in governed Workspace Files.',
    inputSchema: d.exportSchema,
    outputSchema: recoverableSchema(jobResultSchema),
    middleware: true,
    mcp: {
      defaultApprovalMode: 'allow',
      behavior: WRITE,
      requiredContext: CONTEXT,
      visibility: ['model', 'app'],
      app: { resourceKey: 'excalidraw_preview' }
    },
    metadata: toolMeta('Export drawing', '导出图形')
  })
  export(input: z.infer<typeof d.exportSchema>, context: XpertBusinessToolContext) {
    const opId = operationId(input, context)
    return this.renders.submit(excalidrawToolScope(context), {
      drawingId: drawingId(input),
      operationId: opId,
      kind: 'export',
      format: input.format,
      expectedRevision: input.expectedRevision
    }).then(result => projectResult(() => jobDto(result), { ...result, operationId: opId }))
  }

  @XpertTool({
    name: 'excalidraw_get_job',
    description: 'Read render job. Reuse returned jobId and cursor.',
    inputSchema: d.jobSchema,
    outputSchema: recoverableSchema(jobResultSchema),
    middleware: true,
    mcp: { behavior: READ, requiredContext: CONTEXT, visibility: ['model', 'app'] }
  })
  job(input: z.infer<typeof d.jobSchema>, context: XpertBusinessToolContext) {
    return this.renders.get(excalidrawToolScope(context), input.jobId).then(result => projectResult(() => jobDto(result), result))
  }

  @XpertTool({
    name: 'excalidraw_wait_job',
    description: 'Wait up to 45 seconds for job progress. Reuse returned jobId and cursor.',
    inputSchema: d.waitSchema,
    outputSchema: recoverableSchema(jobResultSchema),
    middleware: true,
    mcp: { behavior: READ, requiredContext: CONTEXT, visibility: ['model', 'app'] }
  })
  wait(input: z.infer<typeof d.waitSchema>, context: XpertBusinessToolContext) {
    return this.renders.wait(excalidrawToolScope(context), input.jobId, input.cursor, context.signal).then(result => projectResult(() => jobDto(result), result))
  }

  @XpertTool({
    name: 'excalidraw_cancel_job',
    description: 'Cancel a render job. Reuse operationId when retrying.',
    inputSchema: d.cancelSchema,
    outputSchema: recoverableSchema(jobResultSchema),
    middleware: true,
    mcp: { defaultApprovalMode: 'allow', behavior: WRITE, requiredContext: CONTEXT, visibility: ['model', 'app'] }
  })
  cancel(input: z.infer<typeof d.cancelSchema>, context: XpertBusinessToolContext) {
    const opId = operationId(input, context)
    const scope = excalidrawToolScope(context)
    return this.operations.run(
      scope,
      'excalidraw_cancel_job',
      opId,
      c.jsonValueSchema.parse(input),
      jobResultSchema,
      () => this.renders.cancel(scope, input.jobId)
    ).then(result => projectResult(() => jobDto(result), { ...result, operationId: opId }))
  }

  @XpertTool({
    name: 'excalidraw_read_preview',
    description:
      'Read one completed PNG preview as a standard image content block. Inspect this image before recording visual review.',
    inputSchema: d.previewReadSchema,
    outputSchema: recoverableSchema(d.imageResultSchema),
    resultFormat: 'tool_result',
    middleware: true,
    mcp: { behavior: READ, requiredContext: CONTEXT, visibility: ['model', 'app'] }
  })
  image(input: z.infer<typeof d.previewReadSchema>, context: XpertBusinessToolContext) {
    return this.renders.readPreview(excalidrawToolScope(context), input.previewId).then(result => projectImageResult(() => imageDto(result), { previewId: input.previewId }))
  }

  @XpertTool({
    name: 'excalidraw_read_export',
    description:
      'Read a bounded base64 chunk of an exported JSON, SVG or PNG, or a conversion retained after conflict. Metadata and sha256 appear only at offset 0. Assemble base64 chunks in order. No private storage paths are returned.',
    inputSchema: d.exportReadSchema,
    outputSchema: recoverableSchema(d.exportResultSchema),
    middleware: true,
    mcp: { behavior: READ, requiredContext: CONTEXT, visibility: ['model', 'app'] }
  })
  readExport(input: z.infer<typeof d.exportReadSchema>, context: XpertBusinessToolContext) {
    return this.renders.readExport(excalidrawToolScope(context), input.jobId, input.offset, input.limit).then(result => projectResult(() => exportDto(result), { jobId: input.jobId }))
  }

  @XpertTool({
    name: 'excalidraw_template_list',
    description: 'Search the built-in technical diagram template catalog.',
    inputSchema: ir.templateListSchema,
    outputSchema: recoverableSchema(out.templatesResultSchema),
    middleware: ir.EXCALIDRAW_DIAGRAM_ENGINE_MIDDLEWARE_NAME,
    mcp: { behavior: READ, requiredContext: CONTEXT }
  })
  templateList(input: z.infer<typeof ir.templateListSchema>) {
    const result = this.catalog.list(input)
    return projectResult(() => dto.templatesDto(result))
  }
  @XpertTool({
    name: 'excalidraw_template_inspect',
    description: 'Inspect template parameters, defaults and editable label IDs before instantiating it.',
    inputSchema: ir.templateInspectSchema,
    outputSchema: recoverableSchema(out.templateResultSchema),
    middleware: ir.EXCALIDRAW_DIAGRAM_ENGINE_MIDDLEWARE_NAME,
    mcp: { behavior: READ, requiredContext: CONTEXT }
  })
  templateInspect(input: z.infer<typeof ir.templateInspectSchema>) {
    const result = this.catalog.get(input.key, input.version)
    return projectResult(() => dto.templateDto(result))
  }

  @XpertTool({
    name: 'excalidraw_template_instantiate',
    description:
      'Instantiate a built-in template. Replacing an existing IR requires expectedRevision and replaceCurrent.',
    inputSchema: ir.templateInstantiateSchema,
    outputSchema: recoverableSchema(out.mutationResultSchema),
    middleware: ir.EXCALIDRAW_DIAGRAM_ENGINE_MIDDLEWARE_NAME,
    mcp: { defaultApprovalMode: 'allow', behavior: WRITE, requiredContext: CONTEXT }
  })
  instantiate(
    input: Parameters<DiagramIrService['instantiateTemplate']>[1] & { operationId?: string },
    context: XpertBusinessToolContext
  ) {
    return this.mutate(input, context, 'excalidraw_template_instantiate', async (scope) => {
      const result = await this.diagrams.instantiateTemplate(scope, input)
      return this.receipt(scope, result.drawingId, result.message, {
        irRevision: result.revision,
        status: result.status,
        success: result.success
      })
    })
  }

  @XpertTool({
    name: 'excalidraw_diagram_create',
    description: 'Validate and create a versioned DiagramIR. Invalid geometry creates no drawing.',
    inputSchema: ir.diagramCreateSchema,
    outputSchema: recoverableSchema(out.mutationResultSchema),
    middleware: ir.EXCALIDRAW_DIAGRAM_ENGINE_MIDDLEWARE_NAME,
    mcp: { defaultApprovalMode: 'allow', behavior: WRITE, requiredContext: CONTEXT }
  })
  createDiagram(
    input: Parameters<DiagramIrService['create']>[1] & { operationId?: string },
    context: XpertBusinessToolContext
  ) {
    return this.mutate(input, context, 'excalidraw_diagram_create', async (scope) => {
      const result = await this.diagrams.create(scope, input)
      return this.receipt(scope, result.drawingId, result.message, {
        irRevision: result.revision,
        status: result.status,
        success: result.success
      })
    })
  }

  @XpertTool({
    name: 'excalidraw_diagram_upsert_group',
    description: 'Add or replace one DiagramIR group using expectedRevision.',
    inputSchema: ir.upsertGroupSchema,
    outputSchema: recoverableSchema(out.mutationResultSchema),
    middleware: ir.EXCALIDRAW_DIAGRAM_ENGINE_MIDDLEWARE_NAME,
    mcp: { defaultApprovalMode: 'allow', behavior: WRITE, requiredContext: CONTEXT }
  })
  group(
    input: Parameters<DiagramIrService['upsertGroup']>[1] & { operationId?: string },
    context: XpertBusinessToolContext
  ) {
    return this.mutate(input, context, 'excalidraw_diagram_upsert_group', async (scope) => {
      const result = await this.diagrams.upsertGroup(scope, input)
      return this.receipt(scope, result.drawingId, result.message, {
        irRevision: result.revision,
        status: result.status,
        success: result.success
      })
    })
  }

  @XpertTool({
    name: 'excalidraw_diagram_upsert_node',
    description: 'Add or replace one DiagramIR node using expectedRevision.',
    inputSchema: ir.upsertNodeSchema,
    outputSchema: recoverableSchema(out.mutationResultSchema),
    middleware: ir.EXCALIDRAW_DIAGRAM_ENGINE_MIDDLEWARE_NAME,
    mcp: { defaultApprovalMode: 'allow', behavior: WRITE, requiredContext: CONTEXT }
  })
  node(
    input: Parameters<DiagramIrService['upsertNode']>[1] & { operationId?: string },
    context: XpertBusinessToolContext
  ) {
    return this.mutate(input, context, 'excalidraw_diagram_upsert_node', async (scope) => {
      const result = await this.diagrams.upsertNode(scope, input)
      return this.receipt(scope, result.drawingId, result.message, {
        irRevision: result.revision,
        status: result.status,
        success: result.success
      })
    })
  }

  @XpertTool({
    name: 'excalidraw_diagram_upsert_edge',
    description: 'Add or replace one DiagramIR edge after its nodes exist.',
    inputSchema: ir.upsertEdgeSchema,
    outputSchema: recoverableSchema(out.mutationResultSchema),
    middleware: ir.EXCALIDRAW_DIAGRAM_ENGINE_MIDDLEWARE_NAME,
    mcp: { defaultApprovalMode: 'allow', behavior: WRITE, requiredContext: CONTEXT }
  })
  edge(
    input: Parameters<DiagramIrService['upsertEdge']>[1] & { operationId?: string },
    context: XpertBusinessToolContext
  ) {
    return this.mutate(input, context, 'excalidraw_diagram_upsert_edge', async (scope) => {
      const result = await this.diagrams.upsertEdge(scope, input)
      return this.receipt(scope, result.drawingId, result.message, {
        irRevision: result.revision,
        status: result.status,
        success: result.success
      })
    })
  }

  @XpertTool({
    name: 'excalidraw_diagram_remove_items',
    description: 'Remove DiagramIR items and their dependent edges.',
    inputSchema: ir.removeItemsSchema,
    outputSchema: recoverableSchema(out.mutationResultSchema),
    middleware: ir.EXCALIDRAW_DIAGRAM_ENGINE_MIDDLEWARE_NAME,
    mcp: { defaultApprovalMode: 'allow', behavior: WRITE, requiredContext: CONTEXT }
  })
  remove(
    input: Parameters<DiagramIrService['removeItems']>[1] & { operationId?: string },
    context: XpertBusinessToolContext
  ) {
    return this.mutate(input, context, 'excalidraw_diagram_remove_items', async (scope) => {
      const result = await this.diagrams.removeItems(scope, input)
      return this.receipt(scope, result.drawingId, result.message, {
        irRevision: result.revision,
        status: result.status,
        success: result.success
      })
    })
  }

  @XpertTool({
    name: 'excalidraw_diagram_render',
    description: 'Render DiagramIR as a new Excalidraw version. Diverged drawings require explicit replacement intent.',
    inputSchema: ir.renderSchema,
    outputSchema: recoverableSchema(out.mutationResultSchema),
    middleware: ir.EXCALIDRAW_DIAGRAM_ENGINE_MIDDLEWARE_NAME,
    mcp: { defaultApprovalMode: 'allow', behavior: WRITE, requiredContext: CONTEXT }
  })
  renderDiagram(
    input: Parameters<DiagramIrService['render']>[1] & { operationId?: string },
    context: XpertBusinessToolContext
  ) {
    if (context.surface === 'mcp' && input.expectedSceneRevision === undefined)
      throw new BadRequestException('expected_scene_revision_required')
    return this.mutate(input, context, 'excalidraw_diagram_render', async (scope) => {
      const result = await this.diagrams.render(scope, input)
      return this.receipt(scope, result.drawingId, result.message, {
        irRevision: result.revision,
        status: result.status,
        success: result.success
      })
    })
  }

  @XpertTool({
    name: 'excalidraw_diagram_validate',
    description: 'Validate DiagramIR. This writes a new IR revision; use the returned irRevision.',
    inputSchema: ir.revisionReadSchema,
    outputSchema: recoverableSchema(out.mutationResultSchema),
    middleware: ir.EXCALIDRAW_DIAGRAM_ENGINE_MIDDLEWARE_NAME,
    mcp: { defaultApprovalMode: 'allow', behavior: WRITE, requiredContext: CONTEXT }
  })
  validateDiagram(
    input: Parameters<DiagramIrService['validate']>[1] & { operationId?: string },
    context: XpertBusinessToolContext
  ) {
    return this.mutate(input, context, 'excalidraw_diagram_validate', async (scope) => {
      const result = await this.diagrams.validate(scope, input)
      return this.receipt(scope, result.drawingId, result.message, {
        irRevision: result.revision,
        status: result.status,
        success: result.success,
        validation: c.jsonValueSchema.parse(result.validationReport ?? null)
      })
    })
  }

  @XpertTool({
    name: 'excalidraw_diagram_record_visual_review',
    description: 'Record passed, needs_revision or skipped after inspecting the PNG. At most two correction passes.',
    inputSchema: ir.visualReviewSchema,
    outputSchema: recoverableSchema(out.mutationResultSchema),
    middleware: ir.EXCALIDRAW_DIAGRAM_ENGINE_MIDDLEWARE_NAME,
    mcp: { defaultApprovalMode: 'allow', behavior: WRITE, requiredContext: CONTEXT }
  })
  review(
    input: Parameters<DiagramIrService['recordVisualReview']>[1] & { operationId?: string },
    context: XpertBusinessToolContext
  ) {
    return this.mutate(input, context, 'excalidraw_diagram_record_visual_review', async (scope) => {
      const result = await this.diagrams.recordVisualReview(scope, input)
      return this.receipt(scope, result.drawingId, result.message, {
        irRevision: result.revision,
        status: result.status,
        success: result.success,
        review: { qualityRunId: result.review.qualityRunId, attempt: result.review.attempt, decision: result.review.decision }
      })
    })
  }

  @XpertTool({
    name: 'excalidraw_diagram_get',
    description: 'Read the current DiagramIR and revision for explicit technical diagram inspection.',
    inputSchema: ir.drawingSchema,
    outputSchema: recoverableSchema(out.diagramResultSchema),
    middleware: ir.EXCALIDRAW_DIAGRAM_ENGINE_MIDDLEWARE_NAME,
    mcp: { behavior: READ, requiredContext: CONTEXT }
  })
  async getDiagram(input: z.infer<typeof ir.drawingSchema>, context: XpertBusinessToolContext) {
    const result = await this.diagrams.get(excalidrawToolScope(context), input.drawingId)
    return projectResult(() => dto.diagramDto(result), { drawingId: input.drawingId, irRevision: result?.revision })
  }
  @XpertTool({
    name: 'excalidraw_diagram_get_quality_report',
    description: 'Read bounded validation issues and visual review history, without file paths or preview bytes.',
    inputSchema: ir.qualityReadSchema,
    outputSchema: recoverableSchema(out.qualityResultSchema),
    middleware: ir.EXCALIDRAW_DIAGRAM_ENGINE_MIDDLEWARE_NAME,
    mcp: { behavior: READ, requiredContext: CONTEXT, visibility: ['model', 'app'] }
  })
  async quality(input: z.infer<typeof ir.qualityReadSchema>, context: XpertBusinessToolContext) {
    const result = await this.diagrams.qualityReport(excalidrawToolScope(context), input.drawingId)
    return projectResult(() => dto.qualityDto(result, input), { drawingId: input.drawingId, irRevision: result?.revision })
  }
  @XpertTool({
    name: 'excalidraw_diagram_create_preview',
    description:
      'Create a DiagramIR quality preview and return its previewId and updated IR revision. Read the PNG before visual review.',
    inputSchema: ir.previewSchema,
    outputSchema: recoverableSchema(jobResultSchema),
    middleware: ir.EXCALIDRAW_DIAGRAM_ENGINE_MIDDLEWARE_NAME,
    mcp: {
      defaultApprovalMode: 'allow',
      behavior: WRITE,
      requiredContext: CONTEXT,
      visibility: ['model', 'app'],
      app: { resourceKey: 'excalidraw_preview' }
    }
  })
  diagramPreview(input: z.infer<typeof ir.previewSchema>, context: XpertBusinessToolContext) {
    const opId = operationId(input, context)
    return this.renders.qualityPreview(excalidrawToolScope(context), {
      ...input,
      drawingId: input.drawingId,
      expectedRevision: input.expectedRevision,
      operationId: opId
    }).then(result => projectResult(() => jobDto(result), { ...result, operationId: opId }))
  }
}
