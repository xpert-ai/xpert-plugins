import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { tool } from '@langchain/core/tools'
import { getToolCallFromConfig, TAgentMiddlewareMeta } from '@metad/contracts'
import { ChatMessageEventTypeEnum, ChatMessageStepCategory } from '@xpert-ai/chatkit-types'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { Injectable } from '@nestjs/common'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import * as cheerio from 'cheerio'
import TurndownService from 'turndown'
import { z } from 'zod/v3'

const WEB_TOOLS_MIDDLEWARE_NAME = 'WebTools'
const MAX_RESPONSE_SIZE = 5 * 1024 * 1024 // 5MB
const DEFAULT_TIMEOUT = 30_000
const MAX_TIMEOUT = 120_000
const SEARCH_TIMEOUT = 25_000
const EXA_MCP_ENDPOINT = 'https://mcp.exa.ai/mcp'
const USER_AGENT = 'Mozilla/5.0 (compatible; XpertBot/1.0)'

const webFetchSchema = z.object({
  url: z.string().url().describe('The URL to fetch content from'),
  format: z
    .enum(['text', 'markdown', 'html'])
    .optional()
    .default('markdown')
    .describe('Output format: "markdown" (default), "text" (plain text), or "html" (raw HTML)'),
  timeout: z
    .number()
    .optional()
    .default(DEFAULT_TIMEOUT)
    .describe(`Request timeout in milliseconds (default ${DEFAULT_TIMEOUT}, max ${MAX_TIMEOUT})`)
})

const webSearchSchema = z.object({
  query: z.string().min(1, 'Search query is required.').describe('The search query'),
  numResults: z
    .number()
    .optional()
    .default(5)
    .describe('Number of results to return (default 5)'),
  type: z
    .enum(['auto', 'fast', 'deep'])
    .optional()
    .default('auto')
    .describe('Search type: "auto" (default), "fast" for quick results, "deep" for comprehensive results')
})

function htmlToMarkdown(html: string): string {
  const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })
  return turndown.turndown(html)
}

function htmlToText(html: string): string {
  const $ = cheerio.load(html)
  // Remove script and style elements
  $('script, style, noscript').remove()
  return $.text().replace(/\s+/g, ' ').trim()
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen) + '\n\n[Content truncated]'
}

