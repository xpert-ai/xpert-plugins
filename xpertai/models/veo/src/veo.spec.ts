import { VeoVideoJobProcessor } from './job.js'
import type { ManagedQueueService } from '@xpert-ai/plugin-sdk'
import { GeminiVeoClient, validateVeoOperationName } from './client.js'
import { VeoVideoModelClient } from './model.js'
import { VeoStrategy } from './strategy.js'
import { buildVeoTools } from './tools.js'
import { VeoProviderStrategy } from './provider.strategy.js'
import { OmniModel, type VeoVideoJobPayload, type WorkspaceFilesApi } from './types.js'
import { normalizeVeoObservation } from './usage.js'

const credentials = { gemini_api_key: 'test' }
const first = { filePath: 'first.png' }
const last = { filePath: 'last.png' }
const uri = 'https://generativelanguage.googleapis.com/v1beta/files/clip:download?alt=media'
const completed = { id: 'gen_1', status: 'completed', steps: [
  { type: 'model_output', content: [{ type: 'video', mime_type: 'video/mp4', uri }] }
] }

function fixture() {
  const enqueue = jest.fn()
  const getJob = jest.fn()
  const readRuntimeBuffer = jest.fn(async (file: { filePath: string }) => ({
    buffer: Buffer.from(file.filePath), mimeType: 'image/png'
  }))
  const tools = buildVeoTools({
    workspaceFiles: { readRuntimeBuffer } as unknown as WorkspaceFilesApi,
    managedQueue: { enqueue, getJob } as unknown as ManagedQueueService,
    runtimeScope: { projectId: 'project', userId: 'user' }
  })
  async function invoke(name: string, args: Record<string, unknown>) {
    return tools.find(tool => tool.name === name)!.invoke({ type: 'tool_call', id: 'call-1', name, args })
  }
  return { invoke, getJob, enqueue, readRuntimeBuffer }
}

