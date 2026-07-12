const mockCallTool = jest.fn()
const mockClose = jest.fn()
const mockConnect = jest.fn()

jest.mock('@nestjs/common', () => ({
  Injectable: () => () => undefined
}))

jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => () => undefined
}))

jest.mock('@xpert-ai/contracts', () => ({
  getToolCallFromConfig: jest.fn(() => ({ id: 'tool-call-1' }))
}))

jest.mock('@langchain/core/callbacks/dispatch', () => ({
  dispatchCustomEvent: jest.fn().mockResolvedValue(undefined)
}))

jest.mock('@xpert-ai/chatkit-types', () => ({
  ChatMessageEventTypeEnum: {
    ON_TOOL_MESSAGE: 'on_tool_message'
  },
  ChatMessageStepCategory: {
    WebSearch: 'web_search'
  }
}))

jest.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: jest.fn().mockImplementation(() => ({
    connect: mockConnect,
    callTool: mockCallTool,
    close: mockClose
  }))
}))

jest.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: jest.fn()
}))

jest.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({
  SSEClientTransport: jest.fn()
}))

import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import {
  ChatMessageEventTypeEnum,
  ChatMessageStepCategory
} from '@xpert-ai/chatkit-types'
import { parseExaWebSearchText, WebToolsMiddleware } from './webTools.js'

const exaText = [
  [
    'Title: Technical Research - Codex /goal',
    'URL: https://zenn.dev/example/articles/codex-goal',
    'Published: 2026-04-30',
    'Author: npaka',
    'Highlights:',
    'Codex CLI goal mode keeps a persistent goal-driven workflow.',
    'It tracks the current objective across turns.'
  ].join('\n'),
  [
    'Title: Codex CLI 0.128.0 adds /goal',
    'URL: https://simonwillison.net/example/codex-goal',
    'Published: N/A',
    'Author: N/A',
    'Text: A short note about the new persistent goal command.'
  ].join('\n')
].join('\n\n---\n\n')

describe('WebToolsMiddleware web search source metadata', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockConnect.mockResolvedValue(undefined)
    mockCallTool.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: exaText
        }
      ]
    })
    mockClose.mockResolvedValue(undefined)
  })

  it('parses Exa web search text into structured sources', () => {
    expect(parseExaWebSearchText(exaText)).toEqual([
      {
        title: 'Technical Research - Codex /goal',
        url: 'https://zenn.dev/example/articles/codex-goal',
        publishedDate: '2026-04-30',
        author: 'npaka',
        content:
          'Codex CLI goal mode keeps a persistent goal-driven workflow.\nIt tracks the current objective across turns.'
      },
      {
        title: 'Codex CLI 0.128.0 adds /goal',
        url: 'https://simonwillison.net/example/codex-goal',
        content: 'A short note about the new persistent goal command.'
      }
    ])
  })

  it('dispatches structured sources while returning the original search text', async () => {
    const middleware = new WebToolsMiddleware().createMiddleware(
      {},
      {} as never
    )
    const searchTool = middleware.tools.find(
      (item) => item.name === 'web_search'
    )
    if (!searchTool) throw new Error('Expected web_search tool')

    const result = await searchTool.invoke({
      query: 'Codex /goal',
      numResults: 2,
      type: 'auto'
    })

    expect(result).toBe(exaText)
    expect(dispatchCustomEvent).toHaveBeenCalledWith(
      ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
      expect.objectContaining({
        id: 'tool-call-1',
        category: 'Computer',
        type: ChatMessageStepCategory.WebSearch,
        toolset: 'WebTools',
        tool: 'web_search',
        title: 'Web Search',
        message: 'Codex /goal',
        input: {
          query: 'Codex /goal',
          numResults: 2,
          type: 'auto'
        },
        data: [
          expect.objectContaining({
            title: 'Technical Research - Codex /goal',
            url: 'https://zenn.dev/example/articles/codex-goal'
          }),
          expect.objectContaining({
            title: 'Codex CLI 0.128.0 adds /goal',
            url: 'https://simonwillison.net/example/codex-goal'
          })
        ]
      })
    )
  })
})
