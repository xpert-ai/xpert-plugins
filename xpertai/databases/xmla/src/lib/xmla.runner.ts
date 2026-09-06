import { Agent } from 'node:https'
import axios from 'axios'
import type { AxiosRequestConfig, AxiosResponse } from 'axios'
import { DBProtocolEnum, DBSyntaxEnum } from '@xpert-ai/plugin-sdk'
import type {
  DBQueryRunner,
  HttpAdapterOptions,
  IColumnDef,
  IDSSchema,
  IDSTable,
  QueryOptions
} from '@xpert-ai/plugin-sdk'
import {
  buildXmlaDiscoverEnvelope,
  buildXmlaExecuteEnvelope,
  parseXmlaRowset,
  requireXmlaString,
  XMLA_DISCOVER_REQUEST,
  xmlaDataTypeToColumnType,
  xmlaValueAsString
} from './xmla.protocol.js'
import type { XmlaRequestItems, XmlaRow, XmlaRowset, XmlaValue } from './xmla.protocol.js'
import { discoverXmlaOlapMetadata } from './xmla.metadata.js'
import type { XmlaOlapMetadata, XmlaOlapMetadataRequest } from './xmla.metadata.js'

export const XMLA_TYPE = 'xmla'
export const XMLA_METADATA_CAPABILITY = 'xmla.metadata'
export const XMLA_METADATA_DISCOVER_OPERATION = 'discover'

/**
 * Generic host query shape, kept local for compatibility with older SDKs.
 * @deprecated Use IDataSourceCapabilityQuery from @xpert-ai/plugin-sdk once the
 * plugin's minimum host SDK version exports that canonical contract.
 */
export interface DataSourceCapabilityQuery {
  capability: string
  operation: string
  payload?: unknown
}

const SOAP_HEADERS = {
  Accept: 'text/xml, application/xml, application/soap+xml',
  'Content-Type': 'text/xml'
}

const INSECURE_HTTPS_AGENT = new Agent({
  rejectUnauthorized: false
})

const EMPTY_OPTIONS: XmlaAdapterOptions = {
  host: '',
  port: 80,
  username: '',
  password: ''
}

export interface XmlaAdapterOptions extends HttpAdapterOptions {
  path?: string
  use_ssl?: boolean
  disable_reject_cert?: boolean
  data_source_info?: string
  language?: string
  query_timeout?: number
}

export interface XmlaDiscoverOptions {
  properties?: XmlaRequestItems
  restrictions?: XmlaRequestItems
  headers?: Readonly<Record<string, string>>
}

export interface XmlaExecuteOptions {
  properties?: XmlaRequestItems
  headers?: Readonly<Record<string, string>>
}

export interface XmlaHttpClient {
  post(url: string, body: string, config: AxiosRequestConfig): Promise<AxiosResponse<unknown>>
}

export type XmlaHttpClientFactory = () => XmlaHttpClient

const defaultHttpClientFactory: XmlaHttpClientFactory = () => ({
  post: (url, body, config) => axios.post<unknown>(url, body, config)
})

export function createXmlaConfigurationSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      use_ssl: {
        type: 'boolean',
        title: 'Use SSL',
        default: false
      },
      host: { type: 'string' },
      port: { type: 'number', default: 80 },
      path: { type: 'string' },
      username: { type: 'string' },
      password: { type: 'string' },
      data_source_info: {
        type: 'string',
        title: 'Data Source Info'
      },
      language: {
        type: 'string',
        title: 'Language'
      },
      query_timeout: {
        type: 'number',
        title: 'Query timeout (ms)',
        minimum: 1
      },
      disable_reject_cert: {
        type: 'boolean',
        title: 'Disable reject cert',
        default: false
      }
    },
    required: ['host', 'port', 'path'],
    order: ['host', 'port', 'path'],
    secret: ['password']
  }
}

export class XMLARunner implements DBQueryRunner {
  static readonly type: string = XMLA_TYPE

  readonly name: string = 'XMLA'
  readonly type: string = XMLA_TYPE
  readonly syntax = DBSyntaxEnum.MDX
  readonly protocol = DBProtocolEnum.XMLA
  readonly jdbcDriver = ''
  readonly options: XmlaAdapterOptions