describe('Gemini video generation', () => {
  it('exposes the available model with the existing tool names and validates its provider', async () => {
    const strategy = new VeoStrategy()
    expect(strategy.meta.videoGeneration.defaultModel).toBe(OmniModel)
    expect(strategy.meta.videoGeneration.models.map(model => model.id)).toEqual([OmniModel])
    expect(strategy.meta.videoGeneration.tools.query).toBe('veo_video_query')
    const provider = new VeoProviderStrategy()
    await expect(provider.validateProviderCredentials(credentials)).resolves.toBeUndefined()
    await expect(provider.validateProviderCredentials({})).rejects.toThrow('API key')
  })

  it.each([
    ['veo_text_to_video', {}, 0], ['veo_image_to_video', { input_image_file: first }, 1],
    ['veo_first_last_frame_to_video', { first_frame_file: first, last_frame_file: last }, 2],
    ['veo_reference_to_video', { reference_image_files: [first, last] }, 2]
  ] as const)('queues %s with the correct media parts and generation options', async (tool, args, count) => {
    const { invoke, enqueue, readRuntimeBuffer } = fixture()
    await invoke(tool, { ...args, prompt: 'Animate the scene', duration: 6, resolution: '4k' })
    const job = enqueue.mock.calls[0][0]
    expect(job.userId).toBe('user')
    const data = job.payload as VeoVideoJobPayload
    expect(data.model).toBe(OmniModel)
    expect(data.runtimeScope.projectId).toBe('project')
    const payload = data.input.payload
    expect(payload).toMatchObject({ model: OmniModel, background: true, response_format: {
      type: 'video', duration: '6s', delivery: 'uri', aspect_ratio: '16:9', resolution: '4k'
    } })
    const parts = payload.input as Array<{ type: string; data?: string }>
    expect(parts.filter(p => p.type === 'image').map(p => p.data)).toEqual([first, last].slice(0, count).map(f => Buffer.from(f.filePath).toString('base64')))
    expect(readRuntimeBuffer).toHaveBeenCalledTimes(count)
    if (tool === 'veo_reference_to_video') expect(payload.generation_config).toEqual({ video_config: { task: 'reference_to_video' } })
  })

  it('validates retired models, frame interpolation, references and remote inputs before queueing', async () => {
    const { invoke, enqueue } = fixture()
    await expect(invoke('veo_text_to_video', { prompt: 'Text', model: 'veo-3.1-generate-preview' })).rejects.toThrow()
    await expect(invoke('veo_first_last_frame_to_video', { prompt: 'Text', first_frame_file: first, last_frame_file: last, duration: 11 })).rejects.toThrow()
    await expect(invoke('veo_reference_to_video', { prompt: 'Text', reference_image_files: Array(7).fill(first) })).rejects.toThrow()
    await expect(invoke('veo_image_to_video', { prompt: 'Text', input_image_file: 'https://example.test/input.jpg' })).rejects.toThrow()
    await expect(invoke('veo_text_to_video', { prompt: 'Text', generate_audio: false })).rejects.toThrow()
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('uses stable queue IDs and returns the saved result of a completed job', async () => {
    const { invoke, enqueue, getJob } = fixture()
    await invoke('veo_text_to_video', { prompt: 'Test' })
    await invoke('veo_text_to_video', { prompt: 'Test' })
    const id = enqueue.mock.calls[0][0].jobId
    expect(enqueue.mock.calls[1][0].jobId).toBe(id)
    getJob.mockResolvedValueOnce({ state: 'completed', data: { result: ['Completed', { files: [] }] } })
    await expect(invoke('veo_video_query', { task_id: id, wait_seconds: 0 })).resolves.toMatchObject({ content: 'Completed' })
    getJob.mockResolvedValueOnce({ state: 'failed', data: {}, failedReason: 'Provider failed' })
    await expect(invoke('veo_video_query', { task_id: id })).rejects.toThrow('Provider failed')
  })

  it('submits one interaction, polls file readiness and retrieves usage', async () => {
    const http = jest.fn()
      .mockResolvedValueOnce(Response.json({ id: 'gen_1', status: 'in_progress' }))
      .mockResolvedValueOnce(Response.json(completed)).mockResolvedValueOnce(Response.json({ state: 'PROCESSING' }))
      .mockResolvedValueOnce(Response.json({ ...completed, usage: { total_input_tokens: 9, total_output_tokens: 27 } }))
      .mockResolvedValueOnce(Response.json({ state: 'ACTIVE' }))
    const client = new VeoVideoModelClient(new GeminiVeoClient(credentials, http))
    const payload = { model: OmniModel, background: true, input: 'Generate' }
    const submit = await client.submit({ model: OmniModel, payload })
    expect(submit.providerRequestId).toBe('interactions/gen_1')
    expect(http.mock.calls[0][0]).toBe('https://generativelanguage.googleapis.com/v1beta/interactions')
    expect(JSON.parse(http.mock.calls[0][1].body)).toEqual(payload)
    expect((await client.query(submit.providerRequestId)).observation.state).toBe('processing')
    const result = await client.query(submit.providerRequestId)
    expect(result.data.response?.generateVideoResponse?.generatedSamples?.[0].video?.uri).toBe(uri)
    expect(result.observation.state).toBe('succeeded')
    expect(http.mock.calls.filter(([, init]) => init.method === 'POST')).toHaveLength(1)
  })

  it('still reads persisted Veo operations and accounts for their requested duration', async () => {
    const name = 'models/veo-3.1-generate-preview/operations/legacy'
    const old = { name, done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri } }] } } }
    const client = new GeminiVeoClient(credentials, jest.fn().mockResolvedValue(Response.json(old)))
    await expect(client.submit('veo-3.1-generate-preview', {})).rejects.toThrow('retired')
    expect(await client.getOperation(name)).toEqual(old)
    expect(normalizeVeoObservation(old, { durationSeconds: 8 }).metrics).toEqual([{ unit: 'second', quantity: 8, authority: 'request' }])
    expect(() => validateVeoOperationName('interactions/../../files')).toThrow()
  })

  it('rejects invalid output and redacts provider errors', async () => {
    const client = new GeminiVeoClient(credentials, jest.fn().mockResolvedValueOnce(Response.json({
      ...completed, steps: [{ type: 'model_output', content: [{ type: 'video', uri: 'https://example.test/video' }] }]
    })).mockResolvedValueOnce(Response.json({ error: { message: 'Invalid file https://example.test/private' } }, { status: 400 })))
    expect((await client.getOperation('interactions/gen_1')).error).toBeDefined()
    await expect(client.getOperation('interactions/gen_1')).rejects.toThrow('[redacted-url]')
  })

  it('downloads the MP4 while restricting the provider key to Google API requests', async () => {
    const http = jest.fn().mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://storage.googleapis.com/sample/clip.mp4' } }))
      .mockResolvedValueOnce(new Response(Buffer.from('video'), { headers: { 'Content-Type': 'video/mp4' } }))
    const client = new GeminiVeoClient(credentials, http)
    expect((await client.downloadVideo(uri)).buffer.toString()).toBe('video')
    expect(http.mock.calls[0][1].headers).toMatchObject({ 'x-goog-api-key': 'test' })
    expect(http.mock.calls[1][1].headers).toBeUndefined()
    await expect(client.downloadVideo('https://example.test/video')).rejects.toThrow('Untrusted')
  })
})

