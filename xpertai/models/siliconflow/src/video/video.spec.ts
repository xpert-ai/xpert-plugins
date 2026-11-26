import { buildSiliconflowVideoTools } from './tools.js'
import { SiliconflowVideoClient } from './client.js'
import { SiliconflowVideoModelClient } from './model.js'
import { SiliconflowVideoStrategy } from './strategy.js'
import { SiliconflowH3, type SiliconflowVideoToolDependencies } from './types.js'

function fixture() {
  const enqueue = jest.fn()
  const getJob = jest.fn()
  const readRuntimeBuffer = jest.fn(async () => ({ buffer: Buffer.from('frame'), mimeType: 'image/png' }))
  const tools = buildSiliconflowVideoTools({
    managedQueue: { enqueue, getJob }, workspaceFiles: { readRuntimeBuffer }, runtimeScope: { userId: 'user', projectId: 'project' }
  } as unknown as SiliconflowVideoToolDependencies)
  const invoke = (name: string, args: Record<string, unknown>) => tools.find(t => t.name === name)!.invoke({
    id: 'test-tool-call', type: 'tool_call', name, args
  })
  return { enqueue, getJob, readRuntimeBuffer, invoke }
}

describe('SiliconFlow H3 video', () => {
  it('exposes the existing tool names with the new default model', () => {
    const tools = new SiliconflowVideoStrategy().createTools()
    expect(tools.map((t: { name: string }) => t.name)).toEqual(['siliconflow_video_submit', 'siliconflow_video_query'])
    expect(tools[0].schema.properties.model).toMatchObject({ enum: [SiliconflowH3], default: SiliconflowH3 })
  })

  it.each([
    [{ prompt: 'A bird in flight' }, []],
    [{ input_image_file: { workspacePath: '/workspace/frame.png' } }, ['first_frame']],
    [{ last_frame_file: 'https://example.test/last.jpg' }, ['last_frame']],
    [{ input_image_file: 'https://example.test/first.jpg', last_frame_file: 'https://example.test/last.jpg' }, ['first_frame', 'last_frame']]
  ] as const)('queues each H3 generation mode with the requested billable seconds', async (args, roles) => {
    const { invoke, enqueue, readRuntimeBuffer } = fixture()
    await invoke('siliconflow_video_submit', { ...args, resolution: '480p', duration: 12 })
    const job = enqueue.mock.calls[0][0]
    const payload = job.payload.input
    expect(job).toMatchObject({ userId: 'user', payload: {
      model: SiliconflowH3, pricingDimensions: { resolution: '480p', durationSeconds: 12 }, runtimeScope: { projectId: 'project' }
    } })
    expect(payload).toMatchObject({ model: SiliconflowH3, resolution: '480p', duration: 12 })
    expect((payload.images ?? []).map((i: { role: string }) => i.role)).toEqual(roles)
    if (readRuntimeBuffer.mock.calls.length) expect(payload.images[0].url).toBe('data:image/png;base64,ZnJhbWU=')
    expect(payload).not.toHaveProperty('image_size')
    expect(payload).not.toHaveProperty('negative_prompt')
  })

  it('rejects invalid requests before creating jobs', async () => {
    const { invoke, enqueue } = fixture()
    for (const args of [{ model: SiliconflowH3 }, { prompt: 'A', model: 'Wan-AI/Wan2.2-T2V-A14B' },
      { prompt: 'A', duration: 16 }, { prompt: 'A', resolution: '4K' }]) {
      await expect(invoke('siliconflow_video_submit', args)).rejects.toThrow()
    }
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('uses stable queue IDs and reads processing, completed and failed jobs', async () => {
    const { invoke, enqueue, getJob } = fixture()
    for (let i = 0; i < 2; i++) await invoke('siliconflow_video_submit', { prompt: 'A' })
    const id = enqueue.mock.calls[0][0].jobId
    expect(enqueue.mock.calls[1][0].jobId).toBe(id)
    getJob.mockResolvedValueOnce({ state: 'active', data: { phase: 'polling' } })
    await expect(invoke('siliconflow_video_query', { request_id: id, wait_seconds: 0 })).resolves.toMatchObject({ artifact: { data: { status: 'polling' } } })
    getJob.mockResolvedValueOnce({ state: 'completed', data: { result: ['Video ready', { files: [] }] } })
    await expect(invoke('siliconflow_video_query', { task_id: id })).resolves.toMatchObject({ content: 'Video ready' })
    getJob.mockResolvedValueOnce({ state: 'failed', data: {}, failedReason: 'Provider rejected task' })
    await expect(invoke('siliconflow_video_query', { task_id: id })).rejects.toThrow('Provider rejected task')
    await expect(invoke('siliconflow_video_query', {})).rejects.toThrow()
  })

  it('posts to the configured endpoint and accounts separately for new and legacy jobs', async () => {
    const status = () => Response.json({ status: 'Succeed', results: { videos: [{ url: 'https://example.test/video.mp4' }] } })
    const http = jest.fn().mockResolvedValueOnce(Response.json({ requestId: 'id' })).mockResolvedValueOnce(status())
      .mockResolvedValueOnce(status()).mockResolvedValueOnce(Response.json({ status: 'Failed' }))
    const client = new SiliconflowVideoModelClient(new SiliconflowVideoClient({ api_key: 'test', endpoint_url: 'https://example.test/v1' }, http))
    await client.submit({ model: SiliconflowH3, prompt: 'A', duration: 7 })
    expect(http.mock.calls[0][0]).toBe('https://example.test/v1/video/submit')
    expect(http.mock.calls[0][1].headers).toMatchObject({ Authorization: 'Bearer test' })
    expect((await client.query('id', { pricingDimensions: { durationSeconds: 7 } })).observation.metrics)
      .toEqual([{ unit: 'second', authority: 'request', quantity: 7 }])
    expect((await client.query('legacy')).observation.metrics).toEqual([{ unit: 'generation', authority: 'contract', quantity: 1 }])
    expect((await client.query('id')).observation.state).toBe('failed')
  })
})
