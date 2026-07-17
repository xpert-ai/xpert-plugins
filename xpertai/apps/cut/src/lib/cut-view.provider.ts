import { Injectable } from '@nestjs/common'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  I18nObject,
  XpertExtensionViewManifest,
  XpertRemoteComponentEntry,
  XpertRemoteComponentViewSchema,
  XpertResolvedViewHostContext,
  XpertViewActionRequest,
  XpertViewActionResult,
  XpertViewDataResult,
  XpertViewQuery
} from '@xpert-ai/contracts'
import {
  IXpertViewExtensionProvider,
  ViewExtensionProvider,
  XpertViewFileActionFile,
  renderRemoteReactIframeHtml
} from '@xpert-ai/plugin-sdk'
import {
  CUT_AGENT_WORKBENCH_FIXED_SLOT,
  CUT_AGENT_WORKBENCH_MAIN_SLOT,
  CUT_ASSISTANT_CHAT_SEND_MESSAGE_COMMAND,
  CUT_ASSISTANT_CONTEXT_SET_COMMAND,
  CUT_FEATURE,
  CUT_ICON,
  CUT_MIDDLEWARE_TOOL_NAMES,
  CUT_PLUGIN_NAME,
  CUT_PROVIDER_KEY,
  CUT_REMOTE_ENTRY_KEY,
  CUT_WORKBENCH_VIEW_KEY
} from './constants.js'
import { CutCaptionService } from './cut-caption.service.js'
import { isCutExportFormat, isCutExportQuality, normalizeCutExportSettings } from './cut-export-settings.js'
import { CutMediaIntelligenceService } from './cut-media-intelligence.service.js'
import { CutProposalService } from './cut-proposal.service.js'
import { CutRenderService } from './cut-render.service.js'
import { CutService } from './cut.service.js'
import type { CutCaptionDraftEditOperation, CutJsonObject, CutProjectDocument, CutScope } from './types.js'
import type { CutSubtitleFormat } from './cut-caption.js'

type CutViewFileAccessRequest = {
  fileKey: string
  targetId?: string
  purpose: 'preview' | 'download'
}

type CutViewManifest = XpertExtensionViewManifest & {
  fileAccess: { purposes: Array<'preview' | 'download'> }
}

const moduleFile = fileURLToPath(import.meta.url)
const moduleDir = dirname(moduleFile)
const requireFromHere = createRequire(moduleFile)
const i18n = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })

type ProjectContext = XpertResolvedViewHostContext & { projectId?: string | null }
type CutWorkbenchData = XpertViewDataResult & {
  projects: Awaited<ReturnType<CutService['searchProjects']>>
  detail: ReturnType<typeof sanitizeDetail> | null
  captionDrafts: Awaited<ReturnType<CutCaptionService['listCaptionDrafts']>>
  analysisJobs: Awaited<ReturnType<CutCaptionService['listAnalysisJobs']>>
  mediaSegments: Awaited<ReturnType<CutMediaIntelligenceService['listSegments']>>
  editProposals: Awaited<ReturnType<CutProposalService['list']>>
  renderCapability: Awaited<ReturnType<CutRenderService['getCapability']>>
}

