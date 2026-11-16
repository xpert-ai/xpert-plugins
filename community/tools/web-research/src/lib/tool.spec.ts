import { buildWebScrapeTool, buildWebSearchTool } from './tool'

describe('web research tools', () => {
  const originalFetch = global.fetch

  afterEach(() => { global.fetch = originalFetch })

  it('normalizes Firecrawl search results and does not expose the API key', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: [{ title: 'Xpert', url: 'https://xpert.ai', description: 'AI platform' }] }), { status: 200 }))
    const result = await buildWebSearchTool({ apiKey: 'secret-value' }).invoke({ query: 'Xpert AI' })
    expect(result).toContain('https://xpert.ai')
    expect(result).not.toContain('secret-value')
    expect(global.fetch).toHaveBeenCalledWith('https://api.firecrawl.dev/v2/search', expect.objectContaining({ method: 'POST' }))
  })

  it('clips excessively long scraped markdown', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { markdown: 'a'.repeat(50_001), metadata: { title: 'Example' } } }), { status: 200 }))
    const result = await buildWebScrapeTool({ apiKey: 'secret-value' }).invoke({ url: 'https://example.com' })
    const output = JSON.parse(result as string)
    expect(output.title).toBe('Example')
    expect(output.truncated).toBe(true)
    expect(output.markdown).toHaveLength(50_001)
  })

  it('rejects unsupported URL protocols before making a request', async () => {
    const fetchMock = jest.fn()
    global.fetch = fetchMock
    await expect(buildWebScrapeTool({ apiKey: 'secret-value' }).invoke({ url: 'file:///private.txt' })).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
