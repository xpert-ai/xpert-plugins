import type { StructuredToolInterface } from '@langchain/core/tools'
import type { TBuiltinToolsetParams } from '@xpert-ai/plugin-sdk'
import { VeoStrategy } from './strategy.js'
import { buildVeoTools } from './tools.js'
import {
  VeoToolset,
  type VeoToolsetDescriptor
} from './toolset.js'
import type {
  VeoToolArtifact,
  VeoToolResult,
  WorkspaceFilesApi
} from './types.js'

describe('Google Veo video generation plugin', () => {
  const credentials = { gemini_api_key: 'gemini-test-key' }
  let fetchMock: jest.MockedFunction<typeof fetch>
  let uploadBuffer: jest.MockedFunction<WorkspaceFilesApi['uploadBuffer']>
  let readBuffer: jest.MockedFunction<WorkspaceFilesApi['readBuffer']>
  let readRuntimeBuffer: jest.MockedFunction<
    NonNullable<WorkspaceFilesApi['readRuntimeBuffer']>
  >
  let workspaceFiles: WorkspaceFilesApi

  beforeEach(() => {
    fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>
    uploadBuffer = jest.fn(async (input) => ({
      name: input.fileName ?? input.originalName,
      filePath: `${input.folder}/${input.fileName}`,
      workspacePath: `/workspace/${input.folder}/${input.fileName}`,
      fileUrl: `https://workspace.example/${input.folder}/${input.fileName}`,
      mimeType: input.mimeType ?? undefined,
      size: input.buffer.length,
      catalog: input.catalog ?? 'xperts',
      scopeId: input.scopeId ?? undefined
    }))
    readBuffer = jest.fn(async (input) => ({
      name: input.filePath.split('/').pop() || 'input.png',
      filePath: input.filePath,
      workspacePath: `/workspace/${input.filePath}`,
      buffer: Buffer.from('workspace-image'),
      mimeType: 'image/png',
      catalog: 'xperts' as const
    }))
    readRuntimeBuffer = jest.fn(async (input) => ({
      name: 'reference.png',
      filePath: readLocatorPath(input),
      workspacePath: `/workspace/${readLocatorPath(input)}`,
      buffer: Buffer.from('runtime-workspace-image'),
      mimeType: 'image/png',
      catalog: 'xperts' as const
    }))
    workspaceFiles = {
      uploadBuffer,
      readBuffer,
      readRuntimeBuffer,
      deleteFile: jest.fn(async () => undefined)
    }
  })

  it('declares an honest protocol v2 capability matrix without cancel', () => {
    const strategy = new VeoStrategy()

    expect(strategy.meta.videoGeneration).toEqual(
      expect.objectContaining({
        protocolVersion: 2,
        family: 'veo',
        defaultModel: 'veo-3.1-generate-preview',
        resolutions: ['720p', '1080p', '4k'],
        aspectRatios: ['16:9', '9:16'],
        supportsAudio: true
      })
    )
    expect(strategy.meta.videoGeneration.tools).toEqual({
      textToVideo: 'veo_text_to_video',
      imageToVideo: 'veo_image_to_video',
      firstLastFrameToVideo: 'veo_first_last_frame_to_video',
      referenceToVideo: 'veo_reference_to_video',
      query: 'veo_video_query'
    })
    expect(strategy.meta.videoGeneration.models).toHaveLength(2)
    for (const model of strategy.meta.videoGeneration.models) {
      expect(model.inputs).toEqual({
        referenceImages: { maxItems: 3 },
        initialFrame: true,
        lastFrame: true
      })
    }
  })

  it('maps authentication and text generation to predictLongRunning', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        name: 'models/veo-3.1-generate-preview/operations/op-text',
        done: false
      })
    )
    const tool = getTool('veo_text_to_video')

    const result = await invokeTool(tool, {
      prompt: 'A cinematic wide shot of a horse crossing a river.',
      model: 'veo-3.1-generate-preview',
      resolution: '720p',
      ratio: '16:9',
      duration: 6,
      generate_audio: 'true'
    })

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning'
    )
    expect(fetchMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-goog-api-key': 'gemini-test-key',
          'Content-Type': 'application/json'
        })
      })
    )
    expect(readRequestBody(fetchMock, 0)).toEqual({
      instances: [
        { prompt: 'A cinematic wide shot of a horse crossing a river.' }
      ],
      parameters: {
        aspectRatio: '16:9',
        durationSeconds: '6',
        resolution: '720p',
        personGeneration: 'allow_all'
      }
    })
    const [, artifact] = normalizeToolResult(result)
    expect(artifact.data).toEqual({
      task_id: 'models/veo-3.1-generate-preview/operations/op-text',
      status: 'submitted',
      model: 'veo-3.1-generate-preview'
    })
  })

  it('maps a Workspace image to instances[0].image.inlineData', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ name: 'models/veo-3.1-generate-preview/operations/op-image' })
    )
    const reference = workspaceReference('shots/shot-01.png')
    const tool = getTool('veo_image_to_video')

    await invokeTool(tool, {
      prompt: 'Animate the horse with a gentle forward camera move.',
      input_image_file: reference,
      duration: 8
    })

    expect(readRuntimeBuffer).toHaveBeenCalledWith(reference)
    expect(readRequestBody(fetchMock, 0)).toEqual({
      instances: [
        {
          prompt: 'Animate the horse with a gentle forward camera move.',
          image: {
            inlineData: {
              mimeType: 'image/png',
              data: Buffer.from('runtime-workspace-image').toString('base64')
            }
          }
        }
      ],
      parameters: {
        aspectRatio: '16:9',
        durationSeconds: '8',
        resolution: '720p',
        personGeneration: 'allow_adult'
      }
    })
  })

  it('maps first and final frames to image and lastFrame', async () => {
    readRuntimeBuffer
      .mockResolvedValueOnce(workspaceReadResult('first.png', 'first-frame'))
      .mockResolvedValueOnce(workspaceReadResult('final.png', 'final-frame'))
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ name: 'models/veo-3.1-fast-generate-preview/operations/op-frames' })
    )
    const tool = getTool('veo_first_last_frame_to_video')

    await invokeTool(tool, {
      prompt: 'Transition from the empty road to the arriving car.',
      model: 'veo-3.1-fast-generate-preview',
      first_frame_file: workspaceReference('first.png'),
      last_frame_file: workspaceReference('final.png'),
      duration: 8,
      resolution: '1080p',
      ratio: '9:16'
    })

    const body = readRequestBody(fetchMock, 0)
    expect(body.instances[0]).toEqual({
      prompt: 'Transition from the empty road to the arriving car.',
      image: inlineImage('first-frame'),
      lastFrame: inlineImage('final-frame')
    })
    expect(body.parameters).toEqual({
      aspectRatio: '9:16',
      durationSeconds: '8',
      resolution: '1080p',
      personGeneration: 'allow_adult'
    })
  })

  it('maps up to three asset references to referenceImages', async () => {
    readRuntimeBuffer
      .mockResolvedValueOnce(workspaceReadResult('person.png', 'person-image'))
      .mockResolvedValueOnce(workspaceReadResult('dress.png', 'dress-image'))
      .mockResolvedValueOnce(workspaceReadResult('glasses.png', 'glasses-image'))
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ name: 'models/veo-3.1-generate-preview/operations/op-references' })
    )
    const tool = getTool('veo_reference_to_video')

    await invokeTool(tool, {
      prompt: 'The woman wears the dress and glasses while walking by the sea.',
      reference_image_files: [
        workspaceReference('person.png'),
        workspaceReference('dress.png'),
        workspaceReference('glasses.png')
      ],
      duration: 8
    })

    expect(readRequestBody(fetchMock, 0).instances[0]).toEqual({
      prompt: 'The woman wears the dress and glasses while walking by the sea.',
      referenceImages: [
        { image: inlineImage('person-image'), referenceType: 'asset' },
        { image: inlineImage('dress-image'), referenceType: 'asset' },
        { image: inlineImage('glasses-image'), referenceType: 'asset' }
      ]
    })
  })

  it('rejects more than three references before provider submission', async () => {
    const tool = getTool('veo_reference_to_video')

    await expect(
      invokeTool(tool, {
        prompt: 'Use all references.',
        reference_image_files: [1, 2, 3, 4].map((index) =>
          workspaceReference(`ref-${index}.png`)
        ),
        duration: 8
      })
    ).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects non-8-second reference generation before reading or submitting', async () => {
    const tool = getTool('veo_reference_to_video')

    await expect(
      invokeTool(tool, {
        prompt: 'Use the character reference.',
        reference_image_files: [workspaceReference('character.png')],
        duration: 6
      })
    ).rejects.toThrow('requires an 8-second duration')
    expect(readRuntimeBuffer).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects high resolution with a short duration before submission', async () => {
    const tool = getTool('veo_text_to_video')

    await expect(
      invokeTool(tool, {
        prompt: 'A mountain at sunrise.',
        resolution: '4k',
        duration: 6
      })
    ).rejects.toThrow('requires an 8-second duration')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects attempts to disable Veo audio before submission', async () => {
    const tool = getTool('veo_text_to_video')

    await expect(
      invokeTool(tool, {
        prompt: 'A quiet empty room.',
        generate_audio: 'false'
      })
    ).rejects.toThrow('audio cannot be disabled')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects remote input URLs instead of fetching arbitrary hosts', async () => {
    const tool = getTool('veo_image_to_video')

    await expect(
      invokeTool(tool, {
        prompt: 'Animate this image.',
        input_image_file: 'https://untrusted.example/private.png'
      })
    ).rejects.toThrow('Workspace Files references')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns a running status without downloading or uploading', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        name: 'models/veo-3.1-generate-preview/operations/op-pending',
        done: false
      })
    )
    const tool = getTool('veo_video_query')

    const result = await invokeTool(tool, {
      task_id: 'models/veo-3.1-generate-preview/operations/op-pending',
      wait_seconds: 0,
      download_video: 'true'
    })

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview/operations/op-pending'
    )
    const [, artifact] = normalizeToolResult(result)
    expect(artifact.data).toEqual({
      task_id: 'models/veo-3.1-generate-preview/operations/op-pending',
      status: 'running'
    })
    expect(uploadBuffer).not.toHaveBeenCalled()
  })

  it('downloads a completed MP4 with the API key and uploads it to Workspace Files', async () => {
    const taskId = 'models/veo-3.1-generate-preview/operations/op-complete'
    const videoUri =
      'https://generativelanguage.googleapis.com/v1beta/files/generated-video:download?alt=media'
    fetchMock
      .mockResolvedValueOnce(completedOperation(taskId, videoUri))
      .mockResolvedValueOnce(
        binaryResponse(Buffer.from('generated-video'), 'video/mp4')
      )
    const tool = getTool('veo_video_query')

    const result = await invokeTool(tool, {
      task_id: taskId,
      download_video: true,
      wait_seconds: 0
    })

    expect(String(fetchMock.mock.calls[1][0])).toBe(videoUri)
    expect(fetchMock.mock.calls[1][1]).toEqual(
      expect.objectContaining({
        method: 'GET',
        redirect: 'manual',
        headers: { 'x-goog-api-key': 'gemini-test-key' }
      })
    )
    expect(uploadBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        buffer: Buffer.from('generated-video'),
        folder: 'files/veo/videos',
        fileName: 'op-complete.mp4',
        mimeType: 'video/mp4',
        metadata: {
          provider: 'veo_video_generation',
          source: 'gemini_veo_generation',
          taskId
        }
      })
    )
    const [, artifact] = normalizeToolResult(result)
    expect(artifact.files[0]).toEqual(
      expect.objectContaining({
        fileName: 'op-complete.mp4',
        workspacePath: '/workspace/files/veo/videos/op-complete.mp4',
        provider: 'veo_video_generation'
      })
    )
    expect(artifact.data).toEqual({ task_id: taskId, status: 'succeeded' })
    expect(JSON.stringify(artifact)).not.toContain(videoUri)
  })

  it('does not forward the Gemini API key to a redirected media host', async () => {
    const taskId = 'models/veo-3.1-generate-preview/operations/op-redirect'
    const videoUri =
      'https://generativelanguage.googleapis.com/v1beta/files/redirect:download'
    const redirectedUri = 'https://storage.googleapis.com/veo-output/video.mp4'
    fetchMock
      .mockResolvedValueOnce(completedOperation(taskId, videoUri))
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: redirectedUri }
        })
      )
      .mockResolvedValueOnce(
        binaryResponse(Buffer.from('redirected-video'), 'video/mp4')
      )
    const tool = getTool('veo_video_query')

    await invokeTool(tool, {
      task_id: taskId,
      download_video: true,
      wait_seconds: 0
    })

    expect(fetchMock.mock.calls[1][1]?.headers).toEqual({
      'x-goog-api-key': 'gemini-test-key'
    })
    expect(String(fetchMock.mock.calls[2][0])).toBe(redirectedUri)
    expect(fetchMock.mock.calls[2][1]?.headers).toBeUndefined()
  })

  it('returns normalized provider failure data without downloading', async () => {
    const taskId = 'models/veo-3.1-generate-preview/operations/op-failed'
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        name: taskId,
        done: true,
        error: {
          code: 400,
          status: 'INVALID_ARGUMENT',
          message: 'The prompt was rejected.'
        }
      })
    )
    const tool = getTool('veo_video_query')

    const result = await invokeTool(tool, { task_id: taskId })

    const [, artifact] = normalizeToolResult(result)
    expect(artifact.data).toEqual({
      task_id: taskId,
      status: 'failed',
      error: {
        code: 'INVALID_ARGUMENT',
        message: 'The prompt was rejected.'
      }
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(uploadBuffer).not.toHaveBeenCalled()
  })

  it('surfaces sanitized provider HTTP errors without exposing credentials or URLs', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: {
            status: 'INVALID_ARGUMENT',
            message: 'Invalid media at https://provider.example/private-video'
          }
        },
        400
      )
    )
    const tool = getTool('veo_text_to_video')

    await expect(
      invokeTool(tool, { prompt: 'A valid explicit generation request.' })
    ).rejects.toThrow(
      'Gemini Veo API error 400: Invalid media at [redacted-url]'
    )
    await expect(
      invokeProviderError(fetchMock, tool)
    ).rejects.not.toThrow('gemini-test-key')
  })

  it('uses project context as the Workspace Files output scope', async () => {
    const taskId = 'models/veo-3.1-generate-preview/operations/op-project'
    const videoUri =
      'https://generativelanguage.googleapis.com/v1beta/files/project-video:download'
    fetchMock
      .mockResolvedValueOnce(completedOperation(taskId, videoUri))
      .mockResolvedValueOnce(binaryResponse(Buffer.from('project-video'), 'video/mp4'))
    const params = createToolsetParams()
    const descriptor = {
      name: 'Veo workspace generator',
      credentials
    } as unknown as VeoToolsetDescriptor
    const toolset = new VeoToolset(
      descriptor,
      { get: jest.fn().mockReturnValue(workspaceFiles) },
      params
    )
    const originalFetch = global.fetch
    global.fetch = fetchMock

    try {
      const tools = await toolset.initTools()
      const tool = requireTool(tools, 'veo_video_query')
      await invokeTool(tool, { task_id: taskId })
    } finally {
      global.fetch = originalFetch
    }

    expect(uploadBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        userId: 'user-1',
        catalog: 'projects',
        scopeId: 'project-1',
        projectId: 'project-1'
      })
    )
  })

  function getTool(name: string) {
    return requireTool(
      buildVeoTools({
        credentials,
        workspaceFiles,
        fetch: fetchMock
      }),
      name
    )
  }
})