@Injectable()
@ViewExtensionProvider(CUT_PROVIDER_KEY)
export class CutViewProvider implements IXpertViewExtensionProvider {
  constructor(
    private readonly service: CutService,
    private readonly captions: CutCaptionService,
    private readonly intelligence: CutMediaIntelligenceService,
    private readonly proposals: CutProposalService,
    private readonly renders: CutRenderService
  ) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent'
  }

  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (context.hostType !== 'agent' || (slot !== CUT_AGENT_WORKBENCH_MAIN_SLOT && slot !== CUT_AGENT_WORKBENCH_FIXED_SLOT)) return []
    const fixed = slot === CUT_AGENT_WORKBENCH_FIXED_SLOT
    const manifest: CutViewManifest = {
      key: CUT_WORKBENCH_VIEW_KEY,
      title: i18n('Cut Workbench', 'Cut 视频工作台'),
      description: i18n('Import media, edit a non-linear timeline, save versions, and export video.', '导入媒体、编辑非线性时间线、保存版本并导出视频。'),
      icon: { type: 'svg', value: CUT_ICON, color: '#0ea5e9', alt: 'Cut' },
      hostType: 'agent',
      slot,
      order: 44,
      refreshable: true,
      activation: { requiredFeatures: [CUT_FEATURE] },
      ...(fixed ? { workbench: { fixed: true, menu: { enabled: true, label: i18n('Cut', 'Cut 剪辑'), order: 44, icon: { type: 'svg', value: CUT_ICON, alt: 'Cut' } } } } : {}),
      source: { provider: CUT_PROVIDER_KEY, plugin: CUT_PLUGIN_NAME },
      fileAccess: { purposes: ['preview', 'download'] },
      view: {
        type: 'remote_component', runtime: 'react', protocolVersion: 1,
        component: { isolation: 'iframe', entry: CUT_REMOTE_ENTRY_KEY },
        dataSource: { mode: 'platform' }
      },
      dataSource: { mode: 'platform', querySchema: { supportsPagination: true, supportsSearch: true, supportsParameters: true, defaultPageSize: 20 }, cache: { enabled: false } },
      hostEvents: {
        subscriptions: [{
          key: 'cut_tool_completed',
          event: 'assistant.tool.completed',
          filter: { sources: ['chatkit'], toolNames: [...CUT_MIDDLEWARE_TOOL_NAMES] },
          action: { type: 'forward', debounceMs: 300 }
        }]
      },
      clientCommands: [
        { key: CUT_ASSISTANT_CONTEXT_SET_COMMAND, label: i18n('Set Assistant Context', '设置 Assistant 上下文') },
        { key: CUT_ASSISTANT_CHAT_SEND_MESSAGE_COMMAND, label: i18n('Send Assistant Message', '发送 Assistant 消息') }
      ],
      actions: [
        { key: 'cut_refresh', label: i18n('Refresh', '刷新'), icon: 'ri-refresh-line', placement: 'toolbar', actionType: 'refresh' },
        { key: 'cut_create_project', label: i18n('New Cut Project', '新建 Cut 项目'), icon: 'ri-add-line', placement: 'toolbar', actionType: 'invoke' },
        { key: 'cut_save_project', label: i18n('Save Timeline', '保存时间线'), icon: 'ri-save-line', placement: 'toolbar', actionType: 'invoke' },
        { key: 'cut_apply_edit', label: i18n('Apply Timeline Edit', '应用时间线编辑'), icon: 'ri-scissors-cut-line', actionType: 'invoke' },
        { key: 'cut_finalize_version', label: i18n('Finalize Version', '保存版本'), icon: 'ri-file-add-line', placement: 'toolbar', actionType: 'invoke' },
        { key: 'cut_get_caption_draft', label: i18n('Get Caption Draft', '读取字幕草稿'), icon: 'ri-subtitle-line', actionType: 'invoke' },
        { key: 'cut_update_caption_draft', label: i18n('Update Caption Draft', '更新字幕草稿'), icon: 'ri-edit-line', actionType: 'invoke' },
        { key: 'cut_commit_caption_draft', label: i18n('Commit Caption Draft', '提交字幕草稿'), icon: 'ri-check-line', actionType: 'invoke' },
        { key: 'cut_import_local_transcription', label: i18n('Import Local Transcription', '保存本地转录'), icon: 'ri-mic-ai-line', actionType: 'invoke' },
        { key: 'cut_import_local_media_analysis', label: i18n('Import Local Media Analysis', '保存本地媒体分析'), icon: 'ri-radar-line', actionType: 'invoke' },
        { key: 'cut_get_edit_proposal', label: i18n('Get Edit Proposal', '读取剪辑提案'), icon: 'ri-draft-line', actionType: 'invoke' },
        { key: 'cut_update_edit_proposal', label: i18n('Review Edit Proposal', '审阅剪辑提案'), icon: 'ri-list-check-3', actionType: 'invoke' },
        { key: 'cut_apply_edit_proposal', label: i18n('Apply Edit Proposal', '应用剪辑提案'), icon: 'ri-check-double-line', actionType: 'invoke' },
        { key: 'cut_reject_edit_proposal', label: i18n('Reject Edit Proposal', '拒绝剪辑提案'), icon: 'ri-close-circle-line', actionType: 'invoke' },
        { key: 'cut_revert_edit_proposal', label: i18n('Revert Edit Proposal', '回滚剪辑提案'), icon: 'ri-arrow-go-back-line', actionType: 'invoke' },
        { key: 'cut_start_headless_export', label: i18n('Background Export', '后台导出'), icon: 'ri-movie-2-line', placement: 'toolbar', actionType: 'invoke' },
        { key: 'cut_cancel_analysis_job', label: i18n('Cancel Analysis Job', '取消分析任务'), icon: 'ri-stop-circle-line', actionType: 'invoke' },
        { key: 'cut_upload_media_file', label: i18n('Upload Media', '上传媒体'), icon: 'ri-upload-cloud-line', placement: 'toolbar', actionType: 'invoke', transport: 'file' },
        { key: 'cut_import_subtitle_file', label: i18n('Import Subtitles', '导入字幕'), icon: 'ri-subtitle-line', actionType: 'invoke', transport: 'file' },
        { key: 'cut_save_export_file', label: i18n('Save Video Export', '保存视频导出'), icon: 'ri-save-2-line', actionType: 'invoke', transport: 'file' }
      ]
    }
    return [manifest]
  }

  async resolveViewFile(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    request: CutViewFileAccessRequest
  ) {
    if (viewKey !== CUT_WORKBENCH_VIEW_KEY || !request.targetId) {
      throw new Error('Cut file access request is invalid.')
    }
    return request.purpose === 'download'
      ? this.service.resolveExportFile(scopeFromContext(context), request.targetId, request.fileKey)
      : this.service.resolveMediaFile(scopeFromContext(context), request.targetId, request.fileKey)
  }

  async getRemoteComponentEntry(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    component: XpertRemoteComponentViewSchema['component']
  ): Promise<XpertRemoteComponentEntry> {
    if (viewKey !== CUT_WORKBENCH_VIEW_KEY || component.entry !== CUT_REMOTE_ENTRY_KEY) {
      return { html: '<!doctype html><html><body>Unsupported Cut component.</body></html>', contentType: 'text/html; charset=utf-8' }
    }
    const componentDir = join(moduleDir, 'remote-components', CUT_REMOTE_ENTRY_KEY)
    const appScript = await readFile(join(componentDir, 'app.js'), 'utf8')
    const cssPath = join(componentDir, 'app.css')
    const appCss = existsSync(cssPath) ? await readFile(cssPath, 'utf8') : ''
    return {
      html: renderRemoteReactIframeHtml({
        title: 'Cut Workbench',
        lang: htmlLang(context.locale),
        reactUmd: await readPackageFile('react', 'umd/react.production.min.js'),
        reactDomUmd: await readPackageFile('react-dom', 'umd/react-dom.production.min.js'),
        appScript,
        appCss
      }),
      contentType: 'text/html; charset=utf-8'
    }
  }

  async getViewData(context: XpertResolvedViewHostContext, viewKey: string, query: XpertViewQuery): Promise<XpertViewDataResult> {
    if (viewKey !== CUT_WORKBENCH_VIEW_KEY) return {}
    const scope = scopeFromContext(context)
    const projects = await this.service.searchProjects(scope, { search: query.search, page: query.page, pageSize: query.pageSize })
    const selectedId = stringParameter(query.parameters, 'projectId') ?? query.selectionId ?? projects.items[0]?.id
    const detail = selectedId ? await this.service.getProject(scope, String(selectedId)).catch(() => null) : null
    const captionDrafts = selectedId ? await this.captions.listCaptionDrafts(scope, String(selectedId)).catch(() => []) : []
    const analysisJobs = selectedId ? await this.captions.listAnalysisJobs(scope, String(selectedId)).catch(() => []) : []
    const mediaSegments = selectedId ? await this.intelligence.listSegments(scope, String(selectedId), 50).catch(() => []) : []
    const editProposals = selectedId ? await this.proposals.list(scope, String(selectedId), 30).catch(() => []) : []
    const renderCapability = await this.renders.getCapability().catch((error) => ({
      available: false as const,
      backend: 'sandbox-job' as const,
      reason: 'CAPABILITY_CHECK_FAILED',
      message: actionError(error, 'Cut render capability check failed.'),
      limits: { maxVariants: 5, maxDurationSeconds: 600, maxFrames: 18_000, maxWidth: 3840, maxHeight: 2160, maxFps: 60, maxMediaBytes: 4 * 1024 * 1024 * 1024 }
    }))
    const result: CutWorkbenchData = {
      projects,
      detail: detail ? sanitizeDetail(detail) : null,
      captionDrafts,
      analysisJobs,
      mediaSegments: mediaSegments.map((segment) => ({ ...segment, thumbnail: null })),
      editProposals,
      renderCapability
    }
    return result
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    if (viewKey !== CUT_WORKBENCH_VIEW_KEY) return failure('Unsupported Cut view.')
    try {
      const scope = scopeFromContext(context)
      if (actionKey === 'cut_refresh') return success('Cut Workbench refreshed.')
      if (actionKey === 'cut_create_project') {
        const result = await this.service.createProject(scope, {
          title: requiredString(request.input, 'title', 'Cut project title is required.'),
          brief: inputString(request.input, 'brief'),
          width: inputNumber(request.input, 'width'),
          height: inputNumber(request.input, 'height'),
          fps: inputNumber(request.input, 'fps'),
          durationSeconds: inputNumber(request.input, 'durationSeconds'),
          changeSummary: inputString(request.input, 'changeSummary') ?? 'Created a Cut project from Workbench.'
        })
        return { ...success('Cut project created.'), data: sanitizeDetail(result) }
      }
      if (actionKey === 'cut_save_project') {
        const result = await this.service.saveProject(scope, {
          projectId: requestProjectId(request),
          document: requiredObject(request.input, 'document', 'Cut project document is required.') as CutProjectDocument,
          baseRevision: inputNumber(request.input, 'baseRevision'),
          changeSummary: inputString(request.input, 'changeSummary') ?? 'Saved Cut timeline from Workbench.'
        })
        return { ...success('Cut timeline saved.'), refresh: false, data: sanitizeMutation(result) }
      }
      if (actionKey === 'cut_apply_edit') {
        const result = await this.service.applyEdit(scope, {
          projectId: requestProjectId(request),
          operation: requiredObject(request.input, 'operation', 'Cut operation is required.') as never,
          baseRevision: inputNumber(request.input, 'baseRevision'),
          changeSummary: inputString(request.input, 'changeSummary') ?? 'Applied Cut timeline edit from Workbench.'
        })
        return { ...success('Cut edit applied.'), refresh: false, data: sanitizeMutation(result) }
      }
      if (actionKey === 'cut_finalize_version') {
        const result = await this.service.finalizeVersion(
          scope,
          requestProjectId(request),
          requiredNumber(request.input, 'baseRevision', 'Cut base revision is required.'),
          inputString(request.input, 'changeSummary') ?? 'Finalized Cut Workbench version.'
        )
        return { ...success('Cut version finalized.'), data: result }
      }
      if (actionKey === 'cut_get_caption_draft') {
        const result = await this.captions.getCaptionDraft(
          scope,
          requestProjectId(request),
          requiredString(request.input, 'draftId', 'Cut caption draft id is required.'),
          inputNumber(request.input, 'page'),
          inputNumber(request.input, 'pageSize')
        )
        return { ...success('Cut caption draft loaded.'), refresh: false, data: result }
      }
      if (actionKey === 'cut_update_caption_draft') {
        const result = await this.captions.updateCaptionDraft(scope, {
          projectId: requestProjectId(request),
          draftId: requiredString(request.input, 'draftId', 'Cut caption draft id is required.'),
          baseRevision: requiredNumber(request.input, 'baseRevision', 'Cut base revision is required.'),
          baseDraftRevision: requiredNumber(request.input, 'baseDraftRevision', 'Cut caption draft revision is required.'),
          operation: requiredObject(request.input, 'operation', 'Cut caption edit operation is required.') as CutCaptionDraftEditOperation,
          changeSummary: inputString(request.input, 'changeSummary') ?? 'Updated Cut caption draft from Workbench.'
        })
        return { ...success('Cut caption draft updated.'), refresh: false, data: result }
      }
      if (actionKey === 'cut_commit_caption_draft') {
        const result = await this.captions.commitCaptionDraft(scope, {
          projectId: requestProjectId(request),
          draftId: requiredString(request.input, 'draftId', 'Cut caption draft id is required.'),
          baseRevision: requiredNumber(request.input, 'baseRevision', 'Cut base revision is required.'),
          baseDraftRevision: requiredNumber(request.input, 'baseDraftRevision', 'Cut caption draft revision is required.'),
          targetTrackId: inputString(request.input, 'targetTrackId'),
          changeSummary: inputString(request.input, 'changeSummary') ?? 'Committed Cut caption draft from Workbench.'
        })
        return { ...success('Cut caption draft committed.'), refresh: true, data: result }
      }
      if (actionKey === 'cut_import_local_transcription') {
        const result = await this.captions.importLocalTranscription(scope, {
          projectId: requestProjectId(request),
          mediaAssetId: requiredString(request.input, 'mediaAssetId', 'Cut media asset id is required.'),
          baseRevision: requiredNumber(request.input, 'baseRevision', 'Cut base revision is required.'),
          language: requiredString(request.input, 'language', 'Cut transcription language is required.'),
          model: requiredString(request.input, 'model', 'Cut local transcription model is required.'),
          device: inputLocalTranscriptionDevice(request.input),
          duration: requiredNumber(request.input, 'duration', 'Cut local transcription duration is required.'),
          segments: requiredArray(request.input, 'segments', 'Cut local transcription segments are required.') as never,
          idempotencyKey: inputString(request.input, 'idempotencyKey'),
          changeSummary: inputString(request.input, 'changeSummary') ?? 'Saved browser Whisper transcription as a reviewable Cut caption draft.'
        })
        return { ...success('Cut local transcription saved as a reviewable draft.'), refresh: true, data: result }
      }
      if (actionKey === 'cut_import_local_media_analysis') {
        const result = await this.intelligence.importLocalAnalysis(scope, {
          projectId: requestProjectId(request),
          mediaAssetId: requiredString(request.input, 'mediaAssetId', 'Cut media asset id is required.'),
          baseRevision: requiredNumber(request.input, 'baseRevision', 'Cut base revision is required.'),
          analyzerVersion: requiredString(request.input, 'analyzerVersion', 'Cut media analyzer version is required.'),
          duration: requiredNumber(request.input, 'duration', 'Cut media analysis duration is required.'),
          segments: requiredArray(request.input, 'segments', 'Cut media analysis segments are required.') as never,
          idempotencyKey: inputString(request.input, 'idempotencyKey'),
          changeSummary: inputString(request.input, 'changeSummary') ?? 'Saved browser media evidence for Agent search.'
        })
        return { ...success('Cut media analysis saved for Agent search.'), refresh: true, data: result }
      }
      if (actionKey === 'cut_get_edit_proposal') {
        const result = await this.proposals.get(
          scope,
          requestProjectId(request),
          requiredString(request.input, 'proposalId', 'Cut edit proposal id is required.'),
          true
        )
        return { ...success('Cut edit proposal loaded.'), refresh: false, data: sanitizeProposal(result) }
      }
      if (actionKey === 'cut_update_edit_proposal') {
        const result = await this.proposals.update(scope, {
          projectId: requestProjectId(request),
          proposalId: requiredString(request.input, 'proposalId', 'Cut edit proposal id is required.'),
          baseProposalRevision: requiredNumber(request.input, 'baseProposalRevision', 'Cut proposal revision is required.'),
          itemUpdates: requiredArray(request.input, 'itemUpdates', 'Cut proposal item updates are required.') as never,
          reviewNote: inputString(request.input, 'reviewNote'),
          changeSummary: inputString(request.input, 'changeSummary') ?? 'Reviewed Cut edit proposal in Workbench.'
        })
        return { ...success('Cut edit proposal review updated.'), refresh: false, data: sanitizeProposal(result) }
      }
      if (actionKey === 'cut_apply_edit_proposal') {
        const result = await this.proposals.apply(scope, {
          projectId: requestProjectId(request),
          proposalId: requiredString(request.input, 'proposalId', 'Cut edit proposal id is required.'),
          baseRevision: requiredNumber(request.input, 'baseRevision', 'Cut base revision is required.'),
          baseProposalRevision: requiredNumber(request.input, 'baseProposalRevision', 'Cut proposal revision is required.'),
          changeSummary: inputString(request.input, 'changeSummary') ?? 'Applied reviewed Cut edit proposal from Workbench.'
        })
        return { ...success('Cut edit proposal applied.'), refresh: true, data: result }
      }
      if (actionKey === 'cut_reject_edit_proposal') {
        const result = await this.proposals.reject(scope, {
          projectId: requestProjectId(request),
          proposalId: requiredString(request.input, 'proposalId', 'Cut edit proposal id is required.'),
          baseProposalRevision: requiredNumber(request.input, 'baseProposalRevision', 'Cut proposal revision is required.'),
          reviewNote: inputString(request.input, 'reviewNote'),
          changeSummary: inputString(request.input, 'changeSummary') ?? 'Rejected Cut edit proposal from Workbench.'
        })
        return { ...success('Cut edit proposal rejected.'), refresh: true, data: result }
      }
      if (actionKey === 'cut_revert_edit_proposal') {
        const result = await this.proposals.revert(scope, {
          projectId: requestProjectId(request),
          proposalId: requiredString(request.input, 'proposalId', 'Cut edit proposal id is required.'),
          baseRevision: requiredNumber(request.input, 'baseRevision', 'Cut base revision is required.'),
          changeSummary: inputString(request.input, 'changeSummary') ?? 'Reverted applied Cut edit proposal from Workbench.'
        })
        return { ...success('Cut edit proposal reverted.'), refresh: true, data: result }
      }
      if (actionKey === 'cut_start_headless_export') {
        const result = await this.renders.start(scope, {
          projectId: requestProjectId(request),
          baseRevision: requiredNumber(request.input, 'baseRevision', 'Cut base revision is required.'),
          variants: optionalArray(request.input, 'variants') as never,
          exportSettings: inputExportSettings(request.input),
          idempotencyKey: inputString(request.input, 'idempotencyKey'),
          changeSummary: inputString(request.input, 'changeSummary') ?? 'Queued a revision-bound Cut background video export.'
        })
        return { ...success('Cut background video export queued.'), refresh: true, data: result }
      }
      if (actionKey === 'cut_cancel_analysis_job') {
        const projectId = requestProjectId(request)
        const jobId = requiredString(request.input, 'jobId', 'Cut analysis job id is required.')
        const changeSummary = inputString(request.input, 'changeSummary') ?? 'Cancelled Cut analysis job from Workbench.'
        const job = await this.captions.getAnalysisJob(scope, projectId, jobId)
        const result = job.type === 'render'
          ? await this.renders.cancel(scope, projectId, jobId, changeSummary)
          : await this.captions.cancelAnalysisJob(scope, projectId, jobId, changeSummary)
        return { ...success('Cut analysis job cancellation requested.'), refresh: true, data: result }
      }
      return failure('Unsupported Cut action.')
    } catch (error) {
      return failure(actionError(error, 'Cut action failed.'))
    }
  }

  async executeViewFileAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest,
    file: XpertViewFileActionFile
  ): Promise<XpertViewActionResult> {
    if (viewKey !== CUT_WORKBENCH_VIEW_KEY) return failure('Unsupported Cut view.')
    try {
      const scope = scopeFromContext(context)
      if (actionKey === 'cut_upload_media_file') {
        const mediaMetadata = {
          duration: inputNumber(request.input, 'duration'),
          codedWidth: inputNumber(request.input, 'codedWidth'),
          codedHeight: inputNumber(request.input, 'codedHeight'),
          displayWidth: inputNumber(request.input, 'displayWidth'),
          displayHeight: inputNumber(request.input, 'displayHeight'),
          rotationDegrees: inputNumber(request.input, 'rotationDegrees')
        }
        const result = await this.service.uploadMedia(scope, requestProjectId(request), {
          buffer: file.buffer, originalName: file.originalname, mimeType: file.mimetype, size: file.size
        }, mediaMetadata.duration, requiredNumber(request.input, 'baseRevision', 'Cut base revision is required.'), inputString(request.input, 'changeSummary') ?? `Uploaded ${file.originalname ?? 'Cut media'}.`, mediaMetadata)
        return { ...success('Cut media uploaded.'), data: sanitizeMutation(result) }
      }
      if (actionKey === 'cut_import_subtitle_file') {
        const result = await this.captions.importSubtitle(scope, {
          projectId: requestProjectId(request),
          baseRevision: requiredNumber(request.input, 'baseRevision', 'Cut base revision is required.'),
          language: inputString(request.input, 'language') ?? 'und',
          format: inputSubtitleFormat(request.input),
          changeSummary: inputString(request.input, 'changeSummary') ?? `Imported ${file.originalname ?? 'Cut subtitles'}.`
        }, { buffer: file.buffer, name: file.originalname ?? 'captions.srt' })
        return { ...success('Cut subtitles imported as a reviewable draft.'), data: result }
      }
      if (actionKey === 'cut_save_export_file') {
        const result = await this.service.saveExport(scope, requestProjectId(request), {
          buffer: file.buffer, originalName: file.originalname, mimeType: file.mimetype, size: file.size
        }, inputString(request.input, 'changeSummary') ?? 'Saved browser-rendered Cut video export.')
        return { ...success('Cut video export saved.'), data: { success: true, export: sanitizeExport(result.export) } }
      }
      return failure('Unsupported Cut file action.')
    } catch (error) {
      return failure(actionError(error, 'Cut file action failed.'))
    }
  }
}