  readonly #httpClient: XmlaHttpClient
  #authCookie?: string[]
  #authenticating?: Promise<void>

  constructor(options?: XmlaAdapterOptions, ...args: unknown[]) {
    this.options = options ?? EMPTY_OPTIONS

    const factoryValue = args[0]
    let factory = defaultHttpClientFactory
    if (factoryValue !== undefined) {
      if (!isXmlaHttpClientFactory(factoryValue)) {
        throw new Error('XMLA HTTP client factory must be a function')
      }
      factory = factoryValue
    }
    this.#httpClient = factory()
  }

  get host(): string {
    return this.options.host
  }

  get port(): number {
    return this.options.port
  }

  get url(): string {
    const protocol = this.options.use_ssl ? 'https' : 'http'
    const path = this.options.path ? `${this.options.path.startsWith('/') ? '' : '/'}${this.options.path}` : ''
    return `${protocol}://${this.host}:${this.port}${path}`
  }

  get configurationSchema(): Record<string, unknown> {
    return createXmlaConfigurationSchema()
  }

  jdbcUrl(): string {
    return ''
  }

  getAuth(): { username: string; password: string } {
    return {
      username: this.options.username,
      password: this.options.password
    }
  }

  async authenticate(options?: QueryOptions): Promise<void> {
    if (!this.#authenticating) {
      this.#authenticating = this.performAuthentication(options).finally(() => {
        this.#authenticating = undefined
      })
    }
    return this.#authenticating
  }

  async runQuery(query: string, options?: QueryOptions): Promise<AxiosResponse<unknown>> {
    const headers: Record<string, string | string[]> = {
      ...SOAP_HEADERS,
      ...options?.headers
    }

    if (!this.#authCookie) {
      await this.authenticate(options)
    }
    if (this.#authCookie) {
      headers.Cookie = this.#authCookie
    }

    try {
      const response = await this.#httpClient.post(
        this.url,
        query,
        this.createRequestConfig(headers, !this.#authCookie)
      )
      this.captureCookie(response)
      return response
    } catch (error: unknown) {
      if (!isUnauthorizedError(error)) {
        throw error
      }

      const response = await this.#httpClient.post(this.url, query, {
        ...this.createRequestConfig(
          {
            ...SOAP_HEADERS,
            ...options?.headers
          },
          true
        )
      })
      this.captureCookie(response)
      return response
    }
  }

  run(query: string): Promise<AxiosResponse<unknown>> {
    return this.runQuery(query)
  }

  async discover(requestType: string, options: XmlaDiscoverOptions = {}): Promise<XmlaRowset> {
    const response = await this.runQuery(
      buildXmlaDiscoverEnvelope(requestType, {
        properties: this.metadataProperties(options.properties),
        restrictions: options.restrictions
      }),
      {
        headers: this.metadataHeaders(options.headers)
      }
    )
    return parseXmlaRowset(response.data, requestType)
  }

  async executeTabular(statement: string, options: XmlaExecuteOptions = {}): Promise<XmlaRowset> {
    const response = await this.runQuery(
      buildXmlaExecuteEnvelope(statement, {
        properties: this.metadataProperties(options.properties)
      }),
      {
        headers: this.metadataHeaders(options.headers)
      }
    )
    return parseXmlaRowset(response.data)
  }

  async getCatalogs(): Promise<IDSSchema[]> {
    const { rows } = await this.discover(XMLA_DISCOVER_REQUEST.catalogs)
    return rows.map((row) => {
      const name = requireXmlaString(row, 'CATALOG_NAME')
      return {
        catalog: name,
        schema: xmlaValueAsString(row, 'SCHEMA_NAME'),
        name,
        label: xmlaValueAsString(row, 'DESCRIPTION'),
        type: xmlaValueAsString(row, 'SCHEMA_NAME')
      }
    })
  }

  async getSchema(catalog?: string, tableName?: string): Promise<IDSSchema[]> {
    const restrictions: XmlaRequestItems = {
      CATALOG_NAME: catalog,
      CUBE_NAME: tableName
    }
    const properties: XmlaRequestItems = {
      Catalog: catalog
    }
    const { rows } = await this.discover(XMLA_DISCOVER_REQUEST.cubes, { properties, restrictions })
    const cubes = uniqueCubes(rows)

    if (tableName) {
      await Promise.all(
        cubes.map(async (cube) => {
          cube.columns = await this.discoverCubeColumns(cube)
        })
      )
    }

    return groupCubesByCatalog(cubes)
  }

  async queryCapability(query: DataSourceCapabilityQuery): Promise<XmlaOlapMetadata> {
    if (query.capability !== XMLA_METADATA_CAPABILITY || query.operation !== XMLA_METADATA_DISCOVER_OPERATION) {
      throw new Error(`Unsupported XMLA data-source capability: ${query.capability}/${query.operation}`)
    }
    const request = parseMetadataRequest(query.payload)
    return discoverXmlaOlapMetadata(
      (requestType, options) => this.discover(requestType, options),
      request,
      this.options.data_source_info
    )
  }

  async describe(catalog: string, statement: string): Promise<{ columns?: IDSTable['columns'] }> {
    if (!statement.trim()) {
      return { columns: [] }
    }
    const result = await this.executeTabular(statement, {
      properties: {
        Catalog: catalog
      }
    })
    return { columns: result.fields }
  }

  async ping(): Promise<void> {
    await this.discover(XMLA_DISCOVER_REQUEST.dataSources)
  }

  import(): Promise<never> {
    throw new Error('XMLA data import is not supported')
  }

  dropTable(): Promise<never> {
    throw new Error('XMLA table deletion is not supported')
  }

  tableOp(): Promise<never> {
    throw new Error('XMLA table operations are not supported')
  }

  tableDataOp<T = unknown>(): Promise<T[] | number> {
    throw new Error('XMLA table data operations are not supported')
  }

  async teardown(): Promise<void> {
    this.#authCookie = undefined
  }

  private async performAuthentication(options?: QueryOptions): Promise<void> {
    const response = await this.#httpClient.post(
      this.url,
      '',
      this.createRequestConfig(
        {
          ...SOAP_HEADERS,
          ...options?.headers
        },
        true
      )
    )
    this.captureCookie(response)
  }

  private createRequestConfig(headers: Record<string, string | string[]>, includeAuth: boolean): AxiosRequestConfig {
    return {
      headers,
      auth: includeAuth ? this.getAuth() : undefined,
      timeout: this.options.query_timeout,
      httpsAgent: this.options.disable_reject_cert ? INSECURE_HTTPS_AGENT : undefined
    }
  }

  private captureCookie(response: AxiosResponse<unknown>): void {
    const cookie = response.headers['set-cookie']
    if (cookie) {
      this.#authCookie = cookie
    }
  }

  protected measureColumnType(dataType: XmlaValue | undefined): IColumnDef['type'] {
    return xmlaDataTypeToColumnType(dataType)
  }

  private async discoverCubeColumns(cube: XmlaCubeMetadata): Promise<IColumnDef[]> {
    const restrictions: XmlaRequestItems = {
      CATALOG_NAME: cube.catalog,
      CUBE_NAME: cube.name
    }
    const properties: XmlaRequestItems = {
      Catalog: cube.catalog
    }
    const [dimensionResult, measureResult] = await Promise.all([
      this.discover(XMLA_DISCOVER_REQUEST.dimensions, {
        properties,
        restrictions
      }),
      this.discover(XMLA_DISCOVER_REQUEST.measures, {
        properties,
        restrictions
      })
    ])
    const dimensions = dimensionResult.rows.filter((row) => row.DIMENSION_TYPE !== 2 && row.DIMENSION_TYPE !== '2')
    const columns = [
      ...dimensions.map((row, index) => dimensionToColumn(row, index)),
      ...measureResult.rows.map((row, index) =>
        measureToColumn(row, dimensions.length + index, this.measureColumnType(row.DATA_TYPE))
      )
    ]
    return Array.from(new Map(columns.map((column) => [column.name, column])).values())
  }

  private metadataProperties(properties?: XmlaRequestItems): XmlaRequestItems {
    return {
      DataSourceInfo: this.options.data_source_info || undefined,
      ...properties
    }
  }

  private metadataHeaders(headers?: Readonly<Record<string, string>>): Record<string, string> {
    return {
      ...(this.options.language ? { 'Accept-Language': this.options.language } : {}),
      ...headers
    }
  }
}

