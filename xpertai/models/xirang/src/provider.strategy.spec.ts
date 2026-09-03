import { XirangProviderStrategy } from './provider.strategy.js'

describe('Xirang provider validation', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('uses Bearer AppKey for the official model-list endpoint', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response)

    await new XirangProviderStrategy().validateProviderCredentials({ app_key: ' app-key ' })

    expect(fetchMock).toHaveBeenCalledWith('https://ai.ctaigw.cn/v1/models', {
      method: 'GET',
      headers: { Authorization: 'Bearer app-key', Accept: 'application/json' },
      signal: expect.any(AbortSignal)
    })
  })
})
