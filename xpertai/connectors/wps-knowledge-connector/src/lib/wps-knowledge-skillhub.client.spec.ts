import { WpsKnowledgeSkillHubClient } from './wps-knowledge-skillhub.client.js'

describe('WpsKnowledgeSkillHubClient', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.restoreAllMocks()
  })

  it('calls the fixed Kwiki SkillHub origin with token-specific headers', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ code: 0, data: { items: [] } }))
    global.fetch = fetchMock

    await new WpsKnowledgeSkillHubClient().getJson(
      { accessToken: 'kwiki-token' },
      'knowledge_view/list',
      { keyword: '制度', page_size: 20 }
    )

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://zhishi.wps.cn/kwiki/api/v1/skills_hub/skill/knowledge_view/list?keyword=%E5%88%B6%E5%BA%A6&page_size=20')
    const headers = new Headers(init.headers)
    expect(headers.get('X-Kwiki-Auth')).toBe('kwiki-token')
    expect(headers.has('Authorization')).toBe(false)
  })

  it.each([
    [401000001, 'TOKEN_EXPIRED', false],
    [403000001, 'PERMISSION_DENIED', false],
    [429000001, 'RATE_LIMITED', true],
    [500000004, 'PROVIDER_UNAVAILABLE', true]
  ])('maps SkillHub business code %s to %s', async (code, expectedCode, retryable) => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({ code, msg: 'provider detail' }))
    const promise = new WpsKnowledgeSkillHubClient().getJson(
      { accessToken: 'kwiki-token' },
      'knowledge_view/list',
      {}
    )
    await expect(promise).rejects.toMatchObject({ code: expectedCode, retryable })
  })
})

function jsonResponse(value: object): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}