async function readPackageFile(packageName: string, relativePath: string) {
  const root = dirname(requireFromHere.resolve(`${packageName}/package.json`))
  return readFile(join(root, relativePath), 'utf8')
}

function scopeFromContext(context: XpertResolvedViewHostContext): CutScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId ?? null,
    workspaceId: context.workspaceId ?? null,
    projectId: (context as ProjectContext).projectId ?? null,
    userId: context.userId ?? null,
    assistantId: context.hostType === 'agent' ? context.hostId : null
  }
}

function sanitizeDetail(detail: Awaited<ReturnType<CutService['getProject']>>) {
  return {
    ...detail,
    document: sanitizeDocument(detail.document),
    media: detail.media.map(({ fileReference: _fileReference, previewUrl: _previewUrl, ...asset }) => asset),
    exports: detail.exports.map(sanitizeExport)
  }
}

function sanitizeMutation<T extends { document?: CutProjectDocument; media?: object }>(result: T) {
  const media = result.media && 'fileReference' in result.media
    ? (({ fileReference: _fileReference, previewUrl: _previewUrl, ...rest }) => rest)(
        result.media as { fileReference: object; previewUrl?: string | null }
      )
    : result.media
  return { ...result, ...(result.document ? { document: sanitizeDocument(result.document) } : {}), ...(media ? { media } : {}) }
}

