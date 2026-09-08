import {
  describeXpertToolProvider,
  DecoratedToolsetStrategy,
  type ToolExecutionContext,
  type XpertBusinessToolContext
} from '@xpert-ai/plugin-sdk'
import { providerFixture } from './provider-test-fixture.js'
import { excalidrawToolScope } from './excalidraw-tools.provider.js'
import { jsonValueSchema } from './contracts.js'
import { fontsResultSchema } from './result-schemas.js'
import { createDrawingSchema, patchSceneSchema } from './drawing-contracts.js'
const context: ToolExecutionContext = {
  source: 'mcp',
  tenantId: 'tenant',
  organizationId: 'org',
  principal: { type: 'user', id: 'user', userId: 'user' },
  executionId: 'exec',
  requestId: 'request',
  host: {}
}
const business: XpertBusinessToolContext = {
  surface: 'mcp',
  tenantId: 'tenant',
  organizationId: 'org',
  principal: context.principal,
  executionId: 'exec',
  requestId: 'request',
  host: {}
}
describe('native Excalidraw provider', () => {
  it('returns JSON-safe font presets through the native MCP adapter', async () => {
    const toolset = await new DecoratedToolsetStrategy(providerFixture().provider, 'test', '1').create({ name: 'Test' })
    const tool = toolset.getMcpCapabilityDefinitions().tools.find((item) => item.name === 'excalidraw_list_typography_presets')
    const result = await tool.execute({}, context)
    const catalog = fontsResultSchema.parse(result.structuredContent)
    expect(catalog.items.length).toBeGreaterThan(0)
    for (const preset of catalog.items) {
      expect(preset).toEqual(expect.objectContaining({ fontFamilyId: expect.any(Number) }))
      expect(preset).not.toHaveProperty('css')
    }
  })
  it('has one owner per tool and a stable native provider', () => {
    const descriptor = describeXpertToolProvider(providerFixture().provider)
    expect(descriptor.options.provider).toBe('excalidraw_tools')
    expect(descriptor.options.componentKey).toBe('excalidraw-tools')
    const names = descriptor.tools.map((item) => item.options.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names).toEqual(
      expect.arrayContaining([
        'excalidraw_create_drawing',
        'excalidraw_read_preview',
        'excalidraw_read_export',
        'excalidraw_checkpoint_version',
        'excalidraw_restore_version'
      ])
    )
  })
  it('uses authenticated organization scope without ambient project filters', () => {
    expect(
      excalidrawToolScope({
        ...business,
        workspaceId: 'foreign-workspace',
        projectId: 'foreign-project',
        xpertId: 'assistant'
      })
    ).toMatchObject({
      tenantId: 'tenant',
      organizationId: 'org',
      actorId: 'user',
      workspaceId: null,
      projectId: null,
      assistantId: null
    })
    expect(() => excalidrawToolScope({ ...business, organizationId: null })).toThrow('missing_execution_context')
  })
  it('rejects unknown fields, empty patches, oversized batches and excessive JSON depth', () => {
    expect(createDrawingSchema.safeParse({ title: 'New', elements: [] }).success).toBe(false)
    expect(
      patchSceneSchema.safeParse({
        drawingId: 'a',
        addElements: Array.from({ length: 21 }, (_, i) => ({ id: String(i), type: 'rectangle', x: 0, y: 0 }))
      }).success
    ).toBe(false)
    expect(patchSceneSchema.safeParse({ drawingId: 'a' }).success).toBe(false)
    let nested: object = {}
    for (let i = 0; i < 15; i++) nested = { child: nested }
    expect(jsonValueSchema.safeParse(nested).success).toBe(false)
  })
  it('requires explicit MCP drawingId before reading data', async () => {
    const { provider, reads } = providerFixture(),
      read = jest.spyOn(reads, 'get')
    const toolset = await new DecoratedToolsetStrategy(provider, 'test', '1').create({ name: 'Test' })
    const tool = toolset.getMcpCapabilityDefinitions().tools.find((item) => item.name === 'excalidraw_get_drawing')
    await expect(tool.execute({}, context)).rejects.toThrow('no_active_context')
    expect(read).not.toHaveBeenCalled()
  })
  it('separates authorized PNG bytes from structured business output', async () => {
    const { provider, renders } = providerFixture()
    jest.spyOn(renders, 'readPreview').mockResolvedValue({
      content: [{ type: 'image', mimeType: 'image/png', data: 'aGVsbG8=' }],
      structuredContent: {
        drawingId: 'drawing',
        previewId: 'preview',
        sceneRevision: 2,
        stale: false,
        mimeType: 'image/png',
        kind: 'scene'
      }
    })
    const toolset = await new DecoratedToolsetStrategy(provider, 'test', '1').create({ name: 'Test' }),
      tool = toolset.getMcpCapabilityDefinitions().tools.find((item) => item.name === 'excalidraw_read_preview')
    const result = await tool.execute({ previewId: 'preview' }, context)
    expect(result.content[0]).toMatchObject({ type: 'image', data: 'aGVsbG8=' })
    expect(result.structuredContent).not.toHaveProperty('data')
    expect(result.structuredContent).not.toHaveProperty('workspacePath')
  })
  it('declares direct invocation for every write including public sharing', () => {
    const tools = describeXpertToolProvider(providerFixture().provider).tools
    for (const { options } of tools) {
      if (options.mcp && options.mcp.behavior.risk !== 'read') expect(options.mcp.defaultApprovalMode).toBe('allow')
    }
    const publish = tools.find(item => item.options.name === 'excalidraw_publish_artifact_link')
    expect(publish.options.mcp).toMatchObject({ behavior: { risk: 'dangerous' }, defaultApprovalMode: 'allow' })
  })
  it('publishes under application policy without asking the client for confirmation', async () => {
    const { provider, drawings } = providerFixture()
    jest.spyOn(drawings, 'requireCanonicalDrawing').mockResolvedValue({ id: 'drawing', title: 'Title', revision: 2 })
    jest.spyOn(drawings, 'requireDrawing').mockResolvedValue({ id: 'drawing', title: 'Title', revision: 2, status: 'draft' })
    const publish = jest.spyOn(drawings, 'publishDrawingViewerArtifact').mockResolvedValue({ publicUrl: 'https://example.test/share' })
    const request = jest.fn()
    const result = await provider.publish({ drawingId: 'drawing', expectedRevision: 2, operationId: 'share', accessMode: 'public_link' }, { ...business, host: { input: { request } } })
    expect(request).not.toHaveBeenCalled()
    expect(publish).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ publicLinkAuthorization: 'application_policy' }))
    expect(publish.mock.calls[0][1]).not.toHaveProperty('userConfirmedPublicLink')
    expect(result.project()).toMatchObject({ drawingId: 'drawing', sceneRevision: 2, shareUrl: 'https://example.test/share' })
    expect(result).not.toHaveProperty('nextAction')
  })
  it('still rejects a stale public share revision before publication', async () => {
    const { provider, drawings } = providerFixture()
    jest.spyOn(drawings, 'requireCanonicalDrawing').mockResolvedValue({ id: 'drawing', title: 'Title', revision: 3 })
    const publish = jest.spyOn(drawings, 'publishDrawingViewerArtifact')
    await expect(provider.publish({ drawingId: 'drawing', expectedRevision: 2, operationId: 'share', accessMode: 'public_link' }, business)).rejects.toThrow('scene_revision_conflict')
    expect(publish).not.toHaveBeenCalled()
  })
  it('requires an operation receipt for cancellation and validates render payloads', async () => {
    const { provider, renders } = providerFixture()
    const cancel = jest.spyOn(renders, 'cancel')
    expect(() => provider.cancel({ jobId: 'job' }, business)).toThrow('operation_id_required')
    expect(cancel).not.toHaveBeenCalled()
  })
})
