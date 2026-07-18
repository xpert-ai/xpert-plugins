import type { AgentMiddleware, IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => (target: object) => target,
  RequestContext: { getOrganizationId: () => 'org-a' },
  WorkspaceFilesRuntimeCapability: { id: 'platform.workspace.files' }
}))
jest.mock('@langchain/core/callbacks/dispatch', () => ({ dispatchCustomEvent: jest.fn() }))
jest.mock('@langchain/core/tools', () => ({ tool: (invoke: object, config: object) => ({ ...config, invoke }) }))
jest.mock('@xpert-ai/contracts', () => ({
  ChatMessageEventTypeEnum: { ON_TOOL_MESSAGE: 'on_tool_message' },
  ChatMessageStepCategory: { Program: 'program' }
}))
jest.mock('./cut.service.js', () => ({ CutService: class CutService {} }))
jest.mock('./cut-caption.service.js', () => ({ CutCaptionService: class CutCaptionService {} }))
jest.mock('./cut-media-intelligence.service.js', () => ({ CutMediaIntelligenceService: class CutMediaIntelligenceService {} }))
jest.mock('./cut-proposal.service.js', () => ({ CutProposalService: class CutProposalService {} }))
jest.mock('./cut-render.service.js', () => ({ CutRenderService: class CutRenderService {} }))

import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import {
  CUT_APPLY_BATCH_TOOL_NAME,
  CUT_APPLY_EDIT_TOOL_NAME,
  CUT_CREATE_EDIT_PROPOSAL_TOOL_NAME,
  CUT_GET_CLIP_TOOL_NAME,
  CUT_GET_MEDIA_ASSET_TOOL_NAME,
  CUT_GET_PROJECT_TOOL_NAME,
  CUT_LIST_CLIPS_TOOL_NAME,
  CUT_LIST_MEDIA_ASSETS_TOOL_NAME,
  CUT_LIST_PROJECT_RESOURCES_TOOL_NAME,
  CUT_LIST_TRACKS_TOOL_NAME,
  CUT_MIDDLEWARE_TOOL_NAMES,
  CUT_SEARCH_MEDIA_SEGMENTS_TOOL_NAME,
  CUT_START_HEADLESS_EXPORT_TOOL_NAME,
  CUT_START_TRANSCRIPTION_TOOL_NAME,
  CUT_UPDATE_PROJECT_SETTINGS_TOOL_NAME,
  CUT_UPDATE_TRANSFORM_TOOL_NAME
} from './constants.js'
import { createStarterCutProject } from './cut-project.js'
import { CutMiddleware } from './cut.middleware.js'
import type { CutCaptionService } from './cut-caption.service.js'
import type { CutMediaIntelligenceService } from './cut-media-intelligence.service.js'
import type { CutProposalService } from './cut-proposal.service.js'
import type { CutRenderService } from './cut-render.service.js'
import type { CutService } from './cut.service.js'