async function fetchUrl(
  url: string,
  format: 'text' | 'markdown' | 'html',
  timeout: number
): Promise<string> {
  const effectiveTimeout = Math.min(Math.max(timeout, 1000), MAX_TIMEOUT)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), effectiveTimeout)

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
      redirect: 'follow'
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`)
    }

    const contentLength = response.headers.get('content-length')
    if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_SIZE) {
      throw new Error(`Response too large (${contentLength} bytes, max ${MAX_RESPONSE_SIZE})`)
    }

    const body = await response.text()
    if (body.length > MAX_RESPONSE_SIZE) {
      throw new Error(`Response body too large (${body.length} chars, max ${MAX_RESPONSE_SIZE})`)
    }

    const contentType = response.headers.get('content-type') || ''
    const isHtml = contentType.includes('text/html') || body.trimStart().startsWith('<')

    if (format === 'html' || !isHtml) {
      return truncate(isHtml ? body : body, 100_000)
    }

    if (format === 'text') {
      return truncate(htmlToText(body), 100_000)
    }

    // Default: markdown
    return truncate(htmlToMarkdown(body), 100_000)
  } finally {
    clearTimeout(timer)
  }
}

async function searchExa(
  query: string,
  numResults: number,
  type: 'auto' | 'fast' | 'deep'
): Promise<string> {
  const url = new URL(EXA_MCP_ENDPOINT)
  let client: Client | null = null

  try {
    client = new Client({ name: 'xpert-web-search', version: '1.0.0' })

    // Try StreamableHTTP first (newer MCP protocol), fall back to SSE
    let connected = false
    try {
      const transport = new StreamableHTTPClientTransport(url)
      await client.connect(transport)
      connected = true
    } catch {
      // StreamableHTTP failed, try SSE transport
      client = new Client({ name: 'xpert-web-search', version: '1.0.0' })
      try {
        const sseTransport = new SSEClientTransport(url)
        await client.connect(sseTransport)
        connected = true
      } catch (sseErr) {
        throw new Error(`Failed to connect to Exa MCP: ${sseErr instanceof Error ? sseErr.message : String(sseErr)}`)
      }
    }

    if (!connected) {
      throw new Error('Failed to connect to Exa MCP endpoint')
    }

    const result = await client.callTool(
      {
        name: 'web_search_exa',
        arguments: { query, numResults, type }
      },
      undefined,
      { timeout: SEARCH_TIMEOUT }
    )

    if (result.isError) {
      throw new Error(`Exa search error: ${JSON.stringify(result.content)}`)
    }

    // Extract text content from MCP tool result
    const content = result.content as Array<{ type: string; text?: string }>
    if (Array.isArray(content)) {
      const textContent = content
        .filter((c) => c.type === 'text' && c.text)
        .map((c) => c.text)
        .join('\n')
      if (textContent) return textContent
    }

    return JSON.stringify(result.content, null, 2)
  } finally {
    if (client) {
      try { await client.close() } catch { /* ignore close errors */ }
    }
  }
}

@Injectable()
@AgentMiddlewareStrategy(WEB_TOOLS_MIDDLEWARE_NAME)
export class WebToolsMiddleware implements IAgentMiddlewareStrategy {
  meta: TAgentMiddlewareMeta = {
    name: WEB_TOOLS_MIDDLEWARE_NAME,
    icon: {
      type: 'svg',
      value: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M16.36,14C16.44,13.34 16.5,12.68 16.5,12C16.5,11.32 16.44,10.66 16.36,10H19.74C19.9,10.64 20,11.31 20,12C20,12.69 19.9,13.36 19.74,14M14.59,19.56C15.19,18.45 15.65,17.25 15.97,16H18.92C17.96,17.65 16.43,18.93 14.59,19.56M14.34,14H9.66C9.56,13.34 9.5,12.68 9.5,12C9.5,11.32 9.56,10.65 9.66,10H14.34C14.43,10.65 14.5,11.32 14.5,12C14.5,12.68 14.43,13.34 14.34,14M12,19.96C11.17,18.76 10.5,17.43 10.09,16H13.91C13.5,17.43 12.83,18.76 12,19.96M8,8H5.08C6.03,6.34 7.57,5.06 9.4,4.44C8.8,5.55 8.35,6.75 8,8M5.08,16H8C8.35,17.25 8.8,18.45 9.4,19.56C7.57,18.93 6.03,17.65 5.08,16M4.26,14C4.1,13.36 4,12.69 4,12C4,11.31 4.1,10.64 4.26,10H7.64C7.56,10.66 7.5,11.32 7.5,12C7.5,12.68 7.56,13.34 7.64,14M12,4.03C12.83,5.23 13.5,6.57 13.91,8H10.09C10.5,6.57 11.17,5.23 12,4.03M18.92,8H15.97C15.65,6.75 15.19,5.55 14.59,4.44C16.43,5.07 17.96,6.34 18.92,8M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z"/></svg>`
    },
    label: {
      en_US: 'Web Tools',
      zh_Hans: '网络工具'
    },
    description: {
      en_US: 'Adds web fetch and web search tools for retrieving web content and searching the internet.',
      zh_Hans: '添加网页获取和网络搜索工具，用于获取网页内容和搜索互联网。'
    },
    configSchema: {
      type: 'object',
      properties: {}
    }
  }

  createMiddleware(
    _options: unknown,
    _context: IAgentMiddlewareContext
  ): PromiseOrValue<AgentMiddleware> {
    const fetchTool = tool(
      async ({ url, format, timeout }, config) => {
        const toolCall = getToolCallFromConfig(config)
        try {
          const result = await fetchUrl(url, format ?? 'markdown', timeout ?? DEFAULT_TIMEOUT)
          dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
            id: toolCall?.id,
            category: 'Computer',
            type: ChatMessageStepCategory.WebSearch,
            toolset: WEB_TOOLS_MIDDLEWARE_NAME,
            tool: 'web_fetch',
            title: 'Web Fetch',
            message: url
          }).catch(() => {/* ignore dispatch errors */})
          return result
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          return `Error fetching ${url}: ${message}`
        }
      },
      {
        name: 'web_fetch',
        description:
          'Fetch and read the contents of a web page. Returns the page content converted to the specified format. ' +
          'Use this to read documentation, articles, or any publicly accessible web page.',
        schema: webFetchSchema
      }
    )

    const searchTool = tool(
      async ({ query, numResults, type }, config) => {
        const toolCall = getToolCallFromConfig(config)
        try {
          const result = await searchExa(query, numResults ?? 5, type ?? 'auto')
          dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
            id: toolCall?.id,
            category: 'Computer',
            type: ChatMessageStepCategory.WebSearch,
            toolset: WEB_TOOLS_MIDDLEWARE_NAME,
            tool: 'web_search',
            title: 'Web Search',
            message: query
          }).catch(() => {/* ignore dispatch errors */})
          return result
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          return `Error searching for "${query}": ${message}`
        }
      },
      {
        name: 'web_search',
        description:
          'Search the internet for information. Returns search results with titles, URLs, and content snippets. ' +
          'Use this when you need to find current information, documentation, or answers to questions.',
        schema: webSearchSchema
      }
    )

    return {
      name: WEB_TOOLS_MIDDLEWARE_NAME,
      tools: [fetchTool, searchTool]
    }
  }
}
