import { buildSeedreamTools } from './tools.js'
import { normalizeVideoGenerationOptions } from './rules.js'
import { SeedreamAigcStrategy } from './strategy.js'
import { SeedreamAigcToolset } from './toolset.js'
import { SeedreamAigc, type SeedreamAigcCredentials, type SeedreamToolResult, type WorkspaceFilesApi } from './types.js'
import type { TBuiltinToolsetParams } from '@xpert-ai/plugin-sdk'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  BuiltinToolset: class {
    tools: any[] = []

    constructor(
      public providerName: string,
      protected toolset?: any,
      protected params?: any
    ) {}

    get xpertId() {
      return this.params?.xpertId
    }

    getCredentials() {
      return this.toolset?.credentials
    }
  },
  ToolsetStrategy: () => (target: any) => target
}))

type SeedreamInvocationOutput = SeedreamToolResult | {
  content?: SeedreamInvocationContent
  artifact?: SeedreamToolResult[1]
}
type SeedreamInvocationContent = string | Array<{ text?: string }> | undefined

describe('Seedream AIGC tools', () => {
  const credentials: SeedreamAigcCredentials = {
    ark_api_key: 'test-api-key',
    api_endpoint_host: 'https://ark.test/api/v3'
  }

  let fetchMock: jest.Mock
  let workspaceFiles: WorkspaceFilesApi

  beforeEach(() => {
    fetchMock = jest.fn()
    workspaceFiles = {
      uploadBuffer: jest.fn(async (input) => ({
        name: input.fileName ?? input.originalName,
        filePath: `${input.folder}/${input.fileName}`,
        workspacePath: `${input.folder}/${input.fileName}`,
        fileUrl: `https://workspace.example/${input.folder}/${input.fileName}`,
        url: `https://workspace.example/${input.folder}/${input.fileName}`,
        mimeType: input.mimeType ?? undefined,
        size: input.size ?? input.buffer.length,
        catalog: input.catalog ?? 'xperts',
        scopeId: input.scopeId
      })),
      readBuffer: jest.fn(),
      deleteFile: jest.fn()
    }
  })

  it('uploads text-to-image URL output to the workspace', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        data: [{ url: 'https://ark.test/generated/image.png', size: '2048x2048' }]
      }))
      .mockResolvedValueOnce(binaryResponse(Buffer.from('generated-image'), 'image/png'))

    const tool = buildSeedreamTools({ credentials, workspaceFiles, fetch: fetchMock }).find(
      (_) => _.name === 'seedream_text_to_image'
    )

    const result: SeedreamInvocationOutput | undefined = await tool?.invoke({
      id: 'call-1',
      name: 'seedream_text_to_image',
      type: 'tool_call',
      args: {
        prompt: 'a clean product render',
        watermark: 'false'
      }
    })

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://ark.test/api/v3/images/generations',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-api-key'
        })
      })
    )
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(
      expect.objectContaining({
        prompt: 'a clean product render',
        response_format: 'url',
        watermark: false
      })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://ark.test/generated/image.png', expect.any(Object))
    expect(workspaceFiles.uploadBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        buffer: Buffer.from('generated-image'),
        folder: 'files/seedream-aigc/images',
        mimeType: 'image/png',
        metadata: expect.objectContaining({
          provider: 'seedream_aigc',
          source: 'ark_image_generation'
        })
      })
    )
    const [content, artifact] = normalizeToolResult(result)
    expect(artifact.files[0]).toEqual(
      expect.objectContaining({
        catalog: 'xperts',
        fileUrl: expect.stringContaining('https://workspace.example/files/seedream-aigc/images/'),
        workspacePath: expect.stringContaining('files/seedream-aigc/images/')
      })
    )
    expect(content).toContain('https://workspace.example/files/seedream-aigc/images/')
    expect(content).toContain('workspacePath: files/seedream-aigc/images/')
    expect(content).toContain('filePath: files/seedream-aigc/images/')
    expect(content).toContain('mimeType: image/png')
    expect(content).toContain('catalog: xperts')
    expect(content).toContain('![')
    expect(JSON.stringify(result)).not.toContain('Z2VuZXJhdGVkLWltYWdl')
  })

  it('exposes localized defaults and select options for image tool schemas', () => {
    const tools = buildSeedreamTools({ credentials, workspaceFiles, fetch: fetchMock })
    const textToImageSchema = tools.find((_) => _.name === 'seedream_text_to_image')?.schema as any
    const multiImagesSchema = tools.find((_) => _.name === 'seedream_multi_images_to_multi_images')?.schema as any

    expect(textToImageSchema.properties.prompt['x-ui'].title.zh_Hans).toBe('提示词')
    expect(textToImageSchema.properties.prompt['x-ui'].component).toBeUndefined()
    expect(textToImageSchema.properties.size.default).toBe('2048x2048')
    expect(textToImageSchema.properties.size.enum).toEqual([
      '2048x2048',
      '2304x1728',
      '1728x2304',
      '2560x1440',
      '1440x2560',
      '2496x1664',
      '1664x2496',
      '3024x1296'
    ])
    expect(textToImageSchema.properties.size['x-ui'].enumLabels['2048x2048']).toBe('1:1 (2048x2048)')
    expect(textToImageSchema.properties.watermark.default).toBe('true')
    expect(textToImageSchema.properties.watermark.enum).toEqual(['true', 'false'])
    expect(textToImageSchema.properties.watermark['x-ui'].enumLabels['true'].zh_Hans).toBe('启用')
    expect(textToImageSchema.properties.model.default).toBe('doubao-seedream-4-5-251128')
    expect(textToImageSchema.properties.model.enum).toEqual([
      'doubao-seedream-4-0-250828',
      'doubao-seedream-4-5-251128',
      'doubao-seedream-5-0-lite-260128'
    ])
    expect(textToImageSchema.properties.sequential_image_generation).toBeUndefined()

    expect(multiImagesSchema.properties.input_image_files['x-ui'].title.zh_Hans).toBe('参考图片列表')
    expect(multiImagesSchema.properties.input_image_files.anyOf[0].type).toBe('array')
    expect(multiImagesSchema.properties.input_image_files.anyOf[0].minItems).toBe(2)
    expect(multiImagesSchema.properties.input_image_files.anyOf[0].maxItems).toBe(14)
    expect(multiImagesSchema.properties.input_image_files.anyOf[1].type).toBe('string')
    expect(multiImagesSchema.properties.max_images.default).toBe(3)
    expect(multiImagesSchema.properties.max_images['x-ui'].title.zh_Hans).toBe('最大生成张数')
  })

  it('exposes host-facing tool schemas through the Seedream strategy', () => {
    const strategy = new SeedreamAigcStrategy()
    const tools = strategy.createTools()
    const toolNames = tools.map((_) => _.name)
    const textToImageSchema = tools.find((_) => _.name === 'seedream_text_to_image')?.schema as any
    const videoQuerySchema = tools.find((_) => _.name === 'seedance_video_query')?.schema as any

    expect(strategy.meta.name).toBe(SeedreamAigc)
    expect(toolNames).toEqual(
      expect.arrayContaining([
        'seedream_text_to_image',
        'seedream_image_to_image',
        'seedream_multi_images_to_multi_images',
        'seedance_text_to_video',
        'seedance_video_query'
      ])
    )
    expect(textToImageSchema.properties.prompt['x-ui'].title.zh_Hans).toBe('提示词')
    expect(textToImageSchema.properties.size.default).toBe('2048x2048')
    expect(textToImageSchema.properties.model.default).toBe('doubao-seedream-4-5-251128')
    expect(videoQuerySchema.properties.task_id['x-ui'].title.zh_Hans).toBe('任务 ID')
    expect(videoQuerySchema.properties.download_video.default).toBe('true')
    expect(videoQuerySchema.required).toEqual(['task_id'])
  })

  it('exposes localized defaults and select options for video tool schemas', () => {
    const tools = buildSeedreamTools({ credentials, workspaceFiles, fetch: fetchMock })
    const textToVideoSchema = tools.find((_) => _.name === 'seedance_text_to_video')?.schema as any
    const imageToVideoSchema = tools.find((_) => _.name === 'seedance_image_to_video')?.schema as any
    const multimodalSchema = tools.find((_) => _.name === 'seedance_multimodal_reference_to_video')?.schema as any
    const videoQuerySchema = tools.find((_) => _.name === 'seedance_video_query')?.schema as any

    expect(textToVideoSchema.properties.prompt['x-ui'].title.zh_Hans).toBe('提示词')
    expect(textToVideoSchema.properties.model.default).toBe('doubao-seedance-1-5-pro-251215')
    expect(textToVideoSchema.properties.model.enum).toEqual([
      'doubao-seedance-1-5-pro-251215',
      'doubao-seedance-2-0-260128',
      'doubao-seedance-2-0-fast-260128'
    ])
    expect(textToVideoSchema.properties.resolution.default).toBe('720p')
    expect(textToVideoSchema.properties.resolution.enum).toEqual(['480p', '720p', '1080p'])
    expect(textToVideoSchema.properties.ratio.default).toBe('16:9')
    expect(textToVideoSchema.properties.ratio.enum).toContain('adaptive')
    expect(textToVideoSchema.properties.duration.default).toBe(5)
    expect(textToVideoSchema.properties.watermark.default).toBe('true')
    expect(textToVideoSchema.properties.watermark['x-ui'].enumLabels.true.zh_Hans).toBe('启用')
    expect(textToVideoSchema.required).toEqual(['prompt'])

    expect(imageToVideoSchema.properties.input_image_file['x-ui'].title.zh_Hans).toBe('参考图片')
    expect(imageToVideoSchema.required).toEqual(['prompt', 'input_image_file'])

    expect(multimodalSchema.properties.model.default).toBe('doubao-seedance-2-0-260128')
    expect(multimodalSchema.properties.model.enum).toEqual([
      'doubao-seedance-2-0-260128',
      'doubao-seedance-2-0-fast-260128'
    ])
    expect(multimodalSchema.properties.ratio.default).toBe('adaptive')
    expect(multimodalSchema.properties.input_mode.default).toBe('text_image_video')
    expect(multimodalSchema.properties.input_mode['x-ui'].enumLabels.text_image_video.zh_Hans).toBe('文本(可选)+图片+视频')

    expect(videoQuerySchema.properties.task_id['x-ui'].title.zh_Hans).toBe('任务 ID')
    expect(videoQuerySchema.properties.download_video.default).toBe('true')
    expect(videoQuerySchema.properties.download_video.enum).toEqual(['true', 'false'])
    expect(videoQuerySchema.properties.download_video['x-ui'].enumLabels.true.zh_Hans).toBe('启用')
    expect(videoQuerySchema.required).toEqual(['task_id'])
  })

  it('uses the xpert runtime context as workspace upload scope', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        data: [{ url: 'https://ark.test/generated/image.png', size: '2048x2048' }]
      }))
      .mockResolvedValueOnce(binaryResponse(Buffer.from('generated-image'), 'image/png'))

    const params: TBuiltinToolsetParams = {
      tenantId: 'tenant-1',
      userId: 'user-1',
      xpertId: 'xpert-1',
      env: {},
      commandBus: {} as TBuiltinToolsetParams['commandBus'],
      queryBus: {} as TBuiltinToolsetParams['queryBus']
    }
    const toolset = new SeedreamAigcToolset(
      { credentials },
      { get: jest.fn().mockReturnValue(workspaceFiles) },
      params
    )
    const tools = await toolset.initTools()
    const tool = tools.find((_) => _.name === 'seedream_text_to_image')
    const originalFetch = global.fetch
    global.fetch = fetchMock as typeof fetch

    try {
      await tool?.invoke({
        id: 'call-context',
        name: 'seedream_text_to_image',
        type: 'tool_call',
        args: {
          prompt: 'a clean product render'
        }
      })
    } finally {
      global.fetch = originalFetch
    }

    expect(workspaceFiles.uploadBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        userId: 'user-1',
        catalog: 'xperts',
        scopeId: 'xpert-1',
        xpertId: 'xpert-1'
      })
    )
  })

  it('uses the project runtime context before the xpert context as workspace upload scope', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        data: [{ url: 'https://ark.test/generated/image.png', size: '2048x2048' }]
      }))
      .mockResolvedValueOnce(binaryResponse(Buffer.from('generated-image'), 'image/png'))

    const params: TBuiltinToolsetParams = {
      tenantId: 'tenant-1',
      userId: 'user-1',
      projectId: 'project-1',
      xpertId: 'xpert-1',
      env: {},
      commandBus: {} as TBuiltinToolsetParams['commandBus'],
      queryBus: {} as TBuiltinToolsetParams['queryBus']
    }
    const toolset = new SeedreamAigcToolset(
      { credentials },
      { get: jest.fn().mockReturnValue(workspaceFiles) },
      params
    )
    const tools = await toolset.initTools()
    const tool = tools.find((_) => _.name === 'seedream_text_to_image')
    const originalFetch = global.fetch
    global.fetch = fetchMock as typeof fetch

    try {
      await tool?.invoke({
        id: 'call-project-context',
        name: 'seedream_text_to_image',
        type: 'tool_call',
        args: {
          prompt: 'a clean product render'
        }
      })
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

  it('uploads b64 image output to the workspace', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      data: [{ b64_json: Buffer.from('generated-image-b64').toString('base64'), size: '2048x2048' }]
    }))

    const tool = buildSeedreamTools({ credentials, workspaceFiles, fetch: fetchMock }).find(
      (_) => _.name === 'seedream_image_to_image'
    )

    const result: SeedreamInvocationOutput | undefined = await tool?.invoke({
      id: 'call-2',
      name: 'seedream_image_to_image',
      type: 'tool_call',
      args: {
        prompt: 'make it cinematic',
        input_image_file: `data:image/png;base64,${Buffer.from('input-image').toString('base64')}`
      }
    })

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(
      expect.objectContaining({
        image: expect.stringMatching(/^data:image\/png;base64,/),
        response_format: 'b64_json'
      })
    )
    expect(workspaceFiles.uploadBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        buffer: Buffer.from('generated-image-b64'),
        folder: 'files/seedream-aigc/images',
        mimeType: 'image/png'
      })
    )
    const [, artifact] = normalizeToolResult(result)
    expect(artifact.files[0].fileUrl).toContain('https://workspace.example/')
    expect(JSON.stringify(result)).not.toContain(Buffer.from('generated-image-b64').toString('base64'))
  })

  it('reads workspace image inputs through the workspace files API', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      data: [{ b64_json: Buffer.from('generated-image-b64').toString('base64'), size: '2048x2048' }]
    }))
    const readBufferMock = workspaceFiles.readBuffer as jest.Mock
    readBufferMock.mockResolvedValueOnce({
      name: 'input.png',
      filePath: 'files/source/input.png',
      workspacePath: 'files/source/input.png',
      buffer: Buffer.from('workspace-image'),
      mimeType: 'image/png',
      catalog: 'xperts'
    })

    const tool = buildSeedreamTools({ credentials, workspaceFiles, fetch: fetchMock }).find(
      (_) => _.name === 'seedream_image_to_image'
    )

    await tool?.invoke({
      id: 'call-workspace-input',
      name: 'seedream_image_to_image',
      type: 'tool_call',
      args: {
        prompt: 'make it cinematic',
        input_image_file: { filePath: 'files/source/input.png', mimeType: 'image/png' }
      }
    })

    expect(workspaceFiles.readBuffer).toHaveBeenCalledTimes(1)
    expect(workspaceFiles.readBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: 'files/source/input.png'
      })
    )
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(
      expect.objectContaining({
        image: `data:image/png;base64,${Buffer.from('workspace-image').toString('base64')}`
      })
    )
  })

  it('accepts JSON string arrays for multi-image inputs', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      data: [{ b64_json: Buffer.from('generated-image-b64').toString('base64'), size: '2048x2048' }]
    }))

    const tool = buildSeedreamTools({ credentials, workspaceFiles, fetch: fetchMock }).find(
      (_) => _.name === 'seedream_multi_images_to_multi_images'
    )
    const inputImages = [
      `data:image/png;base64,${Buffer.from('first-image').toString('base64')}`,
      `data:image/png;base64,${Buffer.from('second-image').toString('base64')}`
    ]

    await tool?.invoke({
      id: 'call-json-images',
      name: 'seedream_multi_images_to_multi_images',
      type: 'tool_call',
      args: {
        prompt: 'make two cats take a selfie',
        input_image_files: JSON.stringify(inputImages),
        max_images: 2
      }
    })

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(payload.image).toHaveLength(2)
    expect(payload.sequential_image_generation_options).toEqual({ max_images: 2 })
    expect(workspaceFiles.uploadBuffer).toHaveBeenCalled()
  })

  it('accepts numeric strings for Seedance video duration', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      id: 'task-1',
      status: 'submitted',
      model: 'doubao-seedance-1-5-pro-251215'
    }))

    const tool = buildSeedreamTools({ credentials, workspaceFiles, fetch: fetchMock }).find(
      (_) => _.name === 'seedance_text_to_video'
    )

    await tool?.invoke({
      id: 'call-video-duration',
      name: 'seedance_text_to_video',
      type: 'tool_call',
      args: {
        prompt: 'a small black cat in the rain',
        duration: '3',
        seed: '42'
      }
    })

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(payload.duration).toBe(4)
    expect(payload.seed).toBe(42)
  })

  it('returns the task id and query instruction for Seedance video submissions', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      id: 'task-1',
      status: 'submitted',
      model: 'doubao-seedance-1-5-pro-251215'
    }))

    const tool = buildSeedreamTools({ credentials, workspaceFiles, fetch: fetchMock }).find(
      (_) => _.name === 'seedance_text_to_video'
    )

    const result: SeedreamInvocationOutput | undefined = await tool?.invoke({
      id: 'call-video-submit',
      name: 'seedance_text_to_video',
      type: 'tool_call',
      args: {
        prompt: 'a small black cat looking for its mother'
      }
    })

    const [content, artifact] = normalizeToolResult(result)
    expect(content).toContain('Task ID: task-1')
    expect(content).toContain('Call seedance_video_query once')
    expect(content).toContain('Do not repeat the same query in this turn')
    expect(artifact.data).toEqual(
      expect.objectContaining({
        task_id: 'task-1',
        status: 'submitted',
        model: 'doubao-seedance-1-5-pro-251215'
      })
    )
  })

  it('tells the assistant to stop when a video query has no downloadable video yet', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      id: 'task-1',
      status: 'running',
      model: 'doubao-seedance-1-5-pro-251215',
      content: {}
    }))

    const tool = buildSeedreamTools({ credentials, workspaceFiles, fetch: fetchMock }).find(
      (_) => _.name === 'seedance_video_query'
    )

    const result: SeedreamInvocationOutput | undefined = await tool?.invoke({
      id: 'call-video-query-pending',
      name: 'seedance_video_query',
      type: 'tool_call',
      args: {
        task_id: 'task-1',
        download_video: 'true'
      }
    })

    const [content] = normalizeToolResult(result)
    expect(content).toContain('Video task task-1 status: running.')
    expect(content).toContain('No video_url is available yet')
    expect(content).toContain('Do not repeat seedance_video_query with the same task_id in this turn')
    expect(workspaceFiles.uploadBuffer).not.toHaveBeenCalled()
  })

  it('uploads completed video query output to the workspace', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        id: 'task-1',
        status: 'succeeded',
        model: 'doubao-seedance-1-5-pro-251215',
        content: {
          video_url: 'https://ark.test/generated/video.mp4',
          last_frame_url: 'https://ark.test/generated/last.png'
        }
      }))
      .mockResolvedValueOnce(binaryResponse(Buffer.from('generated-video'), 'video/mp4'))

    const tool = buildSeedreamTools({ credentials, workspaceFiles, fetch: fetchMock }).find(
      (_) => _.name === 'seedance_video_query'
    )

    const result: SeedreamInvocationOutput | undefined = await tool?.invoke({
      id: 'call-3',
      name: 'seedance_video_query',
      type: 'tool_call',
      args: {
        task_id: 'task-1',
        download_video: 'true'
      }
    })

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://ark.test/api/v3/contents/generations/tasks/task-1',
      expect.objectContaining({ method: 'GET' })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://ark.test/generated/video.mp4', expect.any(Object))
    expect(workspaceFiles.uploadBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        buffer: Buffer.from('generated-video'),
        folder: 'files/seedream-aigc/videos',
        fileName: 'task-1.mp4',
        mimeType: 'video/mp4'
      })
    )
    const [, artifact] = normalizeToolResult(result)
    expect(artifact.files[0]).toEqual(
      expect.objectContaining({
        fileName: 'task-1.mp4',
        fileUrl: expect.stringContaining('https://workspace.example/files/seedream-aigc/videos/task-1.mp4')
      })
    )
  })

  it('requires at least two reference images for multi-image tools', async () => {
    const tool = buildSeedreamTools({ credentials, workspaceFiles, fetch: fetchMock }).find(
      (_) => _.name === 'seedream_multi_images_to_image'
    )

    await expect(
      tool?.invoke({
        id: 'call-4',
        name: 'seedream_multi_images_to_image',
        type: 'tool_call',
        args: {
          prompt: 'merge references',
          input_image_files: [`data:image/png;base64,${Buffer.from('one-image').toString('base64')}`]
        }
      })
    ).rejects.toThrow()
  })

  it('enforces multimodal input mode requirements', async () => {
    const tool = buildSeedreamTools({ credentials, workspaceFiles, fetch: fetchMock }).find(
      (_) => _.name === 'seedance_multimodal_reference_to_video'
    )

    await expect(
      tool?.invoke({
        id: 'call-5',
        name: 'seedance_multimodal_reference_to_video',
        type: 'tool_call',
        args: {
          input_mode: 'text_image_video',
          reference_video_urls: 'https://ark.test/reference/video.mp4'
        }
      })
    ).rejects.toThrow('text(optional)+image+video requires at least one reference image')
  })

  it('normalizes Seedance 2.0 video options', () => {
    expect(
      normalizeVideoGenerationOptions({
        model: 'doubao-seedance-2-0-fast-250428',
        prompt: 'x'.repeat(600),
        resolution: '1080p',
        duration: '2',
        seed: '5000000000',
        service_tier: 'flex',
        draft: 'true',
        return_last_frame: 'true'
      })
    ).toEqual(
      expect.objectContaining({
        model: 'doubao-seedance-2-0-fast-260128',
        prompt: 'x'.repeat(500),
        resolution: '720p',
        duration: 4,
        seed: 4294967295,
        service_tier: 'default',
        draft: false,
        return_last_frame: true,
        isSeedance2: true
      })
    )
  })
})

function jsonResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => data,
    text: async () => JSON.stringify(data)
  } as Response
}

function binaryResponse(buffer: Buffer, mimeType: string): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers({ 'content-type': mimeType }),
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  } as Response
}

function normalizeToolResult(output: SeedreamInvocationOutput | undefined): SeedreamToolResult {
  if (Array.isArray(output)) {
    return output
  }
  if (output?.artifact) {
    return [normalizeToolContent(output.content), output.artifact]
  }
  throw new Error('Expected Seedream tool invocation to return content and artifact.')
}

function normalizeToolContent(content: SeedreamInvocationContent): string {
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    return content.map((part) => part.text ?? '').join('')
  }
  return ''
}