describe('CutMiddleware', () => {
  it('resolves an omitted or invalid projectId from the active Cut Workbench context before schema validation', async () => {
    const currentProjectId = '11111111-1111-4111-8111-111111111111'
    const getProjectSummary = jest.fn(async (_scope, projectId) => ({
      project: { id: projectId, title: 'Current project', revision: 7 },
      settings: { width: 1920, height: 1080, fps: 30, durationSeconds: 30, background: '#000000' },
      timeline: { trackCount: 2, clipCount: 1 },
      resources: { mediaAssets: 1 },
      availableReads: [{ tool: CUT_LIST_CLIPS_TOOL_NAME, expectedRevision: 7 }]
    }))
    const middleware = new CutMiddleware(
      { getProjectSummary } as unknown as CutService,
      {} as CutCaptionService,
      {} as CutMediaIntelligenceService,
      {} as CutProposalService,
      {} as CutRenderService
    ).createMiddleware({}, middlewareContext()) as AgentMiddleware
    const getProjectTool = middleware.tools?.find((item) => item.name === CUT_GET_PROJECT_TOOL_NAME) as unknown as {
      schema: { parse(value: unknown): { projectId?: string } }
      invoke(input: object): Promise<string>
    }
    expect(getProjectTool.schema.parse({})).toEqual({})

    const handler = jest.fn(async (request: { toolCall: { args: object } }) => {
      const input = getProjectTool.schema.parse(request.toolCall.args)
      return getProjectTool.invoke(input)
    })
    const runtime = {
      context: {
        cut: { currentProject: { id: currentProjectId, revision: 7, dirty: false } },
        env: { cutProjectId: currentProjectId, cutRevision: '7' }
      }
    }
    const result = await middleware.wrapToolCall!(
      { toolCall: { id: 'get-current-project', name: CUT_GET_PROJECT_TOOL_NAME, args: { projectId: 'currentProject' } }, runtime } as never,
      handler as never
    )

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      toolCall: expect.objectContaining({ args: { projectId: currentProjectId } })
    }))
    expect(getProjectSummary).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-a' }), currentProjectId)
    const parsedResult = JSON.parse(String(result))
    expect(parsedResult).toMatchObject({ project: { id: currentProjectId, revision: 7 }, timeline: { clipCount: 1 } })
    expect(parsedResult).not.toHaveProperty('document')
    expect(parsedResult).not.toHaveProperty('media')
  })

  it('keeps a valid explicit projectId and returns a tool error when neither input nor context identifies a project', async () => {
    const middleware = new CutMiddleware(
      {} as CutService,
      {} as CutCaptionService,
      {} as CutMediaIntelligenceService,
      {} as CutProposalService,
      {} as CutRenderService
    ).createMiddleware({}, middlewareContext()) as AgentMiddleware
    const explicitProjectId = '22222222-2222-4222-8222-222222222222'
    const explicitHandler = jest.fn(async () => 'explicit')
    await middleware.wrapToolCall!(
      {
        toolCall: { id: 'explicit-project', name: CUT_GET_PROJECT_TOOL_NAME, args: { projectId: explicitProjectId } },
        runtime: { context: { cut: { currentProject: { id: '11111111-1111-4111-8111-111111111111' } } } }
      } as never,
      explicitHandler as never
    )
    expect(explicitHandler).toHaveBeenCalledWith(expect.objectContaining({
      toolCall: expect.objectContaining({ args: { projectId: explicitProjectId } })
    }))

    const missingHandler = jest.fn(async () => 'should-not-run')
    const missing = await middleware.wrapToolCall!(
      { toolCall: { id: 'missing-project', name: CUT_GET_PROJECT_TOOL_NAME, args: {} }, runtime: {} } as never,
      missingHandler as never
    )
    expect(missingHandler).not.toHaveBeenCalled()
    expect((missing as { content: unknown }).content).toContain('no active Cut Workbench project')
  })

  it('adds the current Cut project to the model system message so projectId can be omitted', async () => {
    const middleware = new CutMiddleware(
      {} as CutService,
      {} as CutCaptionService,
      {} as CutMediaIntelligenceService,
      {} as CutProposalService,
      {} as CutRenderService
    ).createMiddleware({}, middlewareContext()) as AgentMiddleware
    const handler = jest.fn(async (_request: { systemMessage?: { content?: unknown } }) => 'ok')
    await middleware.wrapModelCall!(
      {
        systemMessage: 'Base Cut instructions.',
        runtime: {
          configurable: {
            context: {
              env: {
                cutProjectId: '11111111-1111-4111-8111-111111111111',
                cutRevision: '9',
                cutDirty: 'false'
              }
            }
          }
        }
      } as never,
      handler as never
    )
    const prepared = handler.mock.calls[0]?.[0] as { systemMessage?: { content?: unknown } }
    expect(prepared.systemMessage?.content).toContain('projectId: 11111111-1111-4111-8111-111111111111')
    expect(prepared.systemMessage?.content).toContain('Cut tools may omit projectId')
  })

  it('publishes exact cut_ tools and keeps business success when observability events fail', async () => {
    const strategy = new CutMiddleware({} as CutService, {} as CutCaptionService, {} as CutMediaIntelligenceService, {} as CutProposalService, {} as CutRenderService)
    const context = {
      tenantId: 'tenant-a', organizationId: 'org-a', workspaceId: 'workspace-a', projectId: 'project-a',
      userId: 'user-a', xpertId: 'assistant-a', conversationId: 'conversation-a',
      node: {} as never,
      tools: new Map(),
      runtime: { capabilities: { require: jest.fn() } } as never
    } as IAgentMiddlewareContext
    const middleware = strategy.createMiddleware({}, context) as AgentMiddleware
    expect(middleware.tools?.map((item) => item.name)).toEqual([...CUT_MIDDLEWARE_TOOL_NAMES])
    expect(middleware.tools?.map((item) => item.name)).not.toContain('cut_save_project')

    const dispatch = dispatchCustomEvent as jest.MockedFunction<typeof dispatchCustomEvent>
    dispatch.mockRejectedValue(new Error('event bus unavailable'))
    const handler = jest.fn(async () => 'business-result')
    const request = {
      toolCall: {
        id: 'tool-call-1',
        name: CUT_UPDATE_TRANSFORM_TOOL_NAME,
        args: { projectId: '11111111-1111-4111-8111-111111111111', changeSummary: 'Moved the title.' }
      }
    }
    const result = await middleware.wrapToolCall!(request as never, handler as never)
    expect(result).toBe('business-result')
    expect(handler).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledTimes(2)
  })

  it('progressively discloses bounded project details without file references or whole-document saves', async () => {
    const projectId = '11111111-1111-4111-8111-111111111111'
    const mediaAssetId = '22222222-2222-4222-8222-222222222222'
    const service = {
      listTracks: jest.fn(async () => ({ projectId, revision: 7, items: [{ id: 'video-1', clipCount: 1 }] })),
      listClips: jest.fn(async () => ({ projectId, revision: 7, items: [{ id: 'clip-1', mediaAssetId }], total: 1, page: 1, pageSize: 20 })),
      getClip: jest.fn(async () => ({ projectId, revision: 7, clip: { id: 'clip-1', mediaAssetId }, previous: null, next: null })),
      listMediaAssets: jest.fn(async () => ({ projectId, revision: 7, items: [{ id: mediaAssetId, kind: 'video' }], total: 1, page: 1, pageSize: 20 })),
      getMediaAsset: jest.fn(async () => ({ projectId, revision: 7, item: { id: mediaAssetId, kind: 'video' }, evidenceTypes: [], analysisJobIds: [] })),
      listProjectResources: jest.fn(async () => ({ projectId, revision: 7, resource: 'exports', items: [], total: 0, page: 1, pageSize: 20 }))
    }
    const strategy = new CutMiddleware(service as unknown as CutService, {} as CutCaptionService, {} as CutMediaIntelligenceService, {} as CutProposalService, {} as CutRenderService)
    const middleware = strategy.createMiddleware({}, middlewareContext()) as AgentMiddleware
    const invoke = async (name: string, input: object) => {
      const selected = middleware.tools?.find((item) => item.name === name) as unknown as {
        schema: { parse(value: unknown): object }
        invoke(value: object): Promise<string>
      }
      return JSON.parse(await selected.invoke(selected.schema.parse(input))) as Record<string, unknown>
    }

    expect(await invoke(CUT_LIST_TRACKS_TOOL_NAME, { projectId, expectedRevision: 7 })).toMatchObject({ revision: 7 })
    expect(await invoke(CUT_LIST_CLIPS_TOOL_NAME, { projectId, expectedRevision: 7, pageSize: 20 })).toMatchObject({ total: 1 })
    expect(await invoke(CUT_GET_CLIP_TOOL_NAME, { projectId, expectedRevision: 7, clipId: 'clip-1' })).toMatchObject({ clip: { id: 'clip-1' } })
    expect(await invoke(CUT_LIST_MEDIA_ASSETS_TOOL_NAME, { projectId, expectedRevision: 7 })).toMatchObject({ total: 1 })
    expect(await invoke(CUT_GET_MEDIA_ASSET_TOOL_NAME, { projectId, expectedRevision: 7, mediaAssetId })).toMatchObject({ item: { id: mediaAssetId } })
    expect(await invoke(CUT_LIST_PROJECT_RESOURCES_TOOL_NAME, { projectId, expectedRevision: 7, resource: 'exports' })).toMatchObject({ resource: 'exports' })
    const listClipsTool = middleware.tools?.find((item) => item.name === CUT_LIST_CLIPS_TOOL_NAME) as unknown as {
      schema: { parse(value: unknown): object }
    }
    expect(() => listClipsTool.schema.parse({ projectId, pageSize: 101 })).toThrow()
    expect(() => listClipsTool.schema.parse({ projectId, unexpected: true })).toThrow()
  })

  it('reports every changed clip from an atomic edit without returning the timeline', async () => {
    const applyEdit = jest.fn(async () => ({
      success: true,
      project: { id: '11111111-1111-4111-8111-111111111111', revision: 6 },
      document: createStarterCutProject(),
      operation: { kind: 'split', clipId: 'clip-a', at: 2 },
      changedClipIds: ['clip-a', 'clip-b']
    }))
    const middleware = new CutMiddleware({ applyEdit } as unknown as CutService, {} as CutCaptionService, {} as CutMediaIntelligenceService, {} as CutProposalService, {} as CutRenderService)
      .createMiddleware({}, middlewareContext()) as AgentMiddleware
    const editTool = middleware.tools?.find((item) => item.name === CUT_APPLY_EDIT_TOOL_NAME) as unknown as {
      invoke(input: object): Promise<string>
    }
    const output = JSON.parse(await editTool.invoke({
      projectId: '11111111-1111-4111-8111-111111111111',
      operation: { kind: 'split', clipId: 'clip-a', at: 2 },
      baseRevision: 5,
      changeSummary: 'Split the opening clip.'
    })) as Record<string, unknown>
    expect(output).toMatchObject({ revision: 6, operation: 'split', changedClipIds: ['clip-a', 'clip-b'] })
    expect(output).not.toHaveProperty('document')
  })

  it('requires a revision and bounds atomic edit batches', () => {
    const middleware = new CutMiddleware({} as CutService, {} as CutCaptionService, {} as CutMediaIntelligenceService, {} as CutProposalService, {} as CutRenderService).createMiddleware({}, middlewareContext()) as AgentMiddleware
    const batchTool = middleware.tools?.find((item) => item.name === CUT_APPLY_BATCH_TOOL_NAME) as unknown as {
      schema: { parse(value: unknown): unknown }
    }
    expect(() => batchTool.schema.parse({
      projectId: '11111111-1111-4111-8111-111111111111',
      operations: [{ kind: 'move', clipId: 'clip-a', start: 1 }],
      changeSummary: 'Move without a revision.'
    })).toThrow()
    expect(() => batchTool.schema.parse({
      projectId: '11111111-1111-4111-8111-111111111111',
      baseRevision: 2,
      operations: Array.from({ length: 101 }, () => ({ kind: 'move', clipId: 'clip-a', start: 1 })),
      changeSummary: 'Too many edits.'
    })).toThrow()
  })

  it('routes a narrow transform tool through the shared atomic edit service', async () => {
    const applyEdit = jest.fn(async (_scope, input) => ({
      success: true,
      project: { id: input.projectId, revision: 10 },
      document: createStarterCutProject(),
      operation: input.operation,
      changedClipIds: ['clip-a'],
      changedTrackIds: ['track-a']
    }))
    const middleware = new CutMiddleware({ applyEdit } as unknown as CutService, {} as CutCaptionService, {} as CutMediaIntelligenceService, {} as CutProposalService, {} as CutRenderService)
      .createMiddleware({}, middlewareContext()) as AgentMiddleware
    const transformTool = middleware.tools?.find((item) => item.name === CUT_UPDATE_TRANSFORM_TOOL_NAME) as unknown as {
      schema: { parse(value: unknown): object }
      invoke(input: object): Promise<string>
    }
    const input = transformTool.schema.parse({
      projectId: '11111111-1111-4111-8111-111111111111',
      baseRevision: 9,
      operation: { kind: 'update_transform', clipId: 'clip-a', transform: { x: 120, opacity: 0.8 } },
      changeSummary: 'Move and fade the title.'
    })
    const output = JSON.parse(await transformTool.invoke(input)) as Record<string, unknown>
    expect(applyEdit).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      baseRevision: 9,
      operation: { kind: 'update_transform', clipId: 'clip-a', transform: { x: 120, opacity: 0.8 } }
    }))
    expect(output).toMatchObject({
      revision: 10,
      operation: 'update_transform',
      changedClipIds: ['clip-a'],
      changedTrackIds: ['track-a']
    })
    expect(output).not.toHaveProperty('document')
  })

  it('defaults project setting changes to preserving every clip transform', async () => {
    const applyEdit = jest.fn(async (_scope, input) => ({
      success: true,
      project: { id: input.projectId, revision: 11 },
      changedClipIds: [],
      changedTrackIds: []
    }))
    const middleware = new CutMiddleware({ applyEdit } as unknown as CutService, {} as CutCaptionService, {} as CutMediaIntelligenceService, {} as CutProposalService, {} as CutRenderService)
      .createMiddleware({}, middlewareContext()) as AgentMiddleware
    const settingsTool = middleware.tools?.find((item) => item.name === CUT_UPDATE_PROJECT_SETTINGS_TOOL_NAME) as unknown as {
      schema: { parse(value: unknown): object }
      invoke(input: object): Promise<string>
    }
    const input = settingsTool.schema.parse({
      projectId: '11111111-1111-4111-8111-111111111111',
      baseRevision: 10,
      operation: { kind: 'update_project_settings', settings: { width: 1080, height: 1920 } },
      changeSummary: 'Switch the canvas to portrait without changing clip rotations.'
    })
    await settingsTool.invoke(input)
    expect(applyEdit).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      operation: { kind: 'update_project_settings', settings: { width: 1080, height: 1920 }, reframe: 'preserve' }
    }))
  })

  it('queues transcription only from the current Xpert speech-to-text configuration', async () => {
    const startTranscription = jest.fn(async () => ({
      success: true,
      projectId: '11111111-1111-4111-8111-111111111111',
      revision: 5,
      jobId: '33333333-3333-4333-8333-333333333333',
      status: 'queued'
    }))
    const context = {
      ...middlewareContext(),
      xpertId: 'xpert-cut',
      xpertFeatures: {
        speechToText: {
          enabled: true,
          copilotModel: { copilotId: 'copilot-stt', model: 'whisper-large-v3', modelType: 'speech2text' }
        }
      }
    } as IAgentMiddlewareContext
    const middleware = new CutMiddleware({} as CutService, { startTranscription } as unknown as CutCaptionService, {} as CutMediaIntelligenceService, {} as CutProposalService, {} as CutRenderService)
      .createMiddleware({}, context) as AgentMiddleware
    const transcriptionTool = middleware.tools?.find((item) => item.name === CUT_START_TRANSCRIPTION_TOOL_NAME) as unknown as {
      schema: { parse(value: unknown): object }
      invoke(input: object): Promise<string>
    }
    const input = transcriptionTool.schema.parse({
      projectId: '11111111-1111-4111-8111-111111111111',
      mediaAssetId: '22222222-2222-4222-8222-222222222222',
      language: 'en',
      baseRevision: 5,
      changeSummary: 'Transcribe the selected interview.'
    })
    const output = JSON.parse(await transcriptionTool.invoke(input)) as Record<string, unknown>
    expect(startTranscription).toHaveBeenCalledWith(expect.any(Object), input, 'xpert-cut', expect.objectContaining({ model: 'whisper-large-v3' }))
    expect(output).toMatchObject({ status: 'queued', jobId: '33333333-3333-4333-8333-333333333333' })
    expect(() => transcriptionTool.schema.parse({ ...input, unexpected: true })).toThrow()
  })

  it('searches bounded media evidence with a strict read-only schema', async () => {
    const search = jest.fn(async () => ({
      items: [{
        id: 'analysis:22222222-2222-4222-8222-222222222222', mediaAssetId: 'media-a', evidenceType: 'silence', start: 4, end: 6,
        thumbnail: { url: 'https://legacy.example.test/media-a.mp4', time: 4 }
      }],
      total: 1,
      query: '静音',
      limit: 10
    }))
    const middleware = new CutMiddleware(
      {} as CutService,
      {} as CutCaptionService,
      { search } as unknown as CutMediaIntelligenceService,
      {} as CutProposalService,
      {} as CutRenderService
    ).createMiddleware({}, middlewareContext()) as AgentMiddleware
    const searchTool = middleware.tools?.find((item) => item.name === CUT_SEARCH_MEDIA_SEGMENTS_TOOL_NAME) as unknown as {
      schema: { parse(value: unknown): object }
      invoke(input: object): Promise<string>
    }
    expect(() => searchTool.schema.parse({
      projectId: '11111111-1111-4111-8111-111111111111',
      query: '静音',
      evidenceTypes: ['silence'],
      extra: true
    })).toThrow()
    const input = searchTool.schema.parse({
      projectId: '11111111-1111-4111-8111-111111111111',
      query: '静音',
      evidenceTypes: ['silence'],
      limit: 10
    })
    const output = JSON.parse(await searchTool.invoke(input))
    expect(output).toMatchObject({ total: 1, query: '静音', items: [{ thumbnail: null }] })
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-a' }),
      expect.objectContaining({ query: '静音', limit: 10 })
    )
  })

  it('creates evidence-bound proposals through a strict bounded schema', async () => {
    const create = jest.fn(async () => ({
      success: true,
      proposal: {
        id: '44444444-4444-4444-8444-444444444444',
        projectId: '11111111-1111-4111-8111-111111111111',
        sourceRevision: 5,
        revision: 1,
        status: 'draft',
        itemCount: 1,
        enabledItemCount: 1,
        highRiskCount: 0
      },
      idempotentReplay: false
    }))
    const middleware = new CutMiddleware(
      {} as CutService,
      {} as CutCaptionService,
      {} as CutMediaIntelligenceService,
      { create } as unknown as CutProposalService,
      {} as CutRenderService
    ).createMiddleware({}, middlewareContext()) as AgentMiddleware
    const proposalTool = middleware.tools?.find((item) => item.name === CUT_CREATE_EDIT_PROPOSAL_TOOL_NAME) as unknown as {
      schema: { parse(value: unknown): object }
      invoke(input: object): Promise<string>
    }
    const payload = {
      projectId: '11111111-1111-4111-8111-111111111111',
      sourceRevision: 5,
      goal: 'Remove the long pause.',
      items: [{
        operation: { kind: 'trim', clipId: 'clip-a', edge: 'end', time: 8 },
        summary: 'Trim the pause from the interview.',
        evidenceSegmentIds: ['analysis:22222222-2222-4222-8222-222222222222'],
        confidence: 0.9
      }],
      changeSummary: 'Created a reviewable rough-cut proposal.'
    }
    expect(() => proposalTool.schema.parse({ ...payload, unexpected: true })).toThrow()
    expect(() => proposalTool.schema.parse({ ...payload, items: [] })).toThrow()
    const input = proposalTool.schema.parse(payload)
    expect(JSON.parse(await proposalTool.invoke(input))).toMatchObject({ proposal: { status: 'draft', itemCount: 1 } })
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-a' }), input)
  })

  it('queues bounded headless render variants without returning project snapshots', async () => {
    const start = jest.fn(async () => ({
      success: true,
      projectId: '11111111-1111-4111-8111-111111111111',
      sourceRevision: 8,
      jobs: [{ jobId: '55555555-5555-4555-8555-555555555555', variantName: 'vertical', status: 'queued' }]
    }))
    const middleware = new CutMiddleware(
      {} as CutService,
      {} as CutCaptionService,
      {} as CutMediaIntelligenceService,
      {} as CutProposalService,
      { start } as unknown as CutRenderService
    ).createMiddleware({}, middlewareContext()) as AgentMiddleware
    const renderTool = middleware.tools?.find((item) => item.name === CUT_START_HEADLESS_EXPORT_TOOL_NAME) as unknown as {
      schema: { parse(value: unknown): object }
      invoke(input: object): Promise<string>
    }
    const payload = {
      projectId: '11111111-1111-4111-8111-111111111111',
      baseRevision: 8,
      exportSettings: { format: 'webm', quality: 'medium', includeAudio: false },
      variants: [{ name: 'vertical', width: 1080, height: 1920, variables: { customer: 'Acme' } }],
      changeSummary: 'Queued a vertical campaign export.'
    }
    expect(() => renderTool.schema.parse({ ...payload, unexpected: true })).toThrow()
    expect(() => renderTool.schema.parse({ ...payload, exportSettings: { ...payload.exportSettings, format: 'avi' } })).toThrow()
    expect(() => renderTool.schema.parse({ ...payload, variants: Array.from({ length: 6 }, (_, index) => ({ name: `v${index}` })) })).toThrow()
    const input = renderTool.schema.parse(payload)
    const output = JSON.parse(await renderTool.invoke(input))
    expect(output).toMatchObject({ sourceRevision: 8, jobs: [{ variantName: 'vertical', status: 'queued' }] })
    expect(output).not.toHaveProperty('document')
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-a' }), input)
    expect(input).toMatchObject({ exportSettings: { format: 'webm', quality: 'medium', includeAudio: false } })
  })
})

function middlewareContext() {
  return {
    tenantId: 'tenant-a', organizationId: 'org-a', workspaceId: 'workspace-a', projectId: 'project-a',
    userId: 'user-a', xpertId: 'assistant-a', conversationId: 'conversation-a',
    node: {} as never,
    tools: new Map(),
    runtime: { capabilities: { require: jest.fn() } } as never
  } as IAgentMiddlewareContext
}
