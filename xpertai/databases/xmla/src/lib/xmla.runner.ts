import { Agent } from 'node:https'
import axios from 'axios'
import type {
  AxiosRequestConfig,
  AxiosResponse
} from 'axios'
import {
  DBProtocolEnum,
  DBSyntaxEnum
} from '@xpert-ai/plugin-sdk'
import type {
  DBQueryRunner,
  HttpAdapterOptions,
  IDSSchema,
  QueryOptions
} from '@xpert-ai/plugin-sdk'

export const XMLA_TYPE = 'xmla'

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
}

export interface XmlaHttpClient {
  post(
    url: string,
    body: string,
    config: AxiosRequestConfig
  ): Promise<AxiosResponse<unknown>>
}

export type XmlaHttpClientFactory = () => XmlaHttpClient

const defaultHttpClientFactory: XmlaHttpClientFactory = () => ({
  post: (url, body, config) =>
    axios.post<unknown>(url, body, config)
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
    const path = this.options.path
      ? `${this.options.path.startsWith('/') ? '' : '/'}${this.options.path}`
      : ''
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
      this.#authenticating = this.performAuthentication(options).finally(
        () => {
          this.#authenticating = undefined
        }
      )
    }
    return this.#authenticating
  }

  async runQuery(
    query: string,
    options?: QueryOptions
  ): Promise<AxiosResponse<unknown>> {
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

  run(
    query: string
  ): Promise<AxiosResponse<unknown>> {
    return this.runQuery(query)
  }

  getCatalogs(): Promise<IDSSchema[]> {
    throw new Error('XMLA catalog discovery is not implemented')
  }

  getSchema(): Promise<IDSSchema[]> {
    throw new Error('XMLA schema discovery is not implemented')
  }

  describe(): Promise<never> {
    throw new Error('XMLA statement description is not implemented')
  }

  async ping(): Promise<void> {
    await this.runQuery('')
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

  private async performAuthentication(
    options?: QueryOptions
  ): Promise<void> {
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

  private createRequestConfig(
    headers: Record<string, string | string[]>,
    includeAuth: boolean
  ): AxiosRequestConfig {
    return {
      headers,
      auth: includeAuth ? this.getAuth() : undefined,
      httpsAgent: this.options.disable_reject_cert
        ? INSECURE_HTTPS_AGENT
        : undefined
    }
  }

  private captureCookie(response: AxiosResponse<unknown>): void {
    const cookie = response.headers['set-cookie']
    if (cookie) {
      this.#authCookie = cookie
    }
  }
}

function isXmlaHttpClientFactory(
  value: unknown
): value is XmlaHttpClientFactory {
  return typeof value === 'function'
}

function isUnauthorizedError(error: unknown): boolean {
  return (
    axios.isAxiosError(error) &&
    error.response?.status === 401
  )
}
