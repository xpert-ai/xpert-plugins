jest.mock('@xpert-ai/plugin-sdk', () => ({
  ...jest.requireActual('@xpert-ai/plugin-sdk'),
  BuiltinToolset: class {
    tools: unknown[] = []
    protected toolset?: { credentials?: unknown }

    constructor(public providerName: string, toolset?: { credentials?: unknown }, protected params?: any) {
      this.toolset = toolset
    }

    get xpertId() {
      return undefined
    }

    getCredentials() {
      return this.toolset?.credentials
    }

    get modelRuntime() {
      return this.params?.modelRuntime
    }

    async validateCredentials(credentials: unknown) {
      return this._validateCredentials(credentials)
    }

    async _validateCredentials(credentials: unknown) {
      void credentials
    }
  },
  ToolsetStrategy: () => (target: unknown) => target,
  XPERT_RUNTIME_CAPABILITIES_TOKEN: 'XPERT_RUNTIME_CAPABILITIES'
}))

import { ZhipuCogVideoClient } from './client.js'
import type { TBuiltinToolsetParams } from '@xpert-ai/plugin-sdk'
import { ZhipuCogVideoStrategy } from './strategy.js'
import { ZhipuCogVideoToolset } from './toolset.js'
import { buildZhipuCogVideoTools } from './tools.js'
import type { WorkspaceFilesApi, ZhipuCogVideoToolResult } from './types.js'

type ToolInvocationResult =
  | ZhipuCogVideoToolResult
  | {
      content?: string | Array<{ text?: string }>
      artifact?: ZhipuCogVideoToolResult[1]
    }