async function invokeProviderError(
  fetchMock: jest.MockedFunction<typeof fetch>,
  tool: StructuredToolInterface
) {
  fetchMock.mockResolvedValueOnce(
    jsonResponse({ error: { message: 'Second failure' } }, 400)
  )
  return invokeTool(tool, { prompt: 'A second explicit request.' })
}

function requireTool(tools: StructuredToolInterface[], name: string) {
  const tool = tools.find((candidate) => candidate.name === name)
  if (!tool) throw new Error(`Missing tool ${name}`)
  return tool
}

async function invokeTool(
  tool: StructuredToolInterface,
  args: Record<string, unknown>
) {
  return tool.invoke({
    id: `call-${tool.name}`,
    name: tool.name,
    type: 'tool_call',
    args
  })
}

function normalizeToolResult(result: unknown): VeoToolResult {
  if (Array.isArray(result)) return result as VeoToolResult
  if (isRecord(result) && isRecord(result.artifact)) {
    const content =
      typeof result.content === 'string'
        ? result.content
        : JSON.stringify(result.content ?? '')
    return [content, result.artifact as VeoToolArtifact]
  }
  throw new Error('Unexpected tool result')
}

function workspaceReference(filePath: string) {
  return {
    source: 'platform.workspace.files',
    filePath,
    workspacePath: `/workspace/${filePath}`,
    mimeType: 'image/png'
  }
}

