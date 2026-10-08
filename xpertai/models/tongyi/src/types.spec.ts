import {
  getTongyiHttpBaseUrl,
  getTongyiRealtimeUrl,
  isTongyiWorkspaceApiHost,
  toCredentialKwargs,
  TongyiDefaultBaseUrl,
  TongyiDefaultHttpBaseUrl,
  TongyiIntlBaseUrl,
  TongyiIntlHttpBaseUrl
} from './types.js'

describe('Tongyi endpoint helpers', () => {
  it('uses domestic endpoints when international endpoint is not configured', () => {
    const credentials = { dashscope_api_key: 'test-key' }

    expect(toCredentialKwargs(credentials).configuration.baseURL).toBe(TongyiDefaultBaseUrl)
    expect(getTongyiHttpBaseUrl(credentials)).toBe(TongyiDefaultHttpBaseUrl)
  })

  it('uses international endpoints only when explicitly enabled', () => {
    const credentials = { dashscope_api_key: 'test-key', use_international_endpoint: 'true' }

    expect(toCredentialKwargs(credentials).configuration.baseURL).toBe(TongyiIntlBaseUrl)
    expect(getTongyiHttpBaseUrl(credentials)).toBe(TongyiIntlHttpBaseUrl)
  })

  it('uses an optional workspace API host for compatible and DashScope endpoints', () => {
    const credentials = {
      dashscope_api_key: 'test-key',
      api_host: 'llm-wnsb9rvvimieg6nx.cn-beijing.maas.aliyuncs.com',
      use_international_endpoint: 'true'
    }

    expect(toCredentialKwargs(credentials).configuration.baseURL).toBe(
      'https://llm-wnsb9rvvimieg6nx.cn-beijing.maas.aliyuncs.com/compatible-mode/v1'
    )
    expect(getTongyiHttpBaseUrl(credentials)).toBe(
      'https://llm-wnsb9rvvimieg6nx.cn-beijing.maas.aliyuncs.com/api/v1'
    )
  })

  it('preserves the protocol and removes trailing slashes from a configured API host', () => {
    const credentials = {
      dashscope_api_key: 'test-key',
      api_host: 'http://localhost:8080///'
    }

    expect(toCredentialKwargs(credentials).configuration.baseURL).toBe(
      'http://localhost:8080/compatible-mode/v1'
    )
    expect(getTongyiHttpBaseUrl(credentials)).toBe('http://localhost:8080/api/v1')
  })

  it.each([
    ['test-workspace.cn-beijing.maas.aliyuncs.com', 'test-workspace.cn-beijing.maas.aliyuncs.com'],
    [' https://test-workspace.cn-beijing.maas.aliyuncs.com/// ', 'test-workspace.cn-beijing.maas.aliyuncs.com'],
    ['https://test-workspace.ap-southeast-1.maas.aliyuncs.com', 'test-workspace.ap-southeast-1.maas.aliyuncs.com']
  ])('derives the realtime endpoint from API Host %s', (api_host, host) => {
    const credentials = { dashscope_api_key: 'test-key', api_host, use_international_endpoint: true }
    expect(isTongyiWorkspaceApiHost(api_host)).toBe(true)
    expect(getTongyiRealtimeUrl(credentials, 'qwen3.8-omni-flash-realtime')).toBe(
      `wss://${host}/api-ws/v1/realtime?model=qwen3.8-omni-flash-realtime`
    )
    // All model types share the same workspace and region from API Host.
    expect(getTongyiHttpBaseUrl(credentials)).toBe(`https://${host}/api/v1`)
    expect(toCredentialKwargs(credentials).configuration.baseURL).toBe(`https://${host}/compatible-mode/v1`)
  })

  it.each([
    undefined,
    '',
    'dashscope.aliyuncs.com',
    'dashscope-intl.aliyuncs.com',
    'cn-beijing.maas.aliyuncs.com',
    'test-workspace.cn-beijing.maas.aliyuncs.com.example.com',
    'http://test-workspace.cn-beijing.maas.aliyuncs.com',
    'https://test-workspace.cn-beijing.maas.aliyuncs.com:8443',
    'https://user:password@test-workspace.cn-beijing.maas.aliyuncs.com',
    'https://test-workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
    'https://test-workspace.cn-beijing.maas.aliyuncs.com?model=another-model',
    'https://test-workspace.cn-beijing.maas.aliyuncs.com#fragment',
    'wss://test-workspace.cn-beijing.maas.aliyuncs.com/api-ws/v1/realtime',
    'https://'
  ])('rejects an invalid realtime API Host without falling back: %s', (api_host) => {
    const credentials = { dashscope_api_key: 'test-key', api_host }
    expect(isTongyiWorkspaceApiHost(api_host)).toBe(false)
    expect(() => getTongyiRealtimeUrl(credentials, 'qwen3.8-omni-flash-realtime')).toThrow('api_host')
  })
})
