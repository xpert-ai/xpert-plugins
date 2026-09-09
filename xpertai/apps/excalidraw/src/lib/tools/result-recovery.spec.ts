jest.mock('./result-dto.js', () => {
  const actual = jest.requireActual<typeof import('./result-dto.js')>('./result-dto.js')
  return { ...actual, mutationDto: jest.fn(actual.mutationDto) }
})

import { DecoratedToolsetStrategy, describeXpertToolProvider, type ToolExecutionContext } from '@xpert-ai/plugin-sdk'
import { providerFixture } from './provider-test-fixture.js'
import * as dto from './result-dto.js'
import { minimalReceipt } from './result-recovery.js'
import { minimalReceiptSchema } from './result-recovery.schema.js'
import * as schemas from './result-schemas.js'

const context: ToolExecutionContext = {
  source: 'mcp',
  tenantId: 'tenant',
  organizationId: 'org',
  principal: { type: 'user', id: 'user', userId: 'user' },
  host: {}
}
afterEach(() => jest.restoreAllMocks())

it('declares a strict minimal receipt for every tool without accepting arbitrary output', () => {
  const tools = describeXpertToolProvider(providerFixture().provider).tools
  expect(tools).toHaveLength(38)
  for (const { options } of tools) {
    expect(options.outputSchema.safeParse(minimalReceipt({ operationId: 'op' })).success).toBe(true)
    expect(options.outputSchema.safeParse({ resultStatus: 'unavailable', privateEntity: 'secret' }).success).toBe(false)
  }
})
it('does not run the full output validator inside a DTO projection', () => {
  const sync = jest.spyOn(schemas.mutationResultSchema, 'parse')
  const async = jest.spyOn(schemas.mutationResultSchema, 'parseAsync')
  dto.mutationDto({ success: true, message: 'done', drawingId: 'drawing', sceneRevision: 1 })
  expect(sync).not.toHaveBeenCalled()
  expect(async).not.toHaveBeenCalled()
})
it('preserves the completed write receipt when output validation fails and never re-executes the write', async () => {
  const { provider, drawings } = providerFixture()
  const create = jest.spyOn(drawings, 'createDrawing').mockResolvedValue({ item: { id: 'drawing' } })
  jest
    .spyOn(drawings, 'requireDrawing')
    .mockResolvedValue({ id: 'drawing', title: 'Title', revision: 2, status: 'draft' })
  const project = jest.requireActual<typeof import('./result-dto.js')>('./result-dto.js').mutationDto
  jest
    .spyOn(dto, 'mutationDto')
    .mockImplementation((result) => ({ ...project(result), changedIds: Array(221).fill('id') }))
  const toolset = await new DecoratedToolsetStrategy(provider).create({ name: 'Recovery test' })
  const tool = toolset.getMcpCapabilityDefinitions().tools.find((tool) => tool.name === 'excalidraw_create_drawing')
  const result = await tool.execute({ title: 'Test', operationId: 'op' }, context)
  const receipt = minimalReceiptSchema.parse(result.structuredContent)
  expect(receipt).toMatchObject({
    success: true,
    resultStatus: 'unavailable',
    drawingId: 'drawing',
    sceneRevision: 2,
    operationId: 'op'
  })
  expect(receipt.nextAction).toContain('same operationId')
  expect(result.isError).not.toBe(true)
  expect(result.content).toEqual([{ type: 'text', text: JSON.stringify(result.structuredContent) }])
  expect(create).toHaveBeenCalledTimes(1)
  await expect(
    tool.execute({ title: 'Test', operationId: 'op2' }, { ...context, organizationId: null })
  ).rejects.toThrow('missing_execution_context')
  expect(create).toHaveBeenCalledTimes(1)
})
it('recovers projection exceptions from persisted data without exposing that data', async () => {
  const { provider, reads } = providerFixture()
  jest
    .spyOn(reads, 'item')
    .mockResolvedValue({
      drawingId: 'drawing',
      sceneRevision: 3,
      itemType: 'element',
      item: { privateKey: 'never-output' }
    })
  const toolset = await new DecoratedToolsetStrategy(provider).create({ name: 'Recovery test' })
  const tool = toolset.getMcpCapabilityDefinitions().tools.find((tool) => tool.name === 'excalidraw_get_scene_item')
  const result = await tool.execute({ drawingId: 'drawing', itemType: 'element', elementId: 'element' }, context)
  expect(minimalReceiptSchema.parse(result.structuredContent)).toMatchObject({
    drawingId: 'drawing',
    resultStatus: 'unavailable'
  })
  expect(JSON.stringify(result)).not.toContain('never-output')
})
it('preserves failed job status and drops invalid identifiers instead of inventing replacements', () => {
  const receipt = minimalReceiptSchema.parse(
    minimalReceipt({ success: false, status: 'failed', jobId: 'job', drawingId: 'x'.repeat(101), sceneRevision: NaN })
  )
  expect(receipt).toMatchObject({ success: false, status: 'failed', jobId: 'job' })
  expect(receipt.drawingId).toBeUndefined()
  expect(receipt.sceneRevision).toBeUndefined()
})
it('returns readable metadata recovery when an image block cannot be serialized as a valid tool result', async () => {
  const { provider, renders } = providerFixture()
  jest.spyOn(renders, 'readPreview').mockResolvedValue({
    content: [{ type: 'image', mimeType: 'image/png', data: '' }],
    structuredContent: {
      drawingId: 'drawing',
      previewId: 'preview',
      sceneRevision: 3,
      stale: false,
      mimeType: 'image/png',
      kind: 'scene'
    }
  })
  const toolset = await new DecoratedToolsetStrategy(provider).create({ name: 'Recovery test' })
  const tool = toolset.getMcpCapabilityDefinitions().tools.find((tool) => tool.name === 'excalidraw_read_preview')
  const result = await tool.execute({ previewId: 'preview' }, context)
  expect(minimalReceiptSchema.parse(result.structuredContent)).toMatchObject({
    resultStatus: 'unavailable',
    previewId: 'preview'
  })
  expect(result.content).toEqual([{ type: 'text', text: JSON.stringify(result.structuredContent) }])
  expect(result.isError).not.toBe(true)
})

it.each([' ', ' drawing ', 'x'.repeat(101)])('omits a noncanonical fallback identifier: %s', drawingId => {
  const receipt = minimalReceiptSchema.parse(minimalReceipt({ drawingId, operationId: 'op' }))
  expect(receipt.drawingId).toBeUndefined()
  expect(receipt.operationId).toBe('op')
})
