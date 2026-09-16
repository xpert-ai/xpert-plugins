import { DecoratedAgentMiddlewareStrategy, DecoratedToolsetStrategy, describeXpertToolProvider,
  type IAgentMiddlewareContext, type ToolExecutionContext } from '@xpert-ai/plugin-sdk'
import { CutToolProvider } from './cut-tool.provider.js'
import { CutMiddleware } from './cut.middleware.js'
import { CUT_MIDDLEWARE_NAME } from './constants.js'
import type { CutService } from './cut.service.js'
import type { CutCaptionService } from './cut-caption.service.js'
import type { CutMediaIntelligenceService } from './cut-media-intelligence.service.js'
import type { CutProposalService } from './cut-proposal.service.js'
import type { CutRenderService } from './cut-render.service.js'

const projectId = '11111111-1111-4111-8111-111111111111'
const context: ToolExecutionContext = { source: 'mcp', tenantId: 'tenant-a',
  principal: { type: 'user', id: 'user-a' }, executionId: 'execution-a', requestId: 'request-a', host: {} }

function fixture() {
  const listTracks = jest.fn(async () => ({ projectId, revision: 1, items: [] }))
  const getProject = jest.fn(async () => ({ projectId, revision: 1 }))
  const service = { listTracks, getProjectSummary: getProject } as Partial<CutService> as CutService
  const middleware = new CutMiddleware(service, {} as CutCaptionService,
    {} as CutMediaIntelligenceService, {} as CutProposalService, {} as CutRenderService)
  return { listTracks, getProject, provider: new CutToolProvider(middleware, service) }
}

