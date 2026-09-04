import 'reflect-metadata'
import { AxiosError, AxiosHeaders } from 'axios'
import type { AxiosRequestConfig, AxiosResponse } from 'axios'
import { DATASOURCE_STRATEGY } from '@xpert-ai/plugin-sdk'
import plugin, {
  XMLA_TYPE,
  XMLARunner,
  XmlaDataSourceStrategy,
  XmlaHttpClient,
  XmlaHttpClientFactory,
  XmlaSoapFaultError,
  buildXmlaDiscoverEnvelope,
  parseXmlaRowset
} from '../index.js'

interface HttpCall {
  url: string
  body: string
  config: AxiosRequestConfig
}

interface XmlaFixtureField {
  name: string
  type?: string
  nullable?: boolean
}

interface XmlaFixtureRow {
  [fieldName: string]: string | number | boolean | null
}

class FakeXmlaHttpClient implements XmlaHttpClient {
  readonly calls: HttpCall[] = []

  constructor(
    private readonly handler: (
      call: HttpCall,
      index: number
    ) => AxiosResponse<unknown> | Promise<AxiosResponse<unknown>>
  ) {}

  async post(url: string, body: string, config: AxiosRequestConfig): Promise<AxiosResponse<unknown>> {
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

function httpResponse(data: unknown, status = 200, cookie?: string[]): AxiosResponse<unknown> {
  return {
    data,
    status,
    statusText: status === 200 ? 'OK' : 'Unauthorized',
    headers: new AxiosHeaders(cookie ? { 'set-cookie': cookie } : undefined),
    config: {
      headers: new AxiosHeaders()
    }
  }
}

function rowsetResponse(fields: XmlaFixtureField[], rows: XmlaFixtureRow[]): string {
  const fieldSchema = fields
    .map(
      ({ name, type = 'xsd:string', nullable = false }) =>
        `<xsd:element sql:field="${name}" name="${name}" ` + `type="${type}"${nullable ? ' minOccurs="0"' : ''}/>`
    )
    .join('')
  const rowData = rows
    .map(
      (row) =>
        '<row>' +
        Object.entries(row)
          .map(([name, value]) =>
            value === null ? `<${name} xsi:nil="true"/>` : `<${name}>${escapeXmlFixture(value)}</${name}>`
          )
          .join('') +
        '</row>'
    )
    .join('')
  return [
    '<?xml version="1.0"?>',
    '<SOAP-ENV:Envelope ',
    'xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">',
    '<SOAP-ENV:Body><DiscoverResponse ',
    'xmlns="urn:schemas-microsoft-com:xml-analysis"><return>',
    '<root xmlns="urn:schemas-microsoft-com:xml-analysis:rowset" ',
    'xmlns:xsd="http://www.w3.org/2001/XMLSchema" ',
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ',
    'xmlns:sql="urn:schemas-microsoft-com:xml-sql">',
    '<xsd:schema><xsd:complexType name="row"><xsd:sequence>',
    fieldSchema,
    '</xsd:sequence></xsd:complexType></xsd:schema>',
    rowData,
    '</root></return></DiscoverResponse></SOAP-ENV:Body>',
    '</SOAP-ENV:Envelope>'
  ].join('')
}

function escapeXmlFixture(value: string | number | boolean): string {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

describe('@xpert-ai/plugin-xmla', () => {
  it('exports aligned database plugin metadata', () => {
    expect(plugin.meta).toMatchObject({
      name: '@xpert-ai/plugin-xmla',
      version: '0.0.1',
      level: 'organization',
      category: 'database'
    })
  })

  it('registers the legacy XMLA strategy and configuration', async () => {
    expect(Reflect.getMetadata(DATASOURCE_STRATEGY, XmlaDataSourceStrategy)).toBe(XMLA_TYPE)

    await expect(new XmlaDataSourceStrategy().configurationSchema()).resolves.toMatchObject({
      required: ['host', 'port', 'path'],
      secret: ['password'],
      properties: {
        query_timeout: {
          minimum: 1
        },
        disable_reject_cert: {
          default: false
        }
      }
    })
  })

  it('builds the legacy URL and authentication settings', () => {
    const client = new FakeXmlaHttpClient(() => httpResponse(''))
    const runner = createRunner(client)

    expect(runner.url).toBe('https://bw.example.com:443/sap/bw/xml/soap/xmla')
    expect(runner.syntax).toBe('mdx')
    expect(runner.protocol).toBe('xmla')
    expect(runner.getAuth()).toEqual({
      username: 'analyst',
      password: 'secret'
    })
  })

  it('escapes metadata values when constructing a Discover envelope', () => {
    const envelope = buildXmlaDiscoverEnvelope('MDSCHEMA_CUBES', {
      properties: {
        DataSourceInfo: 'SAP & BW'
      },
      restrictions: {
        CATALOG_NAME: 'Finance <Global>',
        CUBE_NAME: 'P&L'
      }
    })

    expect(envelope).toContain('<DataSourceInfo>SAP &amp; BW</DataSourceInfo>')
    expect(envelope).toContain('<CATALOG_NAME>Finance &lt;Global&gt;</CATALOG_NAME>')
    expect(envelope).toContain('<CUBE_NAME>P&amp;L</CUBE_NAME>')
  })

  it('rejects XMLA responses containing a DOCTYPE declaration', () => {
    expect(() => parseXmlaRowset('<!DOCTYPE root><root/>')).toThrow('must not contain a DOCTYPE')
  })

  it('authenticates once, reuses cookies, and returns the raw SOAP response', async () => {
    const client = new FakeXmlaHttpClient((_call, index) =>
      index === 0 ? httpResponse('', 200, ['SESSION=abc']) : httpResponse('<xmla>result</xmla>')
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
        throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', undefined, undefined, httpResponse('unauthorized', 401))
      }
      return index === 2 ? httpResponse('<xmla>retried</xmla>', 200, ['SESSION=new']) : httpResponse('')
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

    await expect(runner.runQuery('<Execute/>')).rejects.toThrow('XMLA server unavailable')
  })

  it('clears the authentication cookie during teardown', async () => {
    const client = new FakeXmlaHttpClient((_call, index) =>
      index === 0 || index === 2 ? httpResponse('', 200, [`SESSION=${index}`]) : httpResponse('<xmla/>')
    )
    const runner = createRunner(client)

    await runner.runQuery('<Execute/>')
    await runner.teardown()
    await runner.runQuery('<Execute/>')

    expect(client.calls.filter(({ body }) => body === '')).toHaveLength(2)
  })

  it('discovers and maps XMLA catalogs', async () => {
    const client = new FakeXmlaHttpClient((_call, index) =>
      index === 0
        ? httpResponse('', 200, ['SESSION=metadata'])
        : httpResponse(
            rowsetResponse(
              [
                { name: 'CATALOG_NAME' },
                { name: 'SCHEMA_NAME', nullable: true },
                { name: 'DESCRIPTION', nullable: true }
              ],
              [
                {
                  CATALOG_NAME: 'FoodMart',
                  SCHEMA_NAME: 'FoodMart',
                  DESCRIPTION: 'FoodMart demo'
                }
              ]
            )
          )
    )
    const runner = createRunner(client)

    await expect(runner.getCatalogs()).resolves.toEqual([
      {
        catalog: 'FoodMart',
        schema: 'FoodMart',
        name: 'FoodMart',
        label: 'FoodMart demo',
        type: 'FoodMart'
      }
    ])
    expect(client.calls[1].body).toContain('<RequestType>DBSCHEMA_CATALOGS</RequestType>')
    expect(client.calls[1].body).toContain('<DataSourceInfo>SAP BW</DataSourceInfo>')
  })

  it('discovers cubes and detailed dimension and measure columns', async () => {
    const client = new FakeXmlaHttpClient(({ body }) => {
      if (!body) {
        return httpResponse('', 200, ['SESSION=schema'])
      }
      if (body.includes('MDSCHEMA_CUBES')) {
        return httpResponse(
          rowsetResponse(
            [
              { name: 'CATALOG_NAME' },
              { name: 'SCHEMA_NAME', nullable: true },
              { name: 'CUBE_NAME' },
              { name: 'CUBE_CAPTION', nullable: true },
              { name: 'CUBE_TYPE' }
            ],
            [
              {
                CATALOG_NAME: 'FoodMart',
                SCHEMA_NAME: 'FoodMart',
                CUBE_NAME: 'Sales',
                CUBE_CAPTION: 'Retail sales',
                CUBE_TYPE: 'CUBE'
              }
            ]
          )
        )
      }
      if (body.includes('MDSCHEMA_DIMENSIONS')) {
        return httpResponse(
          rowsetResponse(
            [
              { name: 'DIMENSION_NAME' },
              { name: 'DIMENSION_UNIQUE_NAME' },
              { name: 'DIMENSION_CAPTION' },
              { name: 'DIMENSION_ORDINAL', type: 'xsd:unsignedInt' },
              { name: 'DIMENSION_TYPE', type: 'xsd:short' }
            ],
            [
              {
                DIMENSION_NAME: 'Measures',
                DIMENSION_UNIQUE_NAME: '[Measures]',
                DIMENSION_CAPTION: 'Measures',
                DIMENSION_ORDINAL: 0,
                DIMENSION_TYPE: 2
              },
              {
                DIMENSION_NAME: 'Store',
                DIMENSION_UNIQUE_NAME: '[Store]',
                DIMENSION_CAPTION: 'Store',
                DIMENSION_ORDINAL: 1,
                DIMENSION_TYPE: 3
              }
            ]
          )
        )
      }
      if (body.includes('MDSCHEMA_MEASURES')) {
        return httpResponse(
          rowsetResponse(
            [
              { name: 'MEASURE_NAME' },
              { name: 'MEASURE_UNIQUE_NAME' },
              { name: 'MEASURE_CAPTION' },
              { name: 'DATA_TYPE', type: 'xsd:unsignedShort' }
            ],
            [
              {
                MEASURE_NAME: 'Unit Sales',
                MEASURE_UNIQUE_NAME: '[Measures].[Unit Sales]',
                MEASURE_CAPTION: 'Unit Sales',
                DATA_TYPE: 5
              }
            ]
          )
        )
      }
      throw new Error(`Unexpected XMLA request: ${body}`)
    })
    const runner = createRunner(client)

    await expect(runner.getSchema('FoodMart', 'Sales')).resolves.toEqual([
      {
        catalog: 'FoodMart',
        schema: 'FoodMart',
        name: 'FoodMart',
        tables: [
          {
            schema: 'FoodMart',
            name: 'Sales',
            label: 'Retail sales',
            columns: [
              expect.objectContaining({
                name: '[Store]',
                type: 'string',
                dataType: 'MDX_DIMENSION'
              }),
              expect.objectContaining({
                name: '[Measures].[Unit Sales]',
                type: 'number',
                dataType: '5'
              })
            ]
          }
        ]
      }
    ])
    const requestBodies = client.calls.map(({ body }) => body).join('\n')
    expect(requestBodies).toContain('<CATALOG_NAME>FoodMart</CATALOG_NAME>')
    expect(requestBodies).toContain('<CUBE_NAME>Sales</CUBE_NAME>')
  })

  it('describes a tabular MDX result from its XMLA rowset schema', async () => {
    const client = new FakeXmlaHttpClient((_call, index) =>
      index === 0
        ? httpResponse('', 200, ['SESSION=describe'])
        : httpResponse(
            rowsetResponse(
              [
                { name: 'Store', type: 'xsd:string' },
                { name: 'Unit Sales', type: 'xsd:double' }
              ],
              []
            )
          )
    )
    const runner = createRunner(client)

    await expect(
      runner.describe('FoodMart', 'SELECT {[Measures].[Unit Sales]} ON COLUMNS FROM [Sales]')
    ).resolves.toEqual({
      columns: [
        expect.objectContaining({ name: 'Store', type: 'string' }),
        expect.objectContaining({ name: 'Unit Sales', type: 'number' })
      ]
    })
    expect(client.calls[1].body).toContain('<Execute ')
    expect(client.calls[1].body).toContain('<Catalog>FoodMart</Catalog>')
  })

  it('surfaces XMLA SOAP faults with the provider code and detail', async () => {
    const client = new FakeXmlaHttpClient((_call, index) =>
      index === 0
        ? httpResponse('', 200, ['SESSION=fault'])
        : httpResponse(
            [
              '<SOAP-ENV:Envelope ',
              'xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">',
              '<SOAP-ENV:Body><SOAP-ENV:Fault>',
              '<faultcode>XMLA:BadCatalog</faultcode>',
              '<faultstring>Catalog was not found</faultstring>',
              '<detail><Error Description="Unknown catalog"/></detail>',
              '</SOAP-ENV:Fault></SOAP-ENV:Body></SOAP-ENV:Envelope>'
            ].join('')
          )
    )
    const runner = createRunner(client)

    const result = runner.getCatalogs()
    await expect(result).rejects.toThrow('Catalog was not found')
    await expect(result).rejects.toBeInstanceOf(XmlaSoapFaultError)
  })
})