describe('ZhipuAI CogVideo', () => {
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
        catalog: input.catalog ?? ('xperts' as const),
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

  it('submits a text-to-video task with model-specific parameters', async () => {
    const recordInvocation = jest.fn().mockResolvedValue({ invocationId: 'invocation-1' })
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: 'task-1',
        model: 'cogvideox-3',
        task_status: 'PROCESSING',
        video_result: []
      })
    )

    const submit = getTool('zhipu_cogvideo_submit', recordInvocation)
    const result = await invokeTool(submit, {
      prompt: 'A paper boat crossing a moonlit lake',
      model: 'cogvideox-3',
      quality: 'quality',
      size: '1920x1080',
      fps: 60,
      duration: 10,
      with_audio: true
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://open.bigmodel.cn/api/paas/v4/videos/generations',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-key' })
      })
    )
    const request = fetchMock.mock.calls[0]?.[1]
    expect(JSON.parse(String(request?.body))).toEqual(
      expect.objectContaining({
        model: 'cogvideox-3',
        prompt: 'A paper boat crossing a moonlit lake',
        quality: 'quality',
        size: '1920x1080',
        fps: 60,
        duration: 10,
        with_audio: true,
        request_id: expect.any(String)
      })
    )
    expect(normalizeToolResult(result).content).toContain('Task ID: task-1')
    expect(recordInvocation).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        phase: 'start',
        invocationKey: 'call-zhipu_cogvideo_submit',
        provider: 'zhipu_cogvideo',
        modality: 'video'
      })
    )
    expect(recordInvocation).toHaveBeenNthCalledWith(2, {
      phase: 'bind',
      invocationId: 'invocation-1',
      providerRequestId: 'task-1'
    })
  })

  it('closes the invocation when Provider submission fails', async () => {
    const recordInvocation = jest.fn().mockResolvedValue({ invocationId: 'invocation-failed-submit' })
    fetchMock.mockRejectedValueOnce(new Error('ZhipuAI request failed before returning a task'))

    await expect(
      invokeTool(getTool('zhipu_cogvideo_submit', recordInvocation), {
        prompt: 'A paper boat crossing a moonlit lake'
      })
    ).rejects.toThrow('ZhipuAI request failed before returning a task')

    expect(recordInvocation).toHaveBeenNthCalledWith(2, {
      phase: 'observe',
      invocationId: 'invocation-failed-submit',
      state: 'acceptance_unknown',
      usageAvailability: 'unknown',
      errorCode: 'provider_acceptance_unknown'
    })
  })

  it('encodes a Workspace image for image-to-video', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: 'task-image',
        model: 'cogvideox-flash',
        task_status: 'PROCESSING',
        video_result: []
      })
    )

    const submit = getTool('zhipu_cogvideo_submit')
    await invokeTool(submit, {
      input_image_file: { filePath: 'files/reference.png' },
      model: 'cogvideox-flash'
    })

    const request = fetchMock.mock.calls[0]?.[1]
    expect(JSON.parse(String(request?.body))).toEqual(
      expect.objectContaining({
        model: 'cogvideox-flash',
        image_url: 'data:image/png;base64,cG5n',
        duration: 5
      })
    )
    expect(JSON.parse(String(request?.body))).not.toHaveProperty('quality')
    expect(JSON.parse(String(request?.body))).not.toHaveProperty('size')
    expect(JSON.parse(String(request?.body))).not.toHaveProperty('fps')
    expect(workspaceFiles.readBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: 'files/reference.png'
      })
    )
  })

  it('reuses a task already bound to the same tool call without submitting again', async () => {
    const recordInvocation = jest.fn().mockResolvedValue({
      invocationId: 'invocation-existing',
      created: false,
      providerRequestId: 'task-existing',
      providerState: 'submitted'
    })

    const result = await invokeTool(getTool('zhipu_cogvideo_submit', recordInvocation), {
      prompt: 'A paper boat crossing a moonlit lake'
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(normalizeToolResult(result).artifact.data).toEqual(
      expect.objectContaining({ task_id: 'task-existing', status: 'submitted' })
    )
  })

  it('polls a processing task and uploads video and cover artifacts on success', async () => {
    const recordInvocation = jest.fn().mockResolvedValue({ invocationId: 'invocation-2' })
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'task-2',
          model: 'cogvideox-3',
          task_status: 'PROCESSING',
          video_result: []
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'task-2',
          model: 'cogvideox-3',
          task_status: 'SUCCESS',
          video_result: [
            {
              url: 'https://provider.example/video.mp4',
              cover_image_url: 'https://provider.example/cover.jpg'
            }
          ]
        })
      )
      .mockResolvedValueOnce(binaryResponse('video', 'video/mp4'))
      .mockResolvedValueOnce(binaryResponse('cover', 'image/jpeg'))

    const query = getTool('zhipu_cogvideo_query', recordInvocation)
    const result = await invokeTool(query, { task_id: 'task-2', wait_seconds: 5 })
    const normalized = normalizeToolResult(result)

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://open.bigmodel.cn/api/paas/v4/async-result/task-2')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://open.bigmodel.cn/api/paas/v4/async-result/task-2')
    expect(fetchMock.mock.calls[2]?.[0]).toBe('https://provider.example/video.mp4')
    expect(fetchMock.mock.calls[3]?.[0]).toBe('https://provider.example/cover.jpg')
    expect(workspaceFiles.uploadBuffer).toHaveBeenCalledTimes(2)
    expect(normalized.artifact.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ mimeType: 'video/mp4', extension: 'mp4' }),
        expect.objectContaining({ mimeType: 'image/jpeg', extension: 'jpg' })
      ])
    )
    expect(normalized.content).toContain('Generated files:')
    expect(recordInvocation).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'observe',
        providerRequestId: 'task-2',
        state: 'succeeded',
        usageAvailability: 'available',
        metrics: [{ unit: 'generation', quantity: 1, authority: 'contract' }]
      })
    )
    const succeededObservation = recordInvocation.mock.calls.findIndex(
      ([event]) => event.phase === 'observe' && event.state === 'succeeded'
    )
    expect(recordInvocation.mock.invocationCallOrder[succeededObservation]).toBeLessThan(
      (workspaceFiles.uploadBuffer as jest.Mock).mock.invocationCallOrder[0]
    )
  })

  it('returns a durable processing status without waiting when wait_seconds is zero', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: 'task-3',
        model: 'cogvideox-flash',
        task_status: 'PROCESSING',
        video_result: []
      })
    )

    const query = getTool('zhipu_cogvideo_query')
    const result = await invokeTool(query, { task_id: 'task-3', wait_seconds: 0 })
    const normalized = normalizeToolResult(result)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(normalized.content).toContain('continues running')
    expect(normalized.artifact.data).toEqual(
      expect.objectContaining({
        task_id: 'task-3',
        status: 'PROCESSING'
      })
    )
  })

  it('throws a provider task error', async () => {
    const recordInvocation = jest.fn().mockResolvedValue({ invocationId: 'invocation-fail' })
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: 'task-fail',
        model: 'cogvideox-flash',
        task_status: 'FAIL',
        video_result: [],
        error: { message: 'content rejected' }
      })
    )

    const query = getTool('zhipu_cogvideo_query', recordInvocation)
    await expect(invokeTool(query, { task_id: 'task-fail', wait_seconds: 0 })).rejects.toThrow('content rejected')
    expect(recordInvocation).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'observe',
        providerRequestId: 'task-fail',
        state: 'failed',
        usageAvailability: 'unknown'
      })
    )
  })

  it('exposes the toolset metadata and both tools', () => {
    const strategy = new ZhipuCogVideoStrategy()
    expect(strategy.meta.name).toBe('zhipu_cogvideo')
    expect(strategy.meta.configSchema.properties).toEqual({})
    expect(strategy.meta.configSchema.required).toBeUndefined()
    expect(strategy.createTools().map((item: { name: string }) => item.name)).toEqual([
      'zhipu_cogvideo_submit',
      'zhipu_cogvideo_query'
    ])
  })

  it('uses the configured ZhipuAI model provider instead of Toolset credentials', async () => {
    const getModelProvider = jest.fn().mockResolvedValue({
      providerScopeId: 'zhipu-provider-1',
      provider: 'zhipuai',
      baseURL: 'https://provider.bigmodel.example/v4',
      authorization: 'Bearer provider-key'
    })
    const params: TBuiltinToolsetParams = {
      tenantId: 'tenant-1',
      env: {},
      commandBus: {} as TBuiltinToolsetParams['commandBus'],
      queryBus: {} as TBuiltinToolsetParams['queryBus'],
      modelRuntime: { createModelClient: jest.fn(), getModelProvider }
    }
    const toolset = new ZhipuCogVideoToolset(
      { credentials: { api_key: 'stale-toolset-key' } },
      { get: jest.fn().mockReturnValue(workspaceFiles) },
      params
    )

    await toolset.validateCredentials({})
    await toolset.initTools()

    expect(getModelProvider).toHaveBeenCalledWith('zhipuai')
    expect(getModelProvider).toHaveBeenCalledTimes(1)
  })

  it('calls the REST endpoints with bearer authentication', async () => {
    const client = new ZhipuCogVideoClient(
      {
        api_key: 'test-key',
        endpoint_url: 'https://zhipu.example/api/paas/v4'
      },
      fetchMock
    )
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: 'task-client',
        task_status: 'PROCESSING',
        video_result: []
      })
    )

    await client.submitVideo({ model: 'cogvideox-flash' })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://zhipu.example/api/paas/v4/videos/generations')
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-key' })
      })
    )
  })

  function getTool(name: string, recordInvocation?: jest.Mock) {
    const found = buildZhipuCogVideoTools({
      credentials: { api_key: 'test-key' },
      workspaceFiles,
      fetch: fetchMock,
      sleep: jest.fn(async () => undefined),
      recordInvocation
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
    headers: {
      'content-type': mimeType,
      'content-length': String(Buffer.byteLength(value))
    }
  })
}
