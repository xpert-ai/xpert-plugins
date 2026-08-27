import {
  CUT_ACCEPT_STORY_HANDOFF_TOOL_NAME,
  CUT_ADD_CLIP_TOOL_NAME,
  CUT_APPLY_EDIT_PROPOSAL_TOOL_NAME,
  CUT_CANCEL_ANALYSIS_JOB_TOOL_NAME,
  CUT_COMMIT_CAPTION_DRAFT_TOOL_NAME,
  CUT_CREATE_EDIT_PROPOSAL_TOOL_NAME,
  CUT_CREATE_SPEECH_CLEANUP_PROPOSAL_TOOL_NAME,
  CUT_FINALIZE_VERSION_TOOL_NAME,
  CUT_IMPORT_MEDIA_TOOL_NAME,
  CUT_IMPORT_SUBTITLE_TOOL_NAME,
  CUT_MIDDLEWARE_TOOL_NAMES,
  CUT_REJECT_EDIT_PROPOSAL_TOOL_NAME,
  CUT_REVERT_EDIT_PROPOSAL_TOOL_NAME,
  CUT_START_HEADLESS_EXPORT_TOOL_NAME,
  CUT_START_TRANSCRIPTION_TOOL_NAME
} from './constants.js'
import type { CutCaptionService } from './cut-caption.service.js'
import type { CutMediaIntelligenceService } from './cut-media-intelligence.service.js'
import { CutMiddleware } from './cut.middleware.js'
import { createCutNativeCapabilityDefinitions } from './cut-native-capabilities.js'
import type { CutProposalService } from './cut-proposal.service.js'
import type { CutRenderService } from './cut-render.service.js'
import type { CutService } from './cut.service.js'

describe('Cut native MCP capabilities', () => {
  const definitions = createCutNativeCapabilityDefinitions(
    new CutMiddleware(
      {} as CutService,
      {} as CutCaptionService,
      {} as CutMediaIntelligenceService,
      {} as CutProposalService,
      {} as CutRenderService
    ),
    {
      tenantId: 'tenant-1',
      organizationId: 'organization-1',
      userId: 'user-1',
      xpertFeatures: null,
      runtime: {}
    }
  )

  it('classifies every original Cut operation exactly once', () => {
    expect(definitions.tools).toHaveLength(43)
    expect(definitions.resourceTemplates).toHaveLength(7)
    expect(
      new Set([...definitions.tools.map(({ name }) => name), ...definitions.resourceTemplates.map(({ key }) => key)])
    ).toEqual(new Set(CUT_MIDDLEWARE_TOOL_NAMES))
  })

  it('declares transcription and headless export as MCP tasks', () => {
    expect(definitions.tools.find(({ name }) => name === CUT_START_TRANSCRIPTION_TOOL_NAME)?.task).toEqual({
      mode: 'optional',
      maxLifetimeMs: 3_600_000
    })
    expect(definitions.tools.find(({ name }) => name === CUT_START_HEADLESS_EXPORT_TOOL_NAME)?.task).toEqual({
      mode: 'optional',
      maxLifetimeMs: 3_600_000
    })
  })

  it('classifies replay-safe writes as idempotent without weakening ordinary writes', () => {
    for (const name of [
      CUT_ACCEPT_STORY_HANDOFF_TOOL_NAME,
      CUT_APPLY_EDIT_PROPOSAL_TOOL_NAME,
      CUT_CANCEL_ANALYSIS_JOB_TOOL_NAME,
      CUT_COMMIT_CAPTION_DRAFT_TOOL_NAME,
      CUT_CREATE_EDIT_PROPOSAL_TOOL_NAME,
      CUT_CREATE_SPEECH_CLEANUP_PROPOSAL_TOOL_NAME,
      CUT_IMPORT_SUBTITLE_TOOL_NAME,
      CUT_REJECT_EDIT_PROPOSAL_TOOL_NAME,
      CUT_REVERT_EDIT_PROPOSAL_TOOL_NAME,
      CUT_START_HEADLESS_EXPORT_TOOL_NAME,
      CUT_START_TRANSCRIPTION_TOOL_NAME
    ]) {
      expect(definitions.tools.find((tool) => tool.name === name)?.behavior.idempotency).toBe('idempotent')
    }

    expect(definitions.tools.find((tool) => tool.name === CUT_FINALIZE_VERSION_TOOL_NAME)?.behavior.idempotency).toBe(
      'non_idempotent'
    )
    expect(definitions.tools.find((tool) => tool.name === CUT_ADD_CLIP_TOOL_NAME)?.behavior.idempotency).toBe(
      'non_idempotent'
    )
    expect(definitions.tools.find((tool) => tool.name === CUT_CANCEL_ANALYSIS_JOB_TOOL_NAME)?.behavior.risk).toBe(
      'dangerous'
    )
  })

  it('requires a portable scoped file reference for MCP imports', () => {
    const importMedia = definitions.tools.find(({ name }) => name === CUT_IMPORT_MEDIA_TOOL_NAME)
    expect(importMedia).toBeDefined()
    const common = {
      projectId: 'ca8cfba3-a8e6-4e97-839d-f4fe6d8203f2',
      baseRevision: 1,
      changeSummary: 'Import source media'
    }
    expect(importMedia?.inputSchema.safeParse({ ...common, file: '/workspace/source.mp4' }).success).toBe(false)
    expect(
      importMedia?.inputSchema.safeParse({
        ...common,
        file: {
          source: 'platform.workspace.files',
          tenantId: 'tenant-1',
          organizationId: 'organization-1',
          catalog: 'projects',
          scopeId: 'project-volume-1',
          projectId: 'project-volume-1',
          filePath: 'uploads/source.mp4',
          workspacePath: '/workspace/uploads/source.mp4'
        }
      }).success
    ).toBe(true)
  })

  it('provides workflow prompts in the requested language', async () => {
    expect(definitions.prompts).toHaveLength(4)
    const prompt = await definitions.prompts[0].get(
      { projectId: 'ca8cfba3-a8e6-4e97-839d-f4fe6d8203f2', language: 'zh-Hans' },
      {
        source: 'mcp',
        tenantId: 'tenant-1',
        principal: { type: 'service_account', id: 'client-1' },
        executionId: 'execution-1',
        requestId: 'request-1',
        host: {}
      }
    )
    const content = prompt.messages[0]?.content
    expect(content?.type).toBe('text')
    if (content?.type !== 'text') {
      throw new Error('Expected the Cut workflow prompt to return text content.')
    }
    expect(content.text).toContain('Cut 项目')
  })
})
jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => (target: object) => target,
  BuiltinToolset: class BuiltinToolset {},
  DefaultRuntimeCapabilityRegistry: class DefaultRuntimeCapabilityRegistry {
    register() {
      return this
    }
  },
  RequestContext: { getOrganizationId: () => 'organization-1' },
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
jest.mock('./cut-media-intelligence.service.js', () => ({
  CutMediaIntelligenceService: class CutMediaIntelligenceService {}
}))
jest.mock('./cut-proposal.service.js', () => ({ CutProposalService: class CutProposalService {} }))
jest.mock('./cut-render.service.js', () => ({ CutRenderService: class CutRenderService {} }))