function parseMetadataRequest(payload: DataSourceCapabilityQuery['payload']): XmlaOlapMetadataRequest {
  if (payload === undefined || payload === null) return {}
  if (!isRecord(payload)) {
    throw new Error('XMLA metadata discovery payload must be an object')
  }
  return {
    catalog: optionalString(payload.catalog, 'catalog'),
    cube: optionalString(payload.cube, 'cube'),
    includeMemberProperties: optionalBoolean(payload.includeMemberProperties, 'includeMemberProperties'),
    includeSapVariables: optionalBoolean(payload.includeSapVariables, 'includeSapVariables')
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new Error(`XMLA metadata field '${field}' must be a string`)
  return value
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') throw new Error(`XMLA metadata field '${field}' must be a boolean`)
  return value
}

interface XmlaCubeMetadata {
  catalog: string
  schema?: string
  name: string
  label?: string
  type?: string
  columns?: IColumnDef[]
}

function uniqueCubes(rows: XmlaRow[]): XmlaCubeMetadata[] {
  const cubes = rows.map((row) => ({
    catalog: requireXmlaString(row, 'CATALOG_NAME'),
    schema: xmlaValueAsString(row, 'SCHEMA_NAME'),
    name: requireXmlaString(row, 'CUBE_NAME'),
    label: xmlaValueAsString(row, 'CUBE_CAPTION') ?? xmlaValueAsString(row, 'DESCRIPTION'),
    type: xmlaValueAsString(row, 'CUBE_TYPE')
  }))
  return Array.from(
    new Map(cubes.map((cube) => [`${cube.catalog}\u0000${cube.schema ?? ''}\u0000${cube.name}`, cube])).values()
  )
}

function groupCubesByCatalog(cubes: XmlaCubeMetadata[]): IDSSchema[] {
  const groups = new Map<string, XmlaCubeMetadata[]>()
  for (const cube of cubes) {
    const values = groups.get(cube.catalog) ?? []
    values.push(cube)
    groups.set(cube.catalog, values)
  }

  return Array.from(groups, ([catalog, catalogCubes]) => ({
    catalog,
    schema: catalogCubes[0]?.schema,
    name: catalog,
    tables: catalogCubes.map((cube) => ({
      schema: cube.schema ?? catalog,
      name: cube.name,
      label: cube.label,
      columns: cube.columns
    }))
  }))
}

function dimensionToColumn(row: XmlaRow, fallbackPosition: number): IColumnDef {
  return {
    name: xmlaValueAsString(row, 'DIMENSION_UNIQUE_NAME') ?? requireXmlaString(row, 'DIMENSION_NAME'),
    label: xmlaValueAsString(row, 'DIMENSION_CAPTION') ?? xmlaValueAsString(row, 'DESCRIPTION'),
    type: 'string',
    dataType: 'MDX_DIMENSION',
    nullable: true,
    position: numericPosition(row.DIMENSION_ORDINAL, fallbackPosition),
    comment: xmlaValueAsString(row, 'DESCRIPTION')
  }
}

function measureToColumn(row: XmlaRow, fallbackPosition: number, type: IColumnDef['type']): IColumnDef {
  const dataType = row.DATA_TYPE
  return {
    name: xmlaValueAsString(row, 'MEASURE_UNIQUE_NAME') ?? requireXmlaString(row, 'MEASURE_NAME'),
    label: xmlaValueAsString(row, 'MEASURE_CAPTION') ?? xmlaValueAsString(row, 'DESCRIPTION'),
    type,
    dataType: dataType === undefined || Array.isArray(dataType) ? 'MDX_MEASURE' : String(dataType),
    nullable: true,
    position: fallbackPosition,
    comment: xmlaValueAsString(row, 'DESCRIPTION')
  }
}

function numericPosition(value: XmlaValue | undefined, fallback: number): number {
  if (typeof value === 'number') {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return fallback
}

function isXmlaHttpClientFactory(value: unknown): value is XmlaHttpClientFactory {
  return typeof value === 'function'
}

function isUnauthorizedError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 401
}