function sanitizeDocument(document: CutProjectDocument): CutProjectDocument {
  return {
    ...document,
    tracks: document.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => {
        const workspaceBacked = Boolean(clip.mediaAssetId) || clip.source?.source === 'platform.workspace.files'
        const { source: _source, previewUrl: _previewUrl, ...sanitized } = clip
        return workspaceBacked ? sanitized : { ...sanitized, ...(clip.previewUrl ? { previewUrl: clip.previewUrl } : {}) }
      })
    }))
  }
}

function sanitizeExport(record: { fileReference?: object; [key: string]: object | string | number | null | undefined }) {
  const { fileReference: _fileReference, fileUrl: _fileUrl, ...rest } = record
  return rest
}

function sanitizeProposal<T extends { preview?: { document?: CutProjectDocument } }>(result: T): T {
  const sanitized = sanitizeEvidenceThumbnails(result)
  if (!sanitized.preview?.document) return sanitized
  return { ...sanitized, preview: { ...sanitized.preview, document: sanitizeDocument(sanitized.preview.document) } }
}

function sanitizeEvidenceThumbnails<T>(value: T): T {
  if (Array.isArray(value)) return value.map(sanitizeEvidenceThumbnails) as T
  if (!value || typeof value !== 'object') return value
  const record = value as Record<string, unknown>
  return Object.fromEntries(Object.entries(record).map(([key, item]) => [
    key,
    key === 'thumbnail' ? null : sanitizeEvidenceThumbnails(item)
  ])) as T
}

