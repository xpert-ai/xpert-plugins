import { MiniMaxVideoClient } from './client.js'
import { buildMiniMaxVideoTools } from './tools.js'
import { normalizeMiniMaxVideoObservation } from './usage.js'
import { MiniMaxProviderStrategy } from '../provider.strategy.js'
import { MiniMaxVideoGenerationModel } from './model.js'

describe('MiniMax H3 video', () => {
  it('loads H3 and H3 Max from the predefined video catalog', () => {
    const model = new MiniMaxVideoGenerationModel(new MiniMaxProviderStrategy())
    expect(model.predefinedModels().map((item) => item.model)).toEqual(['MiniMax-H3', 'MiniMax-H3-Max'])
  })

  it('uses the V2 submit and query endpoints', async () => {
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ task_id: 'task-1' }))
      .mockResolvedValueOnce(
        jsonResponse({
          task: {
            id: 'task-1',
            model: 'MiniMax-H3',
            status: 'succeeded',
            content: { url: 'https://cdn.example.com/task-1.mp4' },
            resolution: '2K',
            duration: 5,
            usage: { output_seconds: 5 }
          }
        })
      )
    const client = new MiniMaxVideoClient(
      { api_key: 'test-key', group_id: 'test-group', base_url: 'https://api.minimaxi.com/v1' },
      fetchMock
    )

    await expect(
      client.submitVideo({
        model: 'MiniMax-H3',
        content: [{ type: 'text', text: 'A cinematic ocean sunrise' }],
        resolution: '2K',
        duration: 5,
        ratio: '16:9'
      })
    ).resolves.toEqual({ id: 'task-1', status: 'queued' })
    await expect(client.queryVideo('task-1')).resolves.toEqual(
      expect.objectContaining({ id: 'task-1', status: 'succeeded', duration: 5 })
    )

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.minimaxi.com/v2/video_generation')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://api.minimaxi.com/v2/query/video_generation/task-1')
  })

  it('uses the official China V2 endpoint by default', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ task_id: 'task-cn' }))
    const client = new MiniMaxVideoClient({ api_key: 'test-key', group_id: 'test-group' }, fetchMock)

    await client.submitVideo({
      model: 'MiniMax-H3',
      content: [{ type: 'text', text: 'A quiet mountain lake' }],
      resolution: '768P',
      duration: 5,
      ratio: '16:9'
    })

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.minimax.cn/v2/video_generation')
  })

  it('normalizes provider output seconds for billing', () => {
    expect(
      normalizeMiniMaxVideoObservation({
        id: 'task-1',
        status: 'succeeded',
        usage: { output_seconds: 7 }
      })
    ).toEqual({
      state: 'succeeded',
      metrics: [{ unit: 'second', quantity: 7, authority: 'provider' }]
    })
  })

  it('queues a validated H3 Max text-to-video request', async () => {
    const enqueue = jest.fn().mockResolvedValue({ jobId: 'minimax-call-1' })
    const [submit] = buildMiniMaxVideoTools({
      managedQueue: { enqueue } as never,
      workspaceFiles: {
        uploadBuffer: jest.fn(),
        readBuffer: jest.fn()
      }
    })

    const rawResult = await submit.invoke({
      id: 'call-1',
      name: submit.name,
      type: 'tool_call',
      args: {
        prompt: 'A runner crossing a neon city',
        model: 'MiniMax-H3-Max',
        resolution: '480P',
      duration: 5,
      ratio: '16:9',
      aigc_watermark: true
      }
    })
    const result = Array.isArray(rawResult)
      ? rawResult
      : [rawResult.content, rawResult.artifact]

    expect(result[1].data).toEqual(expect.objectContaining({ model: 'MiniMax-H3-Max', status: 'queued' }))
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginName: '@xpert-ai/plugin-minimax',
        payload: expect.objectContaining({
          model: 'MiniMax-H3-Max',
          pricingDimensions: { resolution: '480P', durationSeconds: 5 },
          input: expect.objectContaining({ aigc_watermark: true })
        })
      })
    )
  })
})

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}
