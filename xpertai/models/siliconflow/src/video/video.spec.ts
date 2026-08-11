jest.mock('@xpert-ai/plugin-sdk', () => ({
  BuiltinToolset: class {
    tools: unknown[] = []
    protected toolset?: { credentials?: unknown }

    constructor(
      public providerName: string,
      toolset?: { credentials?: unknown }
    ) {
      this.toolset = toolset
    }

    get xpertId() {
      return undefined
    }

    getCredentials() {
      return this.toolset?.credentials
    }
  },
  ToolsetStrategy: () => (target: unknown) => target,
  XPERT_RUNTIME_CAPABILITIES_TOKEN: 'XPERT_RUNTIME_CAPABILITIES'
}))

import { SiliconflowVideoClient } from './client.js'
import { SiliconflowVideoStrategy } from './strategy.js'
import { buildSiliconflowVideoTools } from './tools.js'
import type {
  SiliconflowVideoToolResult,
  WorkspaceFilesApi
} from './types.js'

type ToolInvocationResult = SiliconflowVideoToolResult | {
  content?: string | Array<{ text?: string }>
  artifact?: SiliconflowVideoToolResult[1]
}

describe('SiliconFlow video toolset', () => {
  let fetchMock: jest.MockedFunction<typeof fetch>
  let workspaceFiles: WorkspaceFilesApi

  beforeEach(() => {
    fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>
    workspaceFiles = {
      uploadBuffer: jest.fn(async (input) => ({
        name: input.fileName || input.originalName,
        filePath: `${input.folder}/${input.fileName}`,
        workspacePath: `${input.folder}/${input.fileName}`,
        fileUrl: `https://workspace.example/${input.folder}/${input.fileName}`,
        mimeType: input.mimeType,
        size: input.buffer.length,
        catalog: 'xperts' as const,
        scopeId: input.scopeId
      })),
      readBuffer: jest.fn(async () => ({
        name: 'reference.png',
        filePath: 'files/reference.png',
        workspacePath: 'files/reference.png',
        mimeType: 'image/png',
        size: 3,
        catalog: 'xperts' as const,
        buffer: Buffer.from('png')
      }))
    }
  })

  it('submits a text-to-video request with SiliconFlow fields', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      requestId: 'request-1',
      status: 'InQueue'
    }))

    const submit = getTool('siliconflow_video_submit')
    const result = await invokeTool(submit, {
      prompt: 'A paper boat crossing a moonlit lake',
      negative_prompt: 'text, logo, watermark',
      image_size: '1280x720'
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.siliconflow.cn/v1/video/submit',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-key' })
      })
    )
    const request = fetchMock.mock.calls[0]?.[1]
    expect(JSON.parse(String(request?.body))).toEqual({
      model: 'Wan-AI/Wan2.2-T2V-A14B',
      prompt: 'A paper boat crossing a moonlit lake',
      negative_prompt: 'text, logo, watermark',
      image_size: '1280x720'
    })
    expect(normalizeToolResult(result).content).toContain('Task ID: request-1')
  })

  it('selects the image-to-video model and encodes a Workspace image', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      requestId: 'request-image',
      status: 'InQueue'
    }))

    const submit = getTool('siliconflow_video_submit')
    await invokeTool(submit, {
      input_image_file: { filePath: 'files/reference.png' },
      prompt: 'The subject moves naturally',
      image_size: '720x1280'
    })

    const request = fetchMock.mock.calls[0]?.[1]
    expect(JSON.parse(String(request?.body))).toEqual(expect.objectContaining({
      model: 'Wan-AI/Wan2.2-I2V-A14B',
      prompt: 'The subject moves naturally',
      image_size: '720x1280',
      image: 'data:image/png;base64,cG5n'
    }))
    expect(workspaceFiles.readBuffer).toHaveBeenCalledWith(expect.objectContaining({
      filePath: 'files/reference.png'
    }))
  })

  it('allows an image-only image-to-video request', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      requestId: 'request-image-only',
      status: 'InQueue'
    }))

    const submit = getTool('siliconflow_video_submit')
    await invokeTool(submit, {
      input_image_file: { filePath: 'files/reference.png' }
    })

    const request = fetchMock.mock.calls[0]?.[1]
    expect(JSON.parse(String(request?.body))).toEqual(expect.objectContaining({
      model: 'Wan-AI/Wan2.2-I2V-A14B',
      prompt: expect.any(String),
      image: 'data:image/png;base64,cG5n'
    }))
  })

  it('rejects a text-to-video model when an image is supplied', async () => {
    const submit = getTool('siliconflow_video_submit')
    await expect(invokeTool(submit, {
      model: 'Wan-AI/Wan2.2-T2V-A14B',
      input_image_file: { filePath: 'files/reference.png' },
      prompt: 'The subject moves naturally'
    })).rejects.toThrow('image-to-video model')
  })

  it('rejects a model-only submit call before running provider code', async () => {
    const submit = getTool('siliconflow_video_submit')

    await expect(invokeTool(submit, {
      model: 'Wan-AI/Wan2.2-T2V-A14B'
    })).rejects.toThrow('Received tool input did not match expected schema')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a query without a task ID before calling the provider', async () => {
    const query = getTool('siliconflow_video_query')

    await expect(invokeTool(query, { wait_seconds: 30 })).rejects.toThrow(
      'Received tool input did not match expected schema'
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('polls a task and uploads completed MP4 artifacts', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        requestId: 'request-2',
        status: 'InProgress'
      }))
      .mockResolvedValueOnce(jsonResponse({
        requestId: 'request-2',
        status: 'Succeed',
        results: {
          videos: [{ url: 'https://provider.example/video.mp4' }],
          seed: 123,
          timings: { inference: 7.5 }
        }
      }))
      .mockResolvedValueOnce(binaryResponse('video', 'video/mp4'))

    const query = getTool('siliconflow_video_query')
    const result = await invokeTool(query, { task_id: 'request-2', wait_seconds: 5 })
    const normalized = normalizeToolResult(result)

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.siliconflow.cn/v1/video/status')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://api.siliconflow.cn/v1/video/status')
    expect(fetchMock.mock.calls[2]?.[0]).toBe('https://provider.example/video.mp4')
    expect(workspaceFiles.uploadBuffer).toHaveBeenCalledTimes(1)
    expect(normalized.artifact.files).toEqual([
      expect.objectContaining({ mimeType: 'video/mp4', extension: 'mp4' })
    ])
    expect(normalized.content).toContain('Generated files:')
    expect(normalized.artifact.data).toEqual(expect.objectContaining({
      task_id: 'request-2',
      status: 'Succeed',
      seed: 123
    }))
  })

  it('returns a durable processing status without waiting when wait_seconds is zero', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      requestId: 'request-3',
      status: 'InProgress'
    }))

    const query = getTool('siliconflow_video_query')
    const result = await invokeTool(query, { task_id: 'request-3', wait_seconds: 0 })
    const normalized = normalizeToolResult(result)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(normalized.content).toContain('continues running')
    expect(normalized.artifact.data).toEqual(expect.objectContaining({
      task_id: 'request-3',
      status: 'InProgress'
    }))
  })

  it('accepts request_id as the query identifier alias', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      requestId: 'request-alias',
      status: 'InProgress'
    }))

    const query = getTool('siliconflow_video_query')
    await invokeTool(query, { request_id: 'request-alias', wait_seconds: 0 })

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      requestId: 'request-alias'
    })
  })

  it('throws a provider task error', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      requestId: 'request-fail',
      status: 'Failed',
      reason: 'content rejected'
    }))

    const query = getTool('siliconflow_video_query')
    await expect(invokeTool(query, { task_id: 'request-fail', wait_seconds: 0 })).rejects.toThrow(
      'content rejected'
    )
  })

  it('exposes the toolset metadata and both tools', () => {
    const strategy = new SiliconflowVideoStrategy()
    expect(strategy.meta.name).toBe('siliconflow_video')
    expect(strategy.meta.configSchema.required).toEqual(['api_key'])
    expect(strategy.createTools().map((item: { name: string }) => item.name)).toEqual([
      'siliconflow_video_submit',
      'siliconflow_video_query'
    ])
  })

  it('uses a custom endpoint and bearer authentication', async () => {
    const client = new SiliconflowVideoClient({
      api_key: 'test-key',
      endpoint_url: 'https://api.siliconflow.example/v1/'
    }, fetchMock)
    fetchMock.mockResolvedValueOnce(jsonResponse({ requestId: 'request-client', status: 'InQueue' }))

    await client.submitVideo({
      model: 'Wan-AI/Wan2.2-T2V-A14B',
      prompt: 'test'
    })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.siliconflow.example/v1/video/submit')
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer test-key' })
    }))
  })

  function getTool(name: string) {
    const found = buildSiliconflowVideoTools({
      credentials: { api_key: 'test-key' },
      workspaceFiles,
      fetch: fetchMock,
      sleep: jest.fn(async () => undefined)
    }).find((item) => item.name === name)
    if (!found) throw new Error(`Tool ${name} was not built`)
    return found
  }
})

async function invokeTool(
  toolInstance: { name: string; invoke: (input: unknown) => Promise<unknown> },
  args: Record<string, unknown>
) {
  return toolInstance.invoke({
    id: `call-${toolInstance.name}`,
    name: toolInstance.name,
    type: 'tool_call',
    args
  })
}

function normalizeToolResult(value: ToolInvocationResult) {
  if (Array.isArray(value)) return { content: value[0], artifact: value[1] }
  const content = Array.isArray(value.content)
    ? value.content.map((item) => item.text || '').join('')
    : value.content || ''
  if (!value.artifact) throw new Error('Tool did not return an artifact')
  return { content, artifact: value.artifact }
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

function binaryResponse(value: string, mimeType: string) {
  return new Response(Buffer.from(value), {
    status: 200,
    headers: { 'content-type': mimeType, 'content-length': String(value.length) }
  })
}