function workspaceReadResult(filePath: string, bytes: string) {
  return {
    name: filePath,
    filePath,
    workspacePath: `/workspace/${filePath}`,
    buffer: Buffer.from(bytes),
    mimeType: 'image/png',
    catalog: 'xperts' as const
  }
}

function inlineImage(bytes: string) {
  return {
    inlineData: {
      mimeType: 'image/png',
      data: Buffer.from(bytes).toString('base64')
    }
  }
}

function completedOperation(taskId: string, videoUri: string) {
  return jsonResponse({
    name: taskId,
    done: true,
    response: {
      generateVideoResponse: {
        generatedSamples: [
          {
            video: {
              uri: videoUri,
              mimeType: 'video/mp4'
            }
          }
        ]
      }
    }
  })
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

function binaryResponse(buffer: Buffer, mimeType: string) {
  return new Response(buffer, {
    status: 200,
    headers: {
      'content-type': mimeType,
      'content-length': String(buffer.length)
    }
  })
}

function readRequestBody(
  fetchMock: jest.MockedFunction<typeof fetch>,
  callIndex: number
) {
  const body = fetchMock.mock.calls[callIndex][1]?.body
  if (typeof body !== 'string') throw new Error('Expected JSON request body')
  return JSON.parse(body) as {
    instances: Array<Record<string, unknown>>
    parameters: Record<string, unknown>
  }
}

function readLocatorPath(input: unknown) {
  if (typeof input === 'string') return input
  if (!isRecord(input)) return 'reference.png'
  const value = input.filePath ?? input.workspacePath ?? input.path
  return typeof value === 'string' ? value : 'reference.png'
}

function createToolsetParams(): TBuiltinToolsetParams {
  return {
    tenantId: 'tenant-1',
    userId: 'user-1',
    projectId: 'project-1',
    xpertId: 'xpert-1',
    env: {},
    commandBus: {} as TBuiltinToolsetParams['commandBus'],
    queryBus: {} as TBuiltinToolsetParams['queryBus']
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