describe('Cut decorated registration', () => {
  it('exposes six native entry points and preserves the full MCP surface and task policies', async () => {
    const { provider } = fixture()
    const descriptor = describeXpertToolProvider(provider)
    expect('getMcpExtensions' in provider).toBe(false)
    expect(descriptor.mcpMethods?.filter((item) => item.kind === 'resource-template')).toHaveLength(8)
    expect(descriptor.mcpMethods?.filter((item) => item.kind === 'prompt')).toHaveLength(4)
    const agent = new DecoratedAgentMiddlewareStrategy(provider, descriptor, CUT_MIDDLEWARE_NAME)
    expect(new Set(agent.getToolNames())).toEqual(new Set([
      'cut_list_tracks', 'cut_list_clips', 'cut_list_media_assets', 'cut_list_project_resources',
      'cut_discover_tools', 'cut_execute_tool'
    ]))
    const toolset = await new DecoratedToolsetStrategy(provider).create({ name: 'Cut' })
    const definitions = toolset.getMcpCapabilityDefinitions()!
    expect(definitions.tools).toHaveLength(43)
    expect(definitions.resourceTemplates).toHaveLength(8)
    expect(definitions.prompts).toHaveLength(4)
    expect(definitions.tools?.some((tool) => tool.name === 'cut_execute_tool')).toBe(false)
    expect(definitions.tools?.find((tool) => tool.name === 'cut_start_transcription')?.task)
      .toEqual({ mode: 'optional', maxLifetimeMs: 3600000 })
    expect(definitions.tools?.find((tool) => tool.name === 'cut_start_headless_export')?.task)
      .toEqual({ mode: 'optional', maxLifetimeMs: 3600000 })
    expect(definitions.tools?.find((tool) => tool.name === 'cut_delete_clips')?.behavior.risk).toBe('dangerous')
  })

  it('reads decorated resources with caller scope and generates the shared workflow prompts', async () => {
    const { provider, getProject } = fixture()
    const toolset = await new DecoratedToolsetStrategy(provider).create({ name: 'Cut' })
    const definitions = toolset.getMcpCapabilityDefinitions()!
    const resourceUri = `cut://projects/${projectId}`
    const resource = definitions.resourceTemplates!.find((item) => item.key === 'cut_get_project')!
    const result = await resource.read({ projectId }, { ...context, resourceUri })
    expect(result.contents[0]).toMatchObject({ uri: resourceUri, mimeType: 'application/json' })
    expect(getProject).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-a', userId: 'user-a' }), projectId
    )
    for (const prompt of definitions.prompts!) {
      const result = await prompt.get({ projectId, goal: '测试目标', language: 'zh-Hans' }, context)
      expect(JSON.stringify(result)).toContain(projectId)
      expect(JSON.stringify(result)).toContain('测试目标')
      expect(result.messages).toHaveLength(1)
    }
  })

  it('requires explicit MCP project identity before calling the scoped business operation', async () => {
    const { provider, listTracks } = fixture()
    const toolset = await new DecoratedToolsetStrategy(provider).create({ name: 'Cut' })
    const tool = toolset.getMcpCapabilityDefinitions()!.tools!.find((item) => item.name === 'cut_list_tracks')!
    await expect(tool.execute({}, context)).rejects.toThrow()
    expect(listTracks).not.toHaveBeenCalled()
    const result = await tool.execute({ projectId }, context)
    expect(result.structuredContent).toMatchObject({ projectId, revision: 1 })
    expect(listTracks).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-a', userId: 'user-a' }),
      expect.objectContaining({ projectId }))
  })

  it('retains native speech configuration through the execution gateway', async () => {
    const startTranscription = jest.fn(async () => ({ success: true, jobId: 'job-a', status: 'queued' }))
    const service = {} as CutService
    const captions = { startTranscription } as Partial<CutCaptionService> as CutCaptionService
    const provider = new CutToolProvider(new CutMiddleware(service, captions,
      {} as CutMediaIntelligenceService, {} as CutProposalService, {} as CutRenderService), service)
    const strategy = new DecoratedAgentMiddlewareStrategy(provider, describeXpertToolProvider(provider), CUT_MIDDLEWARE_NAME)
    const nativeContext = { tenantId: 'tenant-a', userId: 'user-a', xpertId: 'cut-agent', runtime: {}, tools: new Map(), node: {},
      xpertFeatures: { speechToText: { enabled: true, copilotModel: { copilotId: 'speech', model: 'whisper-large-v3', modelType: 'speech2text' } } }
    } as IAgentMiddlewareContext
    const middleware = await strategy.createMiddleware({}, nativeContext)
    await middleware.tools!.find((tool) => tool.name === 'cut_execute_tool')!.invoke({
      profile: 'speech-evidence', operation: 'cut_start_transcription', arguments: {
        projectId, mediaAssetId: '22222222-2222-4222-8222-222222222222', mode: 'platform', baseRevision: 1, changeSummary: 'Transcribe speech.'
      }
    })
    expect(startTranscription).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-a' }),
      expect.objectContaining({ mode: 'platform' }), 'cut-agent', nativeContext.xpertFeatures!.speechToText!.copilotModel)
  })

  it('keeps profile discovery and execution behind the decorated native gateways', async () => {
    const { provider, listTracks } = fixture()
    const strategy = new DecoratedAgentMiddlewareStrategy(provider, describeXpertToolProvider(provider), CUT_MIDDLEWARE_NAME)
    const nativeContext = { tenantId: 'tenant-a', userId: 'user-a', runtime: {}, tools: new Map(), node: {} } as IAgentMiddlewareContext
    const middleware = await strategy.createMiddleware({}, nativeContext)
    const discover = middleware.tools!.find((tool) => tool.name === 'cut_discover_tools')!
    const result = await discover.invoke({ profiles: ['timeline-visual'] })
    expect(JSON.stringify(result)).toContain('cut_update_transform')
    const execute = middleware.tools!.find((tool) => tool.name === 'cut_execute_tool')!
    await execute.invoke({ profile: 'base', operation: 'cut_list_tracks', arguments: { projectId } })
    expect(listTracks).toHaveBeenCalledTimes(1)
    await expect(execute.invoke({ profile: 'timeline-visual', operation: 'cut_list_tracks', arguments: { projectId } }))
      .rejects.toThrow('does not belong')
  })
})
