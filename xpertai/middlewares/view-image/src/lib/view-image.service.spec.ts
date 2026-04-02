jest.mock('@metad/contracts', () => ({
  getToolCallIdFromConfig: jest.fn((config) => config?.configurable?.tool_call_id)
}))

import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import { ViewImageService } from './view-image.service.js'

const ONE_BY_ONE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jYVwAAAAASUVORK5CYII=',
  'base64'
)
const DEFAULT_WORKING_DIRECTORY = '/workspace/reports'
const HOST_WORKING_DIRECTORY = '/Users/test/data/reports'

describe('ViewImageService', () => {
  const service = new ViewImageService()

  function createRunConfig(
    backend: { workingDirectory: string; downloadFiles: jest.Mock },
    toolCallId: string,
    workingDirectory = DEFAULT_WORKING_DIRECTORY
  ) {
    return {
      configurable: {
        thread_id: 'thread-1',
        agentKey: 'agent-1',
        tool_call_id: toolCallId,
        sandbox: {
          backend,
          workingDirectory
        },
        copilotModel: {
          options: {
            vision_support: 'support'
          }
        }
      }
    }
  }

  it('loads a relative sandbox image inside the configured working directory', async () => {
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
      createRunConfig(backend, 'call_view_image_1', HOST_WORKING_DIRECTORY)
    )) as ToolMessage

    expect(result).toBeInstanceOf(ToolMessage)
    expect(backend.downloadFiles).toHaveBeenCalledWith(['chart.png'])
    expect(result.metadata?.view_image).toEqual(
      expect.objectContaining({
        toolCallId: 'call_view_image_1',
        items: [
          expect.objectContaining({
            target: 'chart.png',
            resolvedPath: `${HOST_WORKING_DIRECTORY}/chart.png`,
            downloadPath: 'chart.png',
            fileName: 'chart.png',
            mimeType: 'image/png'
          })
        ]
      })
    )
    expect(result.content).toContain('The system will attach them automatically')
  })

  it('loads an absolute image path that stays inside the current working directory', async () => {
    const backend = {
      workingDirectory: '/tmp/local-sandbox',
      downloadFiles: jest.fn().mockResolvedValue([
        {
          path: 'charts/chart.png',
          content: ONE_BY_ONE_PNG,
          error: null
        }
      ])
    }
    const tool = service.createTool()

    const result = (await tool.invoke(
      { path: '/workspace/reports/charts/chart.png' },
      createRunConfig(backend, 'call_view_image_abs')
    )) as ToolMessage

    expect(backend.downloadFiles).toHaveBeenCalledWith(['charts/chart.png'])
    expect(result.metadata?.view_image).toEqual(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            target: '/workspace/reports/charts/chart.png',
            resolvedPath: '/workspace/reports/charts/chart.png',
            downloadPath: 'charts/chart.png'
          })
        ]
      })
    )
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
        state: {},
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

  it('rejects absolute paths outside the current working directory', async () => {
    const backend = {
      workingDirectory: '/tmp/local-sandbox',
      downloadFiles: jest.fn()
    }
    const tool = service.createTool()

    await expect(
      tool.invoke({ path: '/workspace/shared/plan.png' }, createRunConfig(backend, 'call_view_image_5'))
    ).rejects.toThrow('outside the current sandbox working directory')
    expect(backend.downloadFiles).not.toHaveBeenCalled()
  })

  it('rejects relative paths outside the current working directory', async () => {
    const backend = {
      workingDirectory: '/tmp/local-sandbox',
      downloadFiles: jest.fn()
    }
    const tool = service.createTool()

    await expect(
      tool.invoke({ path: '../../secrets/plan.png' }, createRunConfig(backend, 'call_view_image_6'))
    ).rejects.toThrow('outside the current sandbox working directory')
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
            workingDirectory: DEFAULT_WORKING_DIRECTORY
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
        state: {},
        runtime: {
          configurable: {
            thread_id: 'thread-1',
            agentKey: 'agent-1',
            sandbox: {
              backend,
              workingDirectory: DEFAULT_WORKING_DIRECTORY
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
