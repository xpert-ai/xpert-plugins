import type { TBuiltinToolsetParams } from '@xpert-ai/plugin-sdk'
import { buildKlingTools } from './tools.js'
import { KlingClient } from './client.js'
import { KlingVideoModelClient } from './model.js'
import { KlingVideoStrategy } from './strategy.js'
import { KlingVideoToolset } from './toolset.js'
import { KlingProviderStrategy } from './provider.strategy.js'
import type { KlingToolResult, WorkspaceFilesApi } from './types.js'
import { normalizeKlingVideoObservation } from './usage.js'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  ...jest.requireActual('@xpert-ai/plugin-sdk'),
  BuiltinToolset: class {
    tools: unknown[] = []
    constructor(public providerName: string, protected toolset?: any, protected params?: any) {}
    get xpertId() {
      return this.params?.xpertId
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
  AIModelProviderStrategy: () => (target: unknown) => target,
  CredentialsValidateFailedError: class CredentialsValidateFailedError extends Error {},
  ModelProvider: class ModelProvider {},
  XpertServerPlugin: () => (target: unknown) => target
}))

describe('Kling video tools', () => {
  const credentials = { api_key: 'test-api-key', api_endpoint_host: 'https://api.kling.test' }
  let fetchMock: jest.Mock
  let workspaceFiles: WorkspaceFilesApi

  beforeEach(() => {
    fetchMock = jest.fn()
    workspaceFiles = {
      uploadBuffer: jest.fn(async (input) => ({
        name: input.fileName ?? input.originalName,
        filePath: `${input.folder}/${input.fileName}`,
        workspacePath: `${input.folder}/${input.fileName}`,
        fileUrl: `https://workspace.test/${input.folder}/${input.fileName}`,
        mimeType: input.mimeType ?? undefined,
        size: input.size ?? input.buffer.length,
        catalog: input.catalog ?? 'xperts',
        scopeId: input.scopeId
      })),
      readBuffer: jest.fn(async () => ({
        name: 'input.png',
        filePath: 'files/input.png',
        workspacePath: 'files/input.png',
        mimeType: 'image/png',
        catalog: 'projects' as const,
        buffer: png(640, 480)
      })),
      readRuntimeBuffer: jest.fn(async () => ({
        name: 'input.png',
        filePath: 'files/input.png',
        workspacePath: 'files/input.png',
        mimeType: 'image/png',
        catalog: 'projects' as const,
        buffer: png(640, 480)
      })),
      deleteFile: jest.fn()
    }
  })

  it('maps authenticated Kling 3.0 text-to-video requests', async () => {
    const recordInvocation = jest.fn().mockResolvedValue({ invocationId: 'invocation-text' })
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 0, data: { id: 'task-text', status: 'submitted' } }))
    const result = await invoke(
      'kling_text_to_video',
      {
        prompt: 'A quiet wide shot',
        model: 'kling-v3',
        resolution: '1080p',
        ratio: '16:9',
        duration: 8,
        generate_audio: 'true',
        multi_shot: 'false',
        watermark: 'false'
      },
      recordInvocation
    )

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.kling.test/text-to-video/kling-3.0',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-api-key' })
      })
    )
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      prompt: 'A quiet wide shot',
      settings: { resolution: '1080p', duration: 8, aspect_ratio: '16:9', audio: 'native', multi_shot: false },
      options: { watermark_info: { enabled: false } }
    })
    expect(normalizeResult(result)[1].data).toEqual({ task_id: 'task-text', status: 'submitted', model: 'kling-v3' })
    expect(recordInvocation).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        phase: 'start',
        invocationKey: 'call-kling_text_to_video',
        provider: 'kling_video',
        operation: 'text_to_video',
        pricingDimensions: {
          durationSeconds: 8,
          resolution: '1080p',
          audio: true,
          mode: 'text_to_video'
        }
      })
    )
    expect(recordInvocation).toHaveBeenNthCalledWith(2, {
      phase: 'bind',
      invocationId: 'invocation-text',
      providerRequestId: 'task-text'
    })
  })

  it('closes the invocation when Provider submission fails', async () => {
    const recordInvocation = jest.fn().mockResolvedValue({ invocationId: 'invocation-failed-submit' })
    fetchMock.mockRejectedValueOnce(new Error('Kling request failed before returning a task'))

    await expect(
      invoke('kling_text_to_video', { prompt: 'A quiet wide shot' }, recordInvocation)
    ).rejects.toThrow('Kling request failed before returning a task')

    expect(recordInvocation).toHaveBeenNthCalledWith(2, {
      phase: 'observe',
      invocationId: 'invocation-failed-submit',
      state: 'acceptance_unknown',
      usageAvailability: 'unknown',
      errorCode: 'provider_acceptance_unknown'
    })
  })

  it('maps Workspace images for image and first/last-frame modes', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { id: 'task-image', status: 'submitted' } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { id: 'task-frames', status: 'submitted' } }))

    await invoke('kling_image_to_video', {
      prompt: 'Move forward',
      model: 'kling-3.0-turbo',
      input_image_file: workspaceRef(),
      duration: 5
    })
    await invoke('kling_first_last_frame_to_video', {
      prompt: 'Transition smoothly',
      model: 'kling-v3',
      first_frame_file: workspaceRef(),
      last_frame_file: workspaceRef()
    })

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.kling.test/image-to-video/kling-3.0-turbo')
    const imageBody = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(imageBody.contents).toEqual([
      { type: 'prompt', text: 'Move forward' },
      expect.objectContaining({ type: 'first_frame', url: expect.any(String) })
    ])
    expect(imageBody.contents[1].url).not.toContain('data:')
    expect(imageBody.settings).toEqual({ resolution: '720p', duration: 5 })

    expect(fetchMock.mock.calls[1][0]).toBe('https://api.kling.test/image-to-video/kling-3.0')
    const frameBody = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(frameBody.contents.map((item: { type: string }) => item.type)).toEqual([
      'prompt',
      'first_frame',
      'last_frame'
    ])
  })

  it('reuses a task already bound to the same tool call without submitting again', async () => {
    const recordInvocation = jest.fn().mockResolvedValue({
      invocationId: 'invocation-existing',
      created: false,
      providerRequestId: 'task-existing',
      providerState: 'submitted'
    })

    const result = normalizeResult(
      await invoke('kling_text_to_video', { prompt: 'A quiet wide shot' }, recordInvocation)
    )

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result[1].data).toEqual(expect.objectContaining({ task_id: 'task-existing', status: 'submitted' }))
  })

  it('maps up to seven raw reference images only to Kling 3.0 Omni', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 0, data: { id: 'task-ref', status: 'submitted' } }))
    await invoke('kling_reference_to_video', {
      prompt: 'Use the visual references',
      model: 'kling-v3-omni',
      reference_image_files: [workspaceRef(), workspaceRef()]
    })
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.kling.test/omni-video/kling-3.0-omni')
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.contents.slice(1)).toEqual([
      expect.objectContaining({ type: 'refer_image', id: 'image_1' }),
      expect.objectContaining({ type: 'refer_image', id: 'image_2' })
    ])
  })

  it('rejects unsupported or invalid inputs before paid submission', async () => {
    await expect(
      invoke('kling_text_to_video', {
        prompt: 'Audio request',
        model: 'kling-3.0-turbo',
        generate_audio: 'true'
      })
    ).rejects.toThrow('does not support native audio')
    await expect(
      invoke('kling_reference_to_video', {
        prompt: 'Too many',
        model: 'kling-v3-omni',
        reference_image_files: Array(8).fill(workspaceRef())
      })
    ).rejects.toThrow('expected schema')
    workspaceFiles.readRuntimeBuffer = jest.fn(async () => ({
      name: 'tiny.png',
      filePath: 'tiny.png',
      workspacePath: 'tiny.png',
      mimeType: 'image/png',
      catalog: 'projects' as const,
      buffer: png(100, 100)
    }))
    await expect(
      invoke('kling_image_to_video', {
        prompt: 'Tiny image',
        model: 'kling-v3',
        input_image_file: workspaceRef()
      })
    ).rejects.toThrow('at least 300 pixels')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns pending and failed task state without exposing provider URLs', async () => {
    const recordInvocation = jest.fn().mockResolvedValue({ invocationId: 'invocation-query' })
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: [{ id: 'pending-1', status: 'processing' }] }))
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          data: [
            {
              id: 'failed-1',
              status: 'failed',
              message: 'policy failure https://provider.example/private.mp4'
            }
          ]
        })
      )
    const pending = normalizeResult(
      await invoke(
        'kling_video_query',
        {
          task_id: 'pending-1',
          wait_seconds: 0,
          download_video: 'true'
        },
        recordInvocation
      )
    )
    const failed = normalizeResult(
      await invoke(
        'kling_video_query',
        {
          task_id: 'failed-1',
          wait_seconds: 0,
          download_video: 'true'
        },
        recordInvocation
      )
    )
    expect(pending[1].files).toEqual([])
    expect(failed[1].data?.error).toContain('[redacted-url]')
    expect(JSON.stringify(failed)).not.toContain('provider.example')
    expect(recordInvocation).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        phase: 'observe',
        providerRequestId: 'pending-1',
        state: 'processing',
        usageAvailability: 'pending'
      })
    )
    expect(recordInvocation).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        phase: 'observe',
        providerRequestId: 'failed-1',
        state: 'failed',
        usageAvailability: 'unknown'
      })
    )
  })

  it('downloads a completed MP4 without forwarding auth and archives it to Workspace Files', async () => {
    const recordInvocation = jest.fn().mockResolvedValue({ invocationId: 'invocation-done' })
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          data: [
            {
              id: 'done-1',
              status: 'succeeded',
              model: 'kling-v3',
              outputs: [{ type: 'video', id: 'video-1', url: 'https://media.kling.test/result.mp4', duration: '5' }]
            }
          ]
        })
      )
      .mockResolvedValueOnce(binaryResponse(Buffer.from('mp4-data'), 'video/mp4'))
    const result = normalizeResult(
      await invoke(
        'kling_video_query',
        {
          task_id: 'done-1',
          wait_seconds: 0,
          download_video: 'true'
        },
        recordInvocation
      )
    )

    expect(fetchMock).toHaveBeenNthCalledWith(2, new URL('https://media.kling.test/result.mp4'), {
      method: 'GET',
      redirect: 'manual'
    })
    expect(workspaceFiles.uploadBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        folder: 'files/kling/videos',
        fileName: 'done-1.mp4',
        mimeType: 'video/mp4',
        metadata: { provider: 'kling_video', source: 'kling_video_generation', taskId: 'done-1' }
      })
    )
    expect(result[1].files[0].workspacePath).toContain('files/kling/videos/done-1.mp4')
    expect(JSON.stringify(result)).not.toContain('media.kling.test')
    expect(recordInvocation).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        phase: 'observe',
        providerRequestId: 'done-1',
        state: 'succeeded',
        usageAvailability: 'available',
        metrics: [{ unit: 'second', quantity: 5, authority: 'provider' }]
      })
    )
    expect(recordInvocation.mock.invocationCallOrder[0]).toBeLessThan(
      (workspaceFiles.uploadBuffer as jest.Mock).mock.invocationCallOrder[0]
    )
  })

  it('uses persisted request duration only when Provider output duration is absent', () => {
    expect(
      normalizeKlingVideoObservation({ id: 'done-fallback', status: 'succeeded', outputs: [] }, { durationSeconds: 8 })
    ).toEqual({
      state: 'succeeded',
      usageAvailability: 'available',
      metrics: [{ unit: 'second', quantity: 8, authority: 'request' }]
    })
    expect(normalizeKlingVideoObservation({ id: 'done-unknown', status: 'succeeded', outputs: [] })).toEqual({
      state: 'succeeded',
      usageAvailability: 'unknown'
    })
  })

  it('does not expose provider response bodies for HTTP errors', async () => {
    fetchMock.mockResolvedValueOnce(new Response('secret https://provider.example/private.mp4', { status: 500 }))
    const error = await invoke('kling_text_to_video', { prompt: 'A shot' }).catch((caught: unknown) => caught)
    expect(String(error)).toContain('HTTP 500')
    expect(String(error)).not.toContain('provider.example')
  })

  it('rejects private result hosts before downloading', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        code: 0,
        data: [
          {
            id: 'private-1',
            status: 'succeeded',
            outputs: [{ type: 'video', url: 'https://127.0.0.1/internal.mp4' }]
          }
        ]
      })
    )

    await expect(
      invoke('kling_video_query', {
        task_id: 'private-1',
        wait_seconds: 0,
        download_video: 'true'
      })
    ).rejects.toThrow('public HTTPS host')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('declares localized protocol v2 capabilities without cancel or reference video/audio', () => {
    const strategy = new KlingVideoStrategy()
    expect(strategy.meta.videoGeneration).toMatchObject({
      protocolVersion: 2,
      family: 'kling',
      defaultModel: 'kling-v3',
      tools: { query: 'kling_video_query' }
    })
    expect(strategy.meta.videoGeneration.tools).not.toHaveProperty('cancel')
    expect(strategy.meta.videoGeneration.models[1].inputs).toEqual({
      referenceImages: { maxItems: 7 },
      initialFrame: true,
      lastFrame: true
    })
    expect(strategy.meta.configSchema.properties).toEqual({})
    expect(strategy.meta.configSchema).not.toHaveProperty('required')
    const schema = buildKlingTools({ credentials, workspaceFiles, fetch: fetchMock }).find(
      (item) => item.name === 'kling_text_to_video'
    )?.schema as {
      properties: { prompt: { 'x-ui': { title: { zh_Hans: string } } } }
    }
    expect(schema.properties.prompt['x-ui'].title.zh_Hans).toBe('创作要求')
  })

  it('registers Kling as a model provider with the same credential contract', async () => {
    const provider = new KlingProviderStrategy()

    expect(provider.getBaseUrl(credentials)).toBe('https://api.kling.test')
    expect(provider.getAuthorization(credentials)).toBe('Bearer test-api-key')
    await expect(provider.validateProviderCredentials(credentials)).resolves.toBeUndefined()
    await expect(provider.validateProviderCredentials({})).rejects.toThrow('Kling API key is missing')
  })

  it('uses project scope before Xpert scope for Workspace output', async () => {
    const params: TBuiltinToolsetParams = {
      tenantId: 'tenant-1',
      userId: 'user-1',
      projectId: 'project-1',
      xpertId: 'xpert-1',
      env: {},
      commandBus: {} as TBuiltinToolsetParams['commandBus'],
      queryBus: {} as TBuiltinToolsetParams['queryBus'],
      modelRuntime: {
        createModelClient: jest
          .fn()
          .mockResolvedValue(new KlingVideoModelClient(new KlingClient(credentials, fetchMock as typeof fetch))),
        getModelProvider: jest.fn().mockResolvedValue({
          providerScopeId: 'kling-provider-1',
          copilotId: 'kling-copilot-1',
          provider: 'kling',
          baseURL: credentials.api_endpoint_host,
          authorization: `Bearer ${credentials.api_key}`
        })
      }
    }
    const toolset = new KlingVideoToolset(
      { name: 'Kling test toolset', credentials },
      { get: jest.fn().mockReturnValue(workspaceFiles) },
      params
    )
    await toolset.validateCredentials({})
    const tools = await toolset.initTools()
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          data: [
            {
              id: 'scope-1',
              status: 'succeeded',
              outputs: [{ type: 'video', url: 'https://media.kling.test/scope.mp4' }]
            }
          ]
        })
      )
      .mockResolvedValueOnce(binaryResponse(Buffer.from('mp4'), 'video/mp4'))
    const originalFetch = global.fetch
    global.fetch = fetchMock as typeof fetch
    try {
      await tools.find((item) => item.name === 'kling_video_query')?.invoke({ task_id: 'scope-1', wait_seconds: 0 })
    } finally {
      global.fetch = originalFetch
    }
    expect(workspaceFiles.uploadBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        userId: 'user-1',
        catalog: 'projects',
        scopeId: 'project-1',
        projectId: 'project-1'
      })
    )
  })

  async function invoke(name: string, args: Record<string, unknown>, recordInvocation?: jest.Mock) {
    const selected = buildKlingTools({ credentials, workspaceFiles, fetch: fetchMock, recordInvocation }).find(
      (item) => item.name === name
    )
    if (!selected) throw new Error(`Missing tool ${name}`)
    return selected.invoke({ id: `call-${name}`, name, type: 'tool_call', args })
  }
})

function workspaceRef() {
  return { source: 'workspace', filePath: 'files/input.png', mimeType: 'image/png' }
}

function png(width: number, height: number) {
  const buffer = Buffer.alloc(24)
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer)
  buffer.writeUInt32BE(width, 16)
  buffer.writeUInt32BE(height, 20)
  return buffer
}

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
}

function binaryResponse(buffer: Buffer, mimeType: string) {
  return new Response(buffer, { status: 200, headers: { 'content-type': mimeType } })
}

function normalizeResult(value: unknown): KlingToolResult {
  if (Array.isArray(value)) return value as KlingToolResult
  const wrapped = value as { content?: string | Array<{ text?: string }>; artifact?: KlingToolResult[1] }
  const content =
    typeof wrapped.content === 'string'
      ? wrapped.content
      : wrapped.content?.map((item) => item.text ?? '').join('\n') ?? ''
  return [content, wrapped.artifact ?? { files: [] }]
}
