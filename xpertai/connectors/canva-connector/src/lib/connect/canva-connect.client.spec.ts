import { CanvaConnectClient } from './canva-connect.client.js'

describe('CanvaConnectClient', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('does not turn candidate generation into a direct REST write', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch')

    await expect(
      new CanvaConnectClient().call({
        accessToken: 'token',
        operation: 'generate-design',
        arguments: { prompt: 'Launch poster' }
      })
    ).rejects.toMatchObject({ code: 'CANVA_TOOL_UNAVAILABLE' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('uses the bounded page size argument for the design list request', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"items":[]}', { status: 200 }))

    await new CanvaConnectClient().call({
      accessToken: 'token',
      operation: 'search-designs',
      arguments: { query: 'brief', page: 2, page_size: 7 }
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('page_size=7'),
      expect.objectContaining({ method: 'GET', redirect: 'error' })
    )
  })
})