function requestProjectId(request: XpertViewActionRequest) {
  const value = inputString(request.input, 'projectId') ?? stringParameter(request.parameters, 'projectId') ?? request.targetId
  if (!value) throw new Error('Cut project id is required.')
  return value
}

function inputRecord(input: XpertViewActionRequest['input']): Record<string, CutJsonObject[string]> {
  return input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, CutJsonObject[string]> : {}
}

function inputString(input: XpertViewActionRequest['input'], key: string) {
  const value = inputRecord(input)[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function requiredString(input: XpertViewActionRequest['input'], key: string, message: string) {
  const value = inputString(input, key)
  if (!value) throw new Error(message)
  return value
}

function inputNumber(input: XpertViewActionRequest['input'], key: string) {
  const value = inputRecord(input)[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function inputSubtitleFormat(input: XpertViewActionRequest['input']): CutSubtitleFormat | undefined {
  const value = inputString(input, 'format')
  return value === 'srt' || value === 'vtt' || value === 'ass' ? value : undefined
}

function inputExportSettings(input: XpertViewActionRequest['input']) {
  const value = inputRecord(input).exportSettings
  if (!value || typeof value !== 'object' || Array.isArray(value)) return normalizeCutExportSettings()
  return normalizeCutExportSettings({
    format: isCutExportFormat(value.format) ? value.format : undefined,
    quality: isCutExportQuality(value.quality) ? value.quality : undefined,
    includeAudio: typeof value.includeAudio === 'boolean' ? value.includeAudio : undefined
  })
}

function requiredNumber(input: XpertViewActionRequest['input'], key: string, message: string) {
  const value = inputNumber(input, key)
  if (value === undefined) throw new Error(message)
  return value
}

function requiredObject(input: XpertViewActionRequest['input'], key: string, message: string): object {
  const value = inputRecord(input)[key]
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message)
  return value
}

function requiredArray(input: XpertViewActionRequest['input'], key: string, message: string): CutJsonObject[string][] {
  const value = inputRecord(input)[key]
  if (!Array.isArray(value) || !value.length) throw new Error(message)
  return value
}

function optionalArray(input: XpertViewActionRequest['input'], key: string): CutJsonObject[string][] | undefined {
  const value = inputRecord(input)[key]
  return Array.isArray(value) && value.length ? value : undefined
}

function inputLocalTranscriptionDevice(input: XpertViewActionRequest['input']): 'webgpu' | 'wasm' {
  const value = inputString(input, 'device')
  if (value !== 'webgpu' && value !== 'wasm') throw new Error('Cut local transcription device must be webgpu or wasm.')
  return value
}

function stringParameter(parameters: XpertViewQuery['parameters'] | XpertViewActionRequest['parameters'], key: string) {
  const value = parameters?.[key]
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : undefined
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function success(message: string): XpertViewActionResult {
  return { success: true, message: i18n(message, message) }
}

function failure(message: string): XpertViewActionResult {
  return { success: false, message: i18n(message, message) }
}

function actionError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function htmlLang(locale: string | null | undefined) {
  if (!locale) return 'en'
  return locale.toLowerCase().startsWith('zh') ? 'zh-CN' : locale.replace('_', '-')
}
