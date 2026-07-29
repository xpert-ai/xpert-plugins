import 'reflect-metadata'
import {
  AxiosError,
  AxiosHeaders
} from 'axios'
import type {
  AxiosRequestConfig,
  AxiosResponse
} from 'axios'
import { DATASOURCE_STRATEGY } from '@xpert-ai/plugin-sdk'
import plugin, {
  XMLA_TYPE,
  XMLARunner,
  XmlaDataSourceStrategy,
  XmlaHttpClient,
  XmlaHttpClientFactory
} from '../index.js'

interface HttpCall {
  url: string
  body: string
  config: AxiosRequestConfig
}

class FakeXmlaHttpClient implements XmlaHttpClient {
  readonly calls: HttpCall[] = []

  constructor(
    private readonly handler: (
      call: HttpCall,
      index: number
    ) => AxiosResponse<unknown> | Promise<AxiosResponse<unknown>>
  ) {}

  async post(
    url: string,
    body: string,
    config: AxiosRequestConfig
  ): Promise<AxiosResponse<unknown>> {
    const call = { url, body, config }
    this.calls.push(call)
    return this.handler(call, this.calls.length - 1)
  }
}

const options = {
  host: 'bw.example.com',
  port: 443,
  username: 'analyst',
  password: 'secret',
  path: 'sap/bw/xml/soap/xmla',
  use_ssl: true,
  disable_reject_cert: true,
  data_source_info: 'SAP BW'
}

function createRunner(client: XmlaHttpClient): XMLARunner {
  const factory: XmlaHttpClientFactory = () => client
  return new XMLARunner(options, factory)
}

function httpResponse(
  data: unknown,
  status = 200,
  cookie?: string[]
): AxiosResponse<unknown> {
  return {
    data,
    status,
    statusText: status === 200 ? 'OK' : 'Unauthorized',
    headers: new AxiosHeaders(
      cookie ? { 'set-cookie': cookie } : undefined
    ),
    config: {
      headers: new AxiosHeaders()
    }
  }
}

describe('@xpert-ai/plugin-xmla', () => {
  it('exports aligned database plugin metadata', () => {
    expect(plugin.meta).toMatchObject({
      name: '@xpert-ai/plugin-xmla',
      version: '0.0.1',
      category: 'database'
    })
  })

  it('registers the legacy XMLA strategy and configuration', async () => {
    expect(
      Reflect.getMetadata(DATASOURCE_STRATEGY, XmlaDataSourceStrategy)
    ).toBe(XMLA_TYPE)

    await expect(
      new XmlaDataSourceStrategy().configurationSchema()
    ).resolves.toMatchObject({
      required: ['host', 'port', 'path'],
      secret: ['password'],
      properties: {
        disable_reject_cert: {
          default: false
        }
      }
    })
  })

  it('builds the legacy URL and authentication settings', () => {
    const client = new FakeXmlaHttpClient(() => httpResponse(''))
    const runner = createRunner(client)

    expect(runner.url).toBe(
      'https://bw.example.com:443/sap/bw/xml/soap/xmla'
    )
    expect(runner.syntax).toBe('mdx')
    expect(runner.protocol).toBe('xmla')
    expect(runner.getAuth()).toEqual({
      username: 'analyst',
      password: 'secret'
    })
  })

  it('authenticates once, reuses cookies, and returns the raw SOAP response', async () => {
    const client = new FakeXmlaHttpClient((_call, index) =>
      index === 0
        ? httpResponse('', 200, ['SESSION=abc'])
        : httpResponse('<xmla>result</xmla>')
    )
    const runner = createRunner(client)

    const result = await runner.runQuery('<Execute/>', {
      headers: {
        'Accept-Language': 'zh-CN'
      }
    })

    expect(result.data).toBe('<xmla>result</xmla>')
    expect(client.calls).toHaveLength(2)
    expect(client.calls[0]).toMatchObject({
      body: '',
      config: {
        auth: {
          username: 'analyst',
          password: 'secret'
        }
      }
    })
    expect(client.calls[1]).toMatchObject({
      body: '<Execute/>',
      config: {
        headers: {
          Cookie: ['SESSION=abc'],
          'Accept-Language': 'zh-CN'
        },
        auth: undefined
      }
    })
    expect(client.calls[1].config.httpsAgent).toBeDefined()
  })

  it('retries a 401 once with basic authentication', async () => {
    const client = new FakeXmlaHttpClient((_call, index) => {
      if (index === 1) {
        throw new AxiosError(
          'Unauthorized',
          'ERR_BAD_REQUEST',
          undefined,
          undefined,
          httpResponse('unauthorized', 401)
        )
      }
      return index === 2
        ? httpResponse('<xmla>retried</xmla>', 200, ['SESSION=new'])
        : httpResponse('')
    })
    const runner = createRunner(client)

    await expect(runner.runQuery('<Execute/>')).resolves.toMatchObject({
      data: '<xmla>retried</xmla>'
    })
    expect(client.calls).toHaveLength(3)
    expect(client.calls[2].config.auth).toEqual({
      username: 'analyst',
      password: 'secret'
    })
  })

  it('propagates non-authentication HTTP errors', async () => {
    const client = new FakeXmlaHttpClient((_call, index) => {
      if (index === 1) {
        throw new Error('XMLA server unavailable')
      }
      return httpResponse('')
    })
    const runner = createRunner(client)

    await expect(runner.runQuery('<Execute/>')).rejects.toThrow(
      'XMLA server unavailable'
    )
  })

  it('clears the authentication cookie during teardown', async () => {
    const client = new FakeXmlaHttpClient((_call, index) =>
      index === 0 || index === 2
        ? httpResponse('', 200, [`SESSION=${index}`])
        : httpResponse('<xmla/>')
    )
    const runner = createRunner(client)

    await runner.runQuery('<Execute/>')
    await runner.teardown()
    await runner.runQuery('<Execute/>')

    expect(client.calls.filter(({ body }) => body === '')).toHaveLength(2)
  })
})
