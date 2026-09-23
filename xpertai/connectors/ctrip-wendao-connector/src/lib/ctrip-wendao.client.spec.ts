import { CtripWendaoClient } from './ctrip-wendao.client.js'
import { CTRIP_WENDAO_MAX_QUERY_LENGTH, CTRIP_WENDAO_MAX_RESULT_CHARS } from './constants.js'

describe('CtripWendaoClient', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('returns only the bounded result and never upstream state containing the token', async () => {
    mockFetchJson({
      result: '# Shanghai\nRecommended itinerary',
      state: { token: 'server-secret', query: 'Shanghai itinerary' },
      messages: [{ content: 'internal message' }]
    })

    const result = await new CtripWendaoClient().query('server-secret', ' Shanghai itinerary ')

    expect(result).toEqual({ content: '# Shanghai\nRecommended itinerary', format: 'markdown' })
    expect(JSON.stringify(result)).not.toContain('server-secret')
    expect(fetch).toHaveBeenCalledWith(
      'https://externalcallback.ctrip.com/skills/api/crew/qclaw/searchInfo',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ inputs: { token: 'server-secret', query: 'Shanghai itinerary' } })
      })
    )
  })

  it('recognizes the observed HTTP 200 invalid-token business error without leaking the token', async () => {
    mockFetchJson({
      result: '{"error": "Invalid token."}',
      state: { token: 'server-secret', query: 'Test' }
    })

    const request = new CtripWendaoClient().query('server-secret', 'Test')

    await expect(request).rejects.toMatchObject({ code: 'WENDAO_AUTH_INVALID' })
    await request.catch((error: unknown) => {
      expect(String(error)).not.toContain('server-secret')
    })
  })

  it('extracts result.content from an object result and drops all other upstream fields', async () => {
    mockFetchJson({
      result: { content: 'Object travel result', trace: 'internal-result-field' },
      state: { token: 'server-secret', query: 'Test' },
      events: [{ content: 'internal event' }]
    })

    const result = await new CtripWendaoClient().query('server-secret', 'Test')

    expect(result).toEqual({ content: 'Object travel result', format: 'markdown' })
    expect(JSON.stringify(result)).not.toContain('server-secret')
    expect(JSON.stringify(result)).not.toContain('internal-result-field')
    expect(JSON.stringify(result)).not.toContain('internal event')
  })

  it('maps a top-level business error without exposing the provider message', async () => {
    mockFetchJson({ result: null, error: 'This account cannot use the requested travel scene.' })

    const request = new CtripWendaoClient().query('server-secret', 'Test')

    await expect(request).rejects.toMatchObject({ code: 'WENDAO_QUERY_REJECTED' })
    await request.catch((error: unknown) => {
      expect(String(error)).toContain('Ctrip Wendao rejected the travel query.')
      expect(String(error)).not.toContain('This account cannot use the requested travel scene.')
    })
  })

  it.each([401, 403])('maps HTTP %s responses to an authentication error', async (status) => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status }))

    await expect(new CtripWendaoClient().query('server-secret', 'Test')).rejects.toMatchObject({
      code: 'WENDAO_AUTH_INVALID',
      retryable: false
    })
  })

  it('maps non-JSON rate-limit responses from their HTTP status', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response('<html>rate limited</html>', { status: 429, headers: { 'content-type': 'text/html' } })
      )

    await expect(new CtripWendaoClient().query('server-secret', 'Test')).rejects.toMatchObject({
      code: 'WENDAO_RATE_LIMITED',
      retryable: true
    })
  })

  it('rejects responses above the raw response limit', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ result: 'x' }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'content-length': String(256 * 1024 + 1) }
      })
    )

    await expect(new CtripWendaoClient().query('server-secret', 'Test')).rejects.toMatchObject({
      code: 'WENDAO_RESPONSE_TOO_LARGE'
    })
  })

  it('rejects an unsupported result object instead of serializing provider fields', async () => {
    mockFetchJson({ result: { answer: 'unsupported provider field' } })

    await expect(new CtripWendaoClient().query('server-secret', 'Test')).rejects.toMatchObject({
      code: 'WENDAO_INVALID_RESPONSE'
    })
  })

  it('rejects an empty result', async () => {
    mockFetchJson({ result: '   ' })

    await expect(new CtripWendaoClient().query('server-secret', 'Test')).rejects.toMatchObject({
      code: 'WENDAO_INVALID_RESPONSE'
    })
  })

  it('rejects results above the Agent-visible result limit', async () => {
    mockFetchJson({ result: 'x'.repeat(CTRIP_WENDAO_MAX_RESULT_CHARS + 1) })

    await expect(new CtripWendaoClient().query('server-secret', 'Test')).rejects.toMatchObject({
      code: 'WENDAO_RESPONSE_TOO_LARGE'
    })
  })

  it('rejects an overlong query before making an upstream request', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch')

    await expect(
      new CtripWendaoClient().query('server-secret', 'x'.repeat(CTRIP_WENDAO_MAX_QUERY_LENGTH + 1))
    ).rejects.toMatchObject({ code: 'WENDAO_QUERY_REJECTED' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('maps aborted fetches to a retryable timeout without exposing request data', async () => {
    const aborted = new Error('contains server-secret')
    aborted.name = 'AbortError'
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(aborted)

    const request = new CtripWendaoClient().query('server-secret', 'Test')
    await expect(request).rejects.toMatchObject({ code: 'WENDAO_TIMEOUT', retryable: true })
    await request.catch((error: unknown) => expect(String(error)).not.toContain('server-secret'))
  })
})

function mockFetchJson(body: Record<string, unknown>): void {
  jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(
      new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
    )
}
