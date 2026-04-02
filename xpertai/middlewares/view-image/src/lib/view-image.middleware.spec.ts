jest.mock('@metad/contracts', () => {
  return {
    getToolCallIdFromConfig: jest.fn((config) => config?.configurable?.tool_call_id)
  }
})
jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => () => undefined
}))

import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import { ViewImageMiddleware } from './view-image.middleware.js'
import { ViewImageService } from './view-image.service.js'
import { ViewImagePluginConfigFormSchema } from './view-image.types.js'

const ONE_BY_ONE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jYVwAAAAASUVORK5CYII=',
  'base64'
)
const DEFAULT_WORKING_DIRECTORY = '/workspace/reports'

describe('ViewImageMiddleware', () => {
  function createBackend() {
    return {
      workingDirectory: '/tmp/local-sandbox',
      downloadFiles: jest.fn().mockImplementation(async (paths: string[]) =>
        paths.map((filePath) => ({
          path: filePath,
          content: ONE_BY_ONE_PNG,
          error: null
        }))
      )
    }
  }

  function createRuntime(
    backend: ReturnType<typeof createBackend>,
    toolCallId = 'call_view_image_1',
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
    } as any
  }

  async function createToolMessage(
    service: ViewImageService,
    backend: ReturnType<typeof createBackend>,
    toolCallId: string,
    pathInput: string | string[]
  ) {
    const tool = service.createTool()
    return (await tool.invoke(
      { path: pathInput },
      {
        configurable: {
          ...createRuntime(backend, toolCallId).configurable,
          tool_call_id: toolCallId
        }
      }
    )) as ToolMessage
  }

  function createSubject(options = {}) {
    const service = new ViewImageService()
    const strategy = new ViewImageMiddleware(service)
    const middleware = strategy.createMiddleware(options, {} as any)

    return {
      service,
      strategy,
      middleware
    }
  }

  function createRequest(messages: Array<AIMessage | ToolMessage | HumanMessage>, backend: ReturnType<typeof createBackend>, overrides?: Record<string, unknown>) {
    return {
      model: {} as any,
      messages,
      tools: [],
      state: {},
      runtime: createRuntime(backend),
      systemMessage: new SystemMessage('base prompt'),
      ...(overrides ?? {})
    }
  }

  it('exposes the view image config schema on middleware meta', () => {
    const { strategy } = createSubject()

    expect(strategy.meta.configSchema).toEqual(ViewImagePluginConfigFormSchema)
  })

  it('adds the system prompt and injects a temporary HumanMessage with image content', async () => {
    const { service, middleware } = createSubject()
    const backend = createBackend()
    const toolMessage = await createToolMessage(service, backend, 'call_view_image_1', 'chart.png')
    const handler = jest.fn().mockResolvedValue(new AIMessage('ok'))

    await middleware.wrapModelCall?.(
      createRequest(
        [
          new AIMessage({
            content: '',
            tool_calls: [
              {
                id: 'call_view_image_1',
                name: 'view_image',
                args: {
                  path: 'chart.png'
                }
              }
            ]
          }),
          toolMessage
        ],
        backend
      ) as any,
      handler
    )

    const forwardedRequest = handler.mock.calls[0][0]
    expect(forwardedRequest.systemMessage).toEqual(
      new SystemMessage({
        content: expect.stringContaining('call `view_image`')
      })
    )
    expect(forwardedRequest.messages).toHaveLength(3)
    expect(forwardedRequest.messages[2]).toBeInstanceOf(HumanMessage)
    expect(forwardedRequest.messages[2].content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'text'
        }),
        expect.objectContaining({
          type: 'image_url',
          image_url: expect.objectContaining({
            url: expect.stringContaining('data:image/png;base64,')
          })
        })
      ])
    )
  })

  it('injects images even when the current runtime has no copilot model', async () => {
    const { service, middleware } = createSubject()
    const backend = createBackend()
    const toolMessage = await createToolMessage(service, backend, 'call_view_image_1', 'chart.png')
    const handler = jest.fn().mockResolvedValue(new AIMessage('ok'))

    await middleware.wrapModelCall?.(
      createRequest(
        [
          new AIMessage({
            content: '',
            tool_calls: [
              {
                id: 'call_view_image_1',
                name: 'view_image',
                args: {
                  path: 'chart.png'
                }
              }
            ]
          }),
          toolMessage
        ],
        backend,
        {
          runtime: {
            configurable: {
              ...createRuntime(backend).configurable,
              copilotModel: {}
            }
          }
        }
      ) as any,
      handler
    )

    const forwardedRequest = handler.mock.calls[0][0]
    expect(forwardedRequest.messages).toHaveLength(3)
    expect(forwardedRequest.messages[2]).toBeInstanceOf(HumanMessage)
  })

  it('merges images from multiple independent view_image tool calls in the same model step', async () => {
    const { service, middleware } = createSubject()
    const backend = createBackend()
    const toolMessageOne = await createToolMessage(service, backend, 'call_view_image_1', 'one.png')
    const toolMessageTwo = await createToolMessage(service, backend, 'call_view_image_2', 'two.png')
    const handler = jest.fn().mockResolvedValue(new AIMessage('ok'))

    await middleware.wrapModelCall?.(
      createRequest(
        [
          new AIMessage({
            content: '',
            tool_calls: [
              {
                id: 'call_view_image_1',
                name: 'view_image',
                args: { path: 'one.png' }
              },
              {
                id: 'call_view_image_2',
                name: 'view_image',
                args: { path: 'two.png' }
              }
            ]
          }),
          toolMessageOne,
          toolMessageTwo
        ],
        backend
      ) as any,
      handler
    )

    const forwardedRequest = handler.mock.calls[0][0]
    expect(forwardedRequest.messages).toHaveLength(4)
    expect(forwardedRequest.messages[3]).toBeInstanceOf(HumanMessage)
    expect(
      (forwardedRequest.messages[3].content as Array<{ type: string }>).filter((item) => item.type === 'image_url')
    ).toHaveLength(2)
  })

  it('does not reinject images after a new human message is appended', async () => {
    const { service, middleware } = createSubject()
    const backend = createBackend()
    const toolMessage = await createToolMessage(service, backend, 'call_view_image_1', 'chart.png')
    const handler = jest.fn().mockResolvedValue(new AIMessage('ok'))

    await middleware.wrapModelCall?.(
      createRequest(
        [
          new AIMessage({
            content: '',
            tool_calls: [
              {
                id: 'call_view_image_1',
                name: 'view_image',
                args: {
                  path: 'chart.png'
                }
              }
            ]
          }),
          toolMessage,
          new HumanMessage('What about the next question?')
        ],
        backend
      ) as any,
      handler
    )

    const forwardedRequest = handler.mock.calls[0][0]
    expect(forwardedRequest.messages).toHaveLength(3)
    expect(forwardedRequest.messages[2]).toBeInstanceOf(HumanMessage)
  })

  it('does not inject images until all tool calls from the last AI message have completed', async () => {
    const { service, middleware } = createSubject()
    const backend = createBackend()
    const toolMessage = await createToolMessage(service, backend, 'call_view_image_1', 'one.png')
    const handler = jest.fn().mockResolvedValue(new AIMessage('ok'))

    await middleware.wrapModelCall?.(
      createRequest(
        [
          new AIMessage({
            content: '',
            tool_calls: [
              {
                id: 'call_view_image_1',
                name: 'view_image',
                args: { path: 'one.png' }
              },
              {
                id: 'call_other_tool',
                name: 'other_tool',
                args: {}
              }
            ]
          }),
          toolMessage
        ],
        backend
      ) as any,
      handler
    )

    const forwardedRequest = handler.mock.calls[0][0]
    expect(forwardedRequest.messages).toHaveLength(2)
  })

  it('passes through unchanged when no sandbox backend is available', async () => {
    const { middleware } = createSubject()
    const request = createRequest(
      [
        new AIMessage({
          content: 'hello'
        })
      ],
      createBackend(),
      {
        runtime: {
          configurable: {}
        }
      }
    )
    const handler = jest.fn().mockResolvedValue(new AIMessage('ok'))

    await middleware.wrapModelCall?.(request as any, handler)

    expect(handler).toHaveBeenCalledWith(request)
  })

  it('finalizes prepared image batches even when the model handler throws', async () => {
    const { service, middleware } = createSubject()
    const backend = createBackend()
    const toolMessage = await createToolMessage(service, backend, 'call_view_image_1', 'chart.png')
    const finalizeSpy = jest.spyOn(service, 'finalizePreparedBatches')
    const handler = jest.fn().mockRejectedValue(new Error('model failed'))

    await expect(
      middleware.wrapModelCall?.(
        createRequest(
          [
            new AIMessage({
              content: '',
              tool_calls: [
                {
                  id: 'call_view_image_1',
                  name: 'view_image',
                  args: {
                    path: 'chart.png'
                  }
                }
              ]
            }),
            toolMessage
          ],
          backend
        ) as any,
        handler
      )
    ).rejects.toThrow('model failed')

    expect(finalizeSpy).toHaveBeenCalledWith(['thread-1:agent-1:call_view_image_1'])
  })
})
