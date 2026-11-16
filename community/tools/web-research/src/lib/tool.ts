import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { FirecrawlConfig } from './types'

const DEFAULT_API_URL = 'https://api.firecrawl.dev/v2'
const MAX_SCRAPE_CHARS = 50_000

const urlSchema = z.string().url().refine((value) => {
  const protocol = new URL(value).protocol
  return protocol === 'http:' || protocol === 'https:'
}, 'Only http and https URLs are supported')

const searchSchema = z.object({
  query: z.string().trim().min(2).max(400).describe('Web search query. Include a year when asking for current information.'),
  limit: z.number().int().min(1).max(10).default(5).describe('Number of results to return, from 1 to 10.'),
  category: z.enum(['web', 'news', 'images']).default('web').describe('Search result category.'),
  tbs: z.string().trim().min(1).max(200).optional().describe('Optional Firecrawl time filter, for example qdr:w for the last week.')
}).strict()

const scrapeSchema = z.object({
  url: urlSchema.describe('Public http or https URL to scrape.'),
  prompt: z.string().trim().min(1).max(1_000).optional().describe('Optional focused question about the page.'),
  onlyMainContent: z.boolean().default(true).describe('Return the article or page main content only.'),
  waitFor: z.number().int().min(0).max(15_000).optional().describe('Extra wait time in milliseconds for JavaScript content.'),
  maxAge: z.number().int().min(0).max(86_400_000).optional().describe('Maximum Firecrawl cache age in milliseconds.')
}).strict()

type FirecrawlResponse = { success?: boolean; data?: unknown; error?: unknown; warning?: unknown }

function apiUrl(config: FirecrawlConfig, path: string): string {
  return `${(config.apiUrl || DEFAULT_API_URL).replace(/\/$/, '')}${path}`
}

async function request(config: FirecrawlConfig, path: string, body: Record<string, unknown>): Promise<FirecrawlResponse> {
  if (!config.apiKey) throw new Error('Firecrawl API key is not configured for this toolset.')
  const response = await fetch(apiUrl(config, path), {
    method: 'POST', headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', 'User-Agent': 'xpert-web-research-plugin' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(60_000)
  })
  const raw = await response.text()
  let payload: FirecrawlResponse
  try { payload = JSON.parse(raw) as FirecrawlResponse } catch { throw new Error(`Firecrawl returned a non-JSON response (${response.status}).`) }
  if (!response.ok || payload.success === false) {
    throw new Error(`Firecrawl request failed: ${typeof payload.error === 'string' ? payload.error : `HTTP ${response.status}`}`)
  }
  return payload
}

function clip(value: unknown, maxChars: number): string | undefined {
  if (typeof value !== 'string' || !value) return undefined
  return value.length > maxChars ? `${value.slice(0, maxChars)}…` : value
}

function searchResults(data: unknown) {
  const rawResults = Array.isArray(data) ? data : data && typeof data === 'object'
    ? Object.values(data as Record<string, unknown>).flatMap((value) => Array.isArray(value) ? value : []) : []
  return rawResults.slice(0, 10).flatMap((result, index) => {
    if (!result || typeof result !== 'object') return []
    const item = result as Record<string, unknown>
    if (typeof item.url !== 'string') return []
    return [{ position: typeof item.position === 'number' ? item.position : index + 1, title: clip(item.title, 300) || item.url, url: item.url, description: clip(item.description ?? item.snippet, 1_500) }]
  })
}

export function buildWebSearchTool(config: FirecrawlConfig) {
  return tool(async (input) => {
    const payload = await request(config, '/search', { query: input.query, limit: input.limit, sources: [input.category], ...(input.tbs ? { tbs: input.tbs } : {}) })
    return JSON.stringify({ query: input.query, results: searchResults(payload.data) })
  }, { name: 'web_search', description: 'Search the current web through Firecrawl. Use this to find sources, current facts, or pages to scrape. Cite returned URLs in the final answer.', schema: searchSchema, verboseParsingErrors: true, metadata: { toolName: { en_US: 'Search the web', zh_Hans: '搜索网页' } } })
}

export function buildWebScrapeTool(config: FirecrawlConfig) {
  return tool(async (input) => {
    const formats: Array<string | Record<string, string>> = ['markdown']
    if (input.prompt) formats.push({ type: 'json', prompt: input.prompt })
    const payload = await request(config, '/scrape', { url: input.url, formats, onlyMainContent: input.onlyMainContent, ...(input.waitFor !== undefined ? { waitFor: input.waitFor } : {}), ...(input.maxAge !== undefined ? { maxAge: input.maxAge } : {}) })
    const data = payload.data && typeof payload.data === 'object' ? payload.data as Record<string, unknown> : {}
    const metadata = data.metadata && typeof data.metadata === 'object' ? data.metadata as Record<string, unknown> : {}
    return JSON.stringify({ url: input.url, title: clip(metadata.title, 500), sourceUrl: clip(metadata.sourceURL ?? metadata.url, 2_000), markdown: clip(data.markdown, MAX_SCRAPE_CHARS), answer: clip(data.json ?? data.answer, 10_000), warning: clip(payload.warning, 1_000), truncated: typeof data.markdown === 'string' && data.markdown.length > MAX_SCRAPE_CHARS })
  }, { name: 'web_scrape', description: 'Scrape one public web page through Firecrawl and return clean markdown. Use a URL obtained from web_search when possible.', schema: scrapeSchema, verboseParsingErrors: true, metadata: { toolName: { en_US: 'Scrape web page', zh_Hans: '抓取网页' } } })
}