it('resumes a retired model job using its original access and pricing snapshot', async () => {
  const oldModel = 'veo-3.1-generate-preview'
  const previousPricing = { capturedAt: '2026-08-15T00:00:00Z', rules: [] }
  const previousAccess = { source: 'internal' }
  const provider = { copilotId: 'copilot', authorization: 'ApiKey test', baseURL: 'https://generativelanguage.googleapis.com/v1beta',
    reportUsage: jest.fn(), resolveModelAccess: jest.fn(), resolvePricingSnapshot: jest.fn() }
  const client = { submit: jest.fn(), query: jest.fn().mockResolvedValue({
    data: { name: 'operations/provider-task', done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri } }] } } },
    observation: { state: 'succeeded', metrics: [{ unit: 'second', quantity: 8 }] }
  }) }
  const uploadBuffer = jest.fn().mockResolvedValue({ filePath: '/project/clip.mp4' })
  const runtime = { getModelProvider: jest.fn().mockResolvedValue(provider),
    createModelClient: jest.fn().mockResolvedValue(client), capabilities: { get: () => ({ uploadBuffer }) } }
  const processor = new VeoVideoJobProcessor({ createScopedApi: () => runtime } as unknown as ConstructorParameters<typeof VeoVideoJobProcessor>[0])
  const data = { model: oldModel, phase: 'submitted', providerRequestId: 'provider-task', requestId: 'request',
    runtimeScope: { projectId: 'project' }, modelAccess: previousAccess, pricingSnapshot: previousPricing }
  const job = { id: 'job', data, updateData: jest.fn() }
  const http = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(Buffer.from('video'), { headers: { 'Content-Type': 'video/mp4' } }))
  try {
    await processor.handle(job as unknown as Parameters<typeof processor.handle>[0], {} as Parameters<typeof processor.handle>[1])
  } finally {
    http.mockRestore()
  }
  expect(runtime.createModelClient).toHaveBeenCalledWith(expect.objectContaining({ model: oldModel }), { purpose: 'observe' })
  expect(client.query).toHaveBeenCalledWith('provider-task', expect.anything())
  expect(client.submit).not.toHaveBeenCalled()
  expect(provider.resolvePricingSnapshot).not.toHaveBeenCalled()
  expect(provider.resolveModelAccess).not.toHaveBeenCalled()
  expect(provider.reportUsage).toHaveBeenCalledWith(expect.objectContaining({ model: oldModel, pricingSnapshot: previousPricing }), previousAccess)
  expect(uploadBuffer).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'project' }))
})
