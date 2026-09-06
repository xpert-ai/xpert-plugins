import 'reflect-metadata'
import { AxiosHeaders } from 'axios'
import type { AxiosRequestConfig, AxiosResponse } from 'axios'
import { DATASOURCE_STRATEGY } from '@xpert-ai/plugin-sdk'
import type { XmlaHttpClient, XmlaHttpClientFactory } from '@xpert-ai/plugin-xmla'
import plugin, { SAP_BW_TYPE, SapBwDataSourceStrategy, SapBwRunner } from '../index.js'

class FakeSapBwClient implements XmlaHttpClient {
  calls = 0

  constructor(private readonly failQuery = false) {}

  async post(_url: string, body: string, config: AxiosRequestConfig): Promise<AxiosResponse<unknown>> {
    this.calls += 1
    if (body && this.failQuery) {
      throw new Error('SAP BW query failed')
    }
    return {
      data: body ? '<sapbw>result</sapbw>' : '',
      status: 200,
      statusText: 'OK',
      headers: new AxiosHeaders(body ? undefined : { 'set-cookie': ['SAP_SESSION=abc'] }),
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

function rowsetResponse(
  fieldTypes: Readonly<Record<string, string>>,
  rows: ReadonlyArray<Readonly<Record<string, string | number>>>
): string {
  const fields = Object.entries(fieldTypes)
    .map(([name, type]) => `<xsd:element sql:field="${name}" name="${name}" type="${type}"/>`)
    .join('')
  const values = rows
    .map(
      (row) =>
        '<row>' +
        Object.entries(row)
          .map(([name, value]) => `<${name}>${value}</${name}>`)
          .join('') +
        '</row>'
    )
    .join('')
  return [
    '<SOAP-ENV:Envelope ',
    'xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">',
    '<SOAP-ENV:Body><DiscoverResponse ',
    'xmlns="urn:schemas-microsoft-com:xml-analysis"><return>',
    '<root xmlns="urn:schemas-microsoft-com:xml-analysis:rowset" ',
    'xmlns:xsd="http://www.w3.org/2001/XMLSchema" ',
    'xmlns:sql="urn:schemas-microsoft-com:xml-sql">',
    '<xsd:schema><xsd:complexType name="row"><xsd:sequence>',
    fields,
    '</xsd:sequence></xsd:complexType></xsd:schema>',
    values,
    '</root></return></DiscoverResponse></SOAP-ENV:Body>',
    '</SOAP-ENV:Envelope>'
  ].join('')
}

describe('@xpert-ai/plugin-sap-bw', () => {
  it('exports aligned database plugin metadata', () => {
    expect(plugin.meta).toMatchObject({
      name: '@xpert-ai/plugin-sap-bw',
      version: '0.0.1',
      level: 'organization',
      category: 'database'
    })
  })

  it('registers the legacy sapbw strategy', async () => {
    expect(Reflect.getMetadata(DATASOURCE_STRATEGY, SapBwDataSourceStrategy)).toBe(SAP_BW_TYPE)

    await expect(new SapBwDataSourceStrategy().configurationSchema()).resolves.toMatchObject({
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
    expect(runner.url).toBe('https://bw.example.com:443/sap/bw/xml/soap/xmla')
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

    await expect(runner.runQuery('<Execute/>')).rejects.toThrow('SAP BW query failed')
  })

  it('preserves standard catalog discovery by default', async () => {
    const runner = createRunner(new FakeSapBwClient())
    const discover = jest.spyOn(runner, 'discover').mockResolvedValue({
      fields: [],
      rows: [{ CATALOG_NAME: 'BW', DESCRIPTION: 'Warehouse' }]
    })

    await expect(runner.getCatalogs()).resolves.toEqual([
      expect.objectContaining({ name: 'BW', label: 'Warehouse' })
    ])
    expect(discover).toHaveBeenCalledWith('DBSCHEMA_CATALOGS')
    expect(runner.configurationSchema).toMatchObject({
      properties: { catalog_discovery: { enum: ['catalogs', 'cubes'], default: 'catalogs' } }
    })
  })

  it('can discover distinct catalogs from accessible BW cubes', async () => {
    const client = new FakeSapBwClient()
    const runner = new SapBwRunner({ ...options, catalog_discovery: 'cubes' }, () => client)
    const discover = jest.spyOn(runner, 'discover').mockResolvedValue({
      fields: [],
      rows: [
        { CATALOG_NAME: 'BW_A', CUBE_NAME: 'BW_A/QUERY_1' },
        { CATALOG_NAME: 'BW_A', CUBE_NAME: 'BW_A/QUERY_2' },
        { CATALOG_NAME: 'BW_B', CUBE_NAME: 'BW_B/QUERY_3' }
      ]
    })

    const catalogs = await runner.getCatalogs()

    expect(catalogs.map((catalog) => catalog.name)).toEqual(['BW_A', 'BW_B'])
    expect(catalogs.every((catalog) => !catalog.tables)).toBe(true)
    expect(discover).toHaveBeenCalledTimes(1)
    expect(discover).toHaveBeenCalledWith('MDSCHEMA_CUBES', expect.any(Object))
  })

  it('does not hide errors or invent catalogs in cube discovery mode', async () => {
    const runner = new SapBwRunner({ ...options, catalog_discovery: 'cubes' }, () => new FakeSapBwClient())
    const discover = jest.spyOn(runner, 'discover').mockResolvedValue({ fields: [], rows: [] })
    await expect(runner.getCatalogs()).resolves.toEqual([])

    discover.mockRejectedValueOnce(new Error('BW metadata denied'))
    await expect(runner.getCatalogs()).rejects.toThrow('BW metadata denied')
  })

  it('discovers SAP BW variables through the vendor rowset', async () => {
    const client = new FakeSapBwClient()
    client.post = async (_url: string, body: string, config: AxiosRequestConfig): Promise<AxiosResponse<unknown>> => {
      client.calls += 1
      return {
        data: body
          ? rowsetResponse(
              {
                CATALOG_NAME: 'xsd:string',
                CUBE_NAME: 'xsd:string',
                VARIABLE_NAME: 'xsd:string',
                VARIABLE_CAPTION: 'xsd:string',
                VARIABLE_GUID: 'xsd:string',
                VARIABLE_TYPE: 'xsd:unsignedInt',
                VARIABLE_ORDINAL: 'xsd:unsignedInt',
                DATA_TYPE: 'xsd:string',
                MAX_LENGTH: 'xsd:unsignedInt',
                VARIABLE_SELECTION_TYPE: 'xsd:unsignedInt',
                REFERENCE_DIMENSION: 'xsd:string'
              },
              [
                {
                  CATALOG_NAME: '$INFOCUBE',
                  CUBE_NAME: 'ZSALES',
                  VARIABLE_NAME: '[!V000001]',
                  VARIABLE_CAPTION: 'Fiscal period',
                  VARIABLE_GUID: '005056AA-33EA-1EE9-B099-F7BEEFD55AB6',
                  VARIABLE_TYPE: 1,
                  VARIABLE_ORDINAL: 1,
                  DATA_TYPE: 'CHAR',
                  MAX_LENGTH: 143,
                  VARIABLE_SELECTION_TYPE: 2,
                  REFERENCE_DIMENSION: '[0FISCPER]'
                }
              ]
            )
          : '',
        status: 200,
        statusText: 'OK',
        headers: new AxiosHeaders(body ? undefined : { 'set-cookie': ['SAP_SESSION=variables'] }),
        config: {
          ...config,
          headers: AxiosHeaders.from(config.headers)
        }
      }
    }
    const runner = createRunner(client)

    await expect(runner.discoverVariables('$INFOCUBE', 'ZSALES')).resolves.toEqual([
      expect.objectContaining({
        catalogName: '$INFOCUBE',
        cubeName: 'ZSALES',
        name: '[!V000001]',
        label: 'Fiscal period',
        guid: '005056AA-33EA-1EE9-B099-F7BEEFD55AB6',
        variableType: 1,
        ordinal: 1,
        dataType: 'CHAR',
        maxLength: 143,
        selectionType: 2,
        referenceDimension: '[0FISCPER]'
      })
    ])
  })

  it('maps SAP BW measure types in inherited cube schemas', async () => {
    const client = new FakeSapBwClient()
    client.post = async (_url: string, body: string, config: AxiosRequestConfig): Promise<AxiosResponse<unknown>> => {
      client.calls += 1
      let data = ''
      if (body.includes('MDSCHEMA_CUBES')) {
        data = rowsetResponse(
          {
            CATALOG_NAME: 'xsd:string',
            CUBE_NAME: 'xsd:string',
            CUBE_TYPE: 'xsd:string'
          },
          [
            {
              CATALOG_NAME: '$INFOCUBE',
              CUBE_NAME: 'ZSALES',
              CUBE_TYPE: 'CUBE'
            }
          ]
        )
      } else if (body.includes('MDSCHEMA_DIMENSIONS')) {
        data = rowsetResponse({}, [])
      } else if (body.includes('MDSCHEMA_MEASURES')) {
        data = rowsetResponse(
          {
            MEASURE_NAME: 'xsd:string',
            MEASURE_UNIQUE_NAME: 'xsd:string',
            DATA_TYPE: 'xsd:string'
          },
          [
            {
              MEASURE_NAME: 'Amount',
              MEASURE_UNIQUE_NAME: '[Measures].[Amount]',
              DATA_TYPE: 'CURR'
            },
            {
              MEASURE_NAME: 'Posting date',
              MEASURE_UNIQUE_NAME: '[Measures].[Posting date]',
              DATA_TYPE: 'DATS'
            },
            {
              MEASURE_NAME: 'Raw value',
              MEASURE_UNIQUE_NAME: '[Measures].[Raw value]',
              DATA_TYPE: 'RAW'
            },
            {
              MEASURE_NAME: 'Long raw value',
              MEASURE_UNIQUE_NAME: '[Measures].[Long raw value]',
              DATA_TYPE: 'LRAW'
            },
            {
              MEASURE_NAME: 'Variable byte string',
              MEASURE_UNIQUE_NAME: '[Measures].[Variable byte string]',
              DATA_TYPE: 'RSTR'
            }
          ]
        )
      }
      return {
        data,
        status: 200,
        statusText: 'OK',
        headers: new AxiosHeaders(body ? undefined : { 'set-cookie': ['SAP_SESSION=schema'] }),
        config: {
          ...config,
          headers: AxiosHeaders.from(config.headers)
        }
      }
    }
    const runner = createRunner(client)

    const schemas = await runner.getSchema('$INFOCUBE', 'ZSALES')
    expect(schemas[0]?.tables?.[0]?.columns).toEqual([
      expect.objectContaining({
        name: '[Measures].[Amount]',
        type: 'number',
        dataType: 'CURR'
      }),
      expect.objectContaining({
        name: '[Measures].[Posting date]',
        type: 'timestamp',
        dataType: 'DATS'
      }),
      expect.objectContaining({
        name: '[Measures].[Raw value]',
        type: 'number',
        dataType: 'RAW'
      }),
      expect.objectContaining({
        name: '[Measures].[Long raw value]',
        type: 'string',
        dataType: 'LRAW'
      }),
      expect.objectContaining({
        name: '[Measures].[Variable byte string]',
        type: 'string',
        dataType: 'RSTR'
      })
    ])
  })
})
