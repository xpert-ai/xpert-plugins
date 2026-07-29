import 'reflect-metadata'
import {
  AxiosHeaders
} from 'axios'
import type {
  AxiosRequestConfig,
  AxiosResponse
} from 'axios'
import { DATASOURCE_STRATEGY } from '@xpert-ai/plugin-sdk'
import type {
  XmlaHttpClient,
  XmlaHttpClientFactory
} from '@xpert-ai/plugin-xmla'
import plugin, {
  SAP_BW_TYPE,
  SapBwDataSourceStrategy,
  SapBwRunner
} from '../index.js'

class FakeSapBwClient implements XmlaHttpClient {
  calls = 0

  constructor(private readonly failQuery = false) {}

  async post(
    _url: string,
    body: string,
    config: AxiosRequestConfig
  ): Promise<AxiosResponse<unknown>> {
    this.calls += 1
    if (body && this.failQuery) {
      throw new Error('SAP BW query failed')
    }
    return {
      data: body ? '<sapbw>result</sapbw>' : '',
      status: 200,
      statusText: 'OK',
      headers: new AxiosHeaders(
        body ? undefined : { 'set-cookie': ['SAP_SESSION=abc'] }
      ),
      config: {
        ...config,
        headers: AxiosHeaders.from(config.headers)
      }
    }
  }
}

const options = {
  host: 'bw.example.com',
  port: 443,
  username: 'analyst',
  password: 'secret',
  path: '/sap/bw/xml/soap/xmla',
  use_ssl: true
}

function createRunner(client: XmlaHttpClient): SapBwRunner {
  const factory: XmlaHttpClientFactory = () => client
  return new SapBwRunner(options, factory)
}

describe('@xpert-ai/plugin-sap-bw', () => {
  it('exports aligned database plugin metadata', () => {
    expect(plugin.meta).toMatchObject({
      name: '@xpert-ai/plugin-sap-bw',
      version: '0.0.1',
      category: 'database'
    })
  })

  it('registers the legacy sapbw strategy', async () => {
    expect(
      Reflect.getMetadata(DATASOURCE_STRATEGY, SapBwDataSourceStrategy)
    ).toBe(SAP_BW_TYPE)

    await expect(
      new SapBwDataSourceStrategy().configurationSchema()
    ).resolves.toMatchObject({
      required: ['host', 'port', 'path'],
      secret: ['password']
    })
  })

  it('preserves the SAP BW identity and XMLA protocol', () => {
    const runner = createRunner(new FakeSapBwClient())

    expect(runner.type).toBe('sapbw')
    expect(runner.name).toBe('SAP BW (OLAP)')
    expect(runner.syntax).toBe('mdx')
    expect(runner.protocol).toBe('xmla')
    expect(runner.url).toBe(
      'https://bw.example.com:443/sap/bw/xml/soap/xmla'
    )
  })

  it('executes SAP BW requests through the inherited XMLA transport', async () => {
    const client = new FakeSapBwClient()
    const runner = createRunner(client)

    await expect(runner.runQuery('<Execute/>')).resolves.toMatchObject({
      data: '<sapbw>result</sapbw>'
    })
    expect(client.calls).toBe(2)
  })

  it('propagates SAP BW transport errors', async () => {
    const runner = createRunner(new FakeSapBwClient(true))

    await expect(runner.runQuery('<Execute/>')).rejects.toThrow(
      'SAP BW query failed'
    )
  })
})
