jest.mock('@metad/contracts', () => ({
  getToolCallIdFromConfig: jest.fn((config) => config?.configurable?.tool_call_id)
}))

import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import { buildViewImageResizeOptions, ViewImageService } from './view-image.service.js'
import { DEFAULT_VIEW_IMAGE_COMPRESSION_PERCENT, ViewImageToolInputSchema } from './view-image.types.js'

const ONE_BY_ONE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jYVwAAAAASUVORK5CYII=',
  'base64'
)
const DEFAULT_WORKSPACE_ROOT = '/workspace'
const HOST_WORKSPACE_ROOT = '/Users/test/data'

describe('ViewImageService', () => {
  const service = new ViewImageService()

  function createRunConfig(
    backend: { workingDirectory: string; downloadFiles: jest.Mock },
    toolCallId: string,
    workspaceRoot = DEFAULT_WORKSPACE_ROOT
  ) {
    return {
      configurable: {
        thread_id: 'thread-1',
        agentKey: 'agent-1',
        tool_call_id: toolCallId,
        sandbox: {
          backend,
          workingDirectory: workspaceRoot,
          workspaceBinding: {
            workspaceRoot
          }
        },
        copilotModel: {
          options: {
            vision_support: 'support'
          }
        }
      }
    }
  }

  it('loads a relative sandbox image inside the configured workspace root', async () => {
    const backend = {
      workingDirectory: '/tmp/local-sandbox',
      downloadFiles: jest.fn().mockResolvedValue([
        {
          path: 'chart.png',
          content: ONE_BY_ONE_PNG,
          error: null
        }
      ])
    }
    const tool = service.createTool()

    const result = (await tool.invoke(
      { path: 'chart.png' },
      createRunConfig(backend, 'call_view_image_1', HOST_WORKSPACE_ROOT)
    )) as ToolMessage

    expect(result).toBeInstanceOf(ToolMessage)
    expect(backend.downloadFiles).toHaveBeenCalledWith(['chart.png'])
    expect(result.metadata?.view_image).toEqual(
      expect.objectContaining({
        toolCallId: 'call_view_image_1',
        items: [
          expect.objectContaining({
            target: 'chart.png',
            resolvedPath: `${HOST_WORKSPACE_ROOT}/chart.png`,
            downloadPath: 'chart.png',
            fileName: 'chart.png',
            mimeType: 'image/png'
          })
        ]
      })
    )
    expect(result.content).toContain('The system will attach them automatically')
  })

  it('exposes the 3-image per-call limit in the tool contract', () => {
    const tool = service.createTool()

    expect(tool.description).toContain('at most 3 images per call')
    expect(tool.description).toContain('separate model steps')
    expect(service.buildSystemPrompt()).toContain('Pass at most 3 image paths')
    expect(service.buildSystemPrompt()).toContain('Do not load more than 3 images total in the same model step')
    expect(ViewImageToolInputSchema.safeParse({ path: ['one.png', 'two.png', 'three.png'] }).success).toBe(true)
    expect(ViewImageToolInputSchema.safeParse({ path: ['one.png', 'two.png', 'three.png', 'four.png'] }).success).toBe(
      false
    )
    expect(ViewImageToolInputSchema.safeParse({ paths: ['one.png', 'two.png', 'three.png', 'four.png'] }).success).toBe(
      false
    )
  })

  it('resolves middleware config with the default compression percent', () => {
    expect(service.resolveMiddlewareConfig({})).toEqual({
      compressionPercent: DEFAULT_VIEW_IMAGE_COMPRESSION_PERCENT
    })
  })

  it('resolves middleware config with a custom compression percent', () => {
    expect(service.resolveMiddlewareConfig({ compressionPercent: 50 })).toEqual({
      compressionPercent: 50
    })
  })

  it('rejects invalid middleware compression percent values', () => {
    expect(() => service.resolveMiddlewareConfig({ compressionPercent: -1 })).toThrow()
    expect(() => service.resolveMiddlewareConfig({ compressionPercent: 101 })).toThrow()
  })

  it('builds resize options from the configured compression percent', () => {
    expect(buildViewImageResizeOptions(1200, 800, 50)).toEqual({
      width: 600,
      height: 400,
      fit: 'inside',
      withoutEnlargement: true
    })
    expect(buildViewImageResizeOptions(800, 600, 100)).toBeNull()
    expect(buildViewImageResizeOptions(1200, 800, 0)).toEqual({
      width: 1,
      height: 1,
      fit: 'inside',
      withoutEnlargement: true
    })
  })

  it('loads an absolute image path that stays inside the sandbox workspace root', async () => {
    const backend = {
      workingDirectory: '/tmp/local-sandbox',
      downloadFiles: jest.fn().mockResolvedValue([
        {
          path: 'sessions/thread-1/files/page-1.png',
          content: ONE_BY_ONE_PNG,
          error: null
        }
      ])
    }
    const tool = service.createTool()

    const result = (await tool.invoke(
      { path: '/workspace/sessions/thread-1/files/page-1.png' },
      createRunConfig(backend, 'call_view_image_abs')
    )) as ToolMessage

    expect(backend.downloadFiles).toHaveBeenCalledWith(['sessions/thread-1/files/page-1.png'])
    expect(result.metadata?.view_image).toEqual(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            target: '/workspace/sessions/thread-1/files/page-1.png',
            resolvedPath: '/workspace/sessions/thread-1/files/page-1.png',
            downloadPath: 'sessions/thread-1/files/page-1.png'
          })
        ]
      })
    )
  })

  it('prefers workspaceBinding.workspaceRoot over sandbox workingDirectory', async () => {
    const backend = {
      workingDirectory: '/tmp/local-sandbox',
      downloadFiles: jest.fn().mockResolvedValue([
        {
          path: 'sessions/thread-1/files/page-1.png',
          content: ONE_BY_ONE_PNG,
          error: null
        }
      ])
    }
    const tool = service.createTool()

    await tool.invoke(
      { path: '/workspace/sessions/thread-1/files/page-1.png' },
      {
        configurable: {
          thread_id: 'thread-1',
          agentKey: 'agent-1',
          tool_call_id: 'call_view_image_workspace_root_priority',
          sandbox: {
            backend,
            workingDirectory: '/workspace/reports',
            workspaceBinding: {
              workspaceRoot: DEFAULT_WORKSPACE_ROOT
            }
          }
        }
      }
    )

    expect(backend.downloadFiles).toHaveBeenCalledWith(['sessions/thread-1/files/page-1.png'])
  })

  it('loads relative and workspace URI paths from the sandbox workspace root', async () => {
    const backend = {
      workingDirectory: '/tmp/local-sandbox',
      downloadFiles: jest.fn().mockResolvedValue([
        {
          path: 'sessions/thread-1/files/page-1.png',
          content: ONE_BY_ONE_PNG,
          error: null
        },
        {
          path: 'sessions/thread-1/files/page-2.png',
          content: ONE_BY_ONE_PNG,
          error: null
        }
      ])
    }
    const tool = service.createTool()

    const result = (await tool.invoke(
      {
        path: ['sessions/thread-1/files/page-1.png', 'workspace://sessions/thread-1/files/page-2.png']
      },
      createRunConfig(backend, 'call_view_image_workspace_uri')
    )) as ToolMessage

    expect(backend.downloadFiles).toHaveBeenCalledWith([
      'sessions/thread-1/files/page-1.png',
      'sessions/thread-1/files/page-2.png'
    ])
    expect((result.metadata?.view_image as { items: unknown[] }).items).toHaveLength(2)
  })

  it('supports loading multiple images in a single tool call', async () => {
    const backend = {
      workingDirectory: '/tmp/local-sandbox',
      downloadFiles: jest.fn().mockResolvedValue([
        {
          path: 'one.png',
          content: ONE_BY_ONE_PNG,
          error: null
        },
        {
          path: 'two.png',
          content: ONE_BY_ONE_PNG,
          error: null
        }
      ])
    }
    const tool = service.createTool()

    const result = (await tool.invoke(
      { path: ['one.png', 'two.png'] },
      createRunConfig(backend, 'call_view_image_2')
    )) as ToolMessage

    expect(backend.downloadFiles).toHaveBeenCalledWith(['one.png', 'two.png'])
    expect((result.metadata?.view_image as { items: unknown[] }).items).toHaveLength(2)
  })

  it('supports the paths alias', async () => {
    const backend = {
      workingDirectory: '/tmp/local-sandbox',
      downloadFiles: jest.fn().mockResolvedValue([
        {
          path: 'one.png',
          content: ONE_BY_ONE_PNG,
          error: null
        },
        {
          path: 'two.png',
          content: ONE_BY_ONE_PNG,
          error: null
        }
      ])
    }
    const tool = service.createTool()

    const result = (await tool.invoke(
      { paths: ['one.png', 'two.png'] },
      createRunConfig(backend, 'call_view_image_paths_alias')
    )) as ToolMessage

    expect(backend.downloadFiles).toHaveBeenCalledWith(['one.png', 'two.png'])
    expect((result.metadata?.view_image as { items: unknown[] }).items).toHaveLength(2)
  })

  it('supports JSON string arrays and path plus paths deduplication', async () => {
    const backend = {
      workingDirectory: '/tmp/local-sandbox',
      downloadFiles: jest.fn().mockResolvedValue([
        {
          path: 'one.png',
          content: ONE_BY_ONE_PNG,
          error: null
        },
        {
          path: 'two.png',
          content: ONE_BY_ONE_PNG,
          error: null
        },
        {
          path: 'three.png',
          content: ONE_BY_ONE_PNG,
          error: null
        }
      ])
    }
    const tool = service.createTool()

    const result = (await tool.invoke(
      {
        path: JSON.stringify(['one.png', 'two.png']),
        paths: ['two.png', 'three.png']
      },
      createRunConfig(backend, 'call_view_image_json_array')
    )) as ToolMessage

    expect(backend.downloadFiles).toHaveBeenCalledWith(['one.png', 'two.png', 'three.png'])
    expect((result.metadata?.view_image as { items: unknown[] }).items).toHaveLength(3)
  })

  it('rebuilds injectable images from tool metadata with a safe download path when in-memory cache is unavailable', async () => {
    const backend = {
      workingDirectory: '/tmp/local-sandbox',
      downloadFiles: jest.fn().mockResolvedValue([
        {
          path: 'chart.png',
          content: ONE_BY_ONE_PNG,
          error: null
        }
      ])
    }
    const tool = service.createTool()
    const toolMessage = (await tool.invoke(
      { path: 'chart.png' },
      createRunConfig(backend, 'call_view_image_3')
    )) as ToolMessage
    const viewImageMetadata = JSON.parse(JSON.stringify(toolMessage.metadata?.view_image))
    viewImageMetadata.items[0].downloadPath = '../chart.png'
    const metadataOnlyToolMessage = new ToolMessage({
      content: toolMessage.content,
      name: 'view_image',
      tool_call_id: 'call_view_image_3',
      status: 'success',
      metadata: {
        view_image: viewImageMetadata
      }
    })

    const freshService = new ViewImageService()
    backend.downloadFiles.mockClear()
    const prepared = await freshService.prepareModelRequest(
      {
        model: {} as any,
        messages: [
          new AIMessage({
            content: '',
            tool_calls: [
              {
                id: 'call_view_image_3',
                name: 'view_image',
                args: {
                  path: 'chart.png'
                }
              }
            ]
          }),
          metadataOnlyToolMessage
        ],
        tools: [],
        state: { messages: [] },
        runtime: createRunConfig(backend, 'call_view_image_3') as any,
        systemMessage: new SystemMessage('base prompt')
      },
      backend
    )

    expect(backend.downloadFiles).toHaveBeenCalledWith(['chart.png'])
    expect(prepared.request.messages).toHaveLength(3)
    expect(prepared.request.messages[2]).toBeInstanceOf(HumanMessage)
  })

  it('rejects unsupported image types', async () => {
    const backend = {
      workingDirectory: '/tmp/local-sandbox',
      downloadFiles: jest.fn().mockResolvedValue([
        {
          path: 'not-image.txt',
          content: Buffer.from('hello world', 'utf8'),
          error: null
        }
      ])
    }
    const tool = service.createTool()

    await expect(tool.invoke({ path: 'not-image.txt' }, createRunConfig(backend, 'call_view_image_4'))).rejects.toThrow(
      'Only PNG, JPEG, and WEBP files are allowed'
    )
  })

  it('rejects absolute paths outside the current sandbox workspace root', async () => {
    const backend = {
      workingDirectory: '/tmp/local-sandbox',
      downloadFiles: jest.fn()
    }
    const tool = service.createTool()

    await expect(
      tool.invoke({ path: '/workspace-alt/shared/plan.png' }, createRunConfig(backend, 'call_view_image_5'))
    ).rejects.toThrow('outside the current sandbox workspace root')
    expect(backend.downloadFiles).not.toHaveBeenCalled()
  })

  it('rejects relative paths outside the current sandbox workspace root', async () => {
    const backend = {
      workingDirectory: '/tmp/local-sandbox',
      downloadFiles: jest.fn()
    }
    const tool = service.createTool()

    await expect(
      tool.invoke({ path: '../../secrets/plan.png' }, createRunConfig(backend, 'call_view_image_6'))
    ).rejects.toThrow('outside the current sandbox workspace root')
    expect(backend.downloadFiles).not.toHaveBeenCalled()
  })

  it('rejects attachment URIs, invalid JSON arrays, and too many images', async () => {
    const backend = {
      workingDirectory: '/tmp/local-sandbox',
      downloadFiles: jest.fn()
    }
    const tool = service.createTool()

    await expect(
      tool.invoke({ path: 'attachment://file-1' }, createRunConfig(backend, 'call_view_image_attachment'))
    ).rejects.toThrow('attachment://')
    await expect(
      tool.invoke({ path: "['one.png']" }, createRunConfig(backend, 'call_view_image_bad_json'))
    ).rejects.toThrow('valid JSON string array')
    await expect(
      tool.invoke({ path: 'https://example.com/one.png' }, createRunConfig(backend, 'call_view_image_remote_url'))
    ).rejects.toThrow('Remote or virtual image paths are not supported')
    await expect(
      tool.invoke(
        {
          path: ['one.png', 'two.png'],
          paths: ['two.png', 'three.png', 'four.png']
        },
        createRunConfig(backend, 'call_view_image_too_many')
      )
    ).rejects.toThrow('accepts at most 3 images')
    expect(backend.downloadFiles).not.toHaveBeenCalled()
  })

  it('injects images even when no copilot model is provided', async () => {
    const backend = {
      workingDirectory: '/tmp/local-sandbox',
      downloadFiles: jest.fn().mockResolvedValue([
        {
          path: 'chart.png',
          content: ONE_BY_ONE_PNG,
          error: null
        }
      ])
    }
    const tool = service.createTool()
    const toolMessage = (await tool.invoke(
      { path: 'chart.png' },
      {
        configurable: {
          thread_id: 'thread-1',
          agentKey: 'agent-1',
          tool_call_id: 'call_view_image_7',
          sandbox: {
            backend,
            workingDirectory: DEFAULT_WORKSPACE_ROOT,
            workspaceBinding: {
              workspaceRoot: DEFAULT_WORKSPACE_ROOT
            }
          }
        }
      }
    )) as ToolMessage

    const prepared = await service.prepareModelRequest(
      {
        model: {} as any,
        messages: [
          new AIMessage({
            content: '',
            tool_calls: [
              {
                id: 'call_view_image_7',
                name: 'view_image',
                args: {
                  path: 'chart.png'
                }
              }
            ]
          }),
          toolMessage
        ],
        tools: [],
        state: { messages: [] },
        runtime: {
          configurable: {
            thread_id: 'thread-1',
            agentKey: 'agent-1',
            sandbox: {
              backend,
              workingDirectory: DEFAULT_WORKSPACE_ROOT,
              workspaceBinding: {
                workspaceRoot: DEFAULT_WORKSPACE_ROOT
              }
            }
          }
        } as any,
        systemMessage: new SystemMessage('base prompt')
      },
      backend
    )

    expect(prepared.request.messages).toHaveLength(3)
    expect(prepared.request.messages[2]).toBeInstanceOf(HumanMessage)
  })
})
