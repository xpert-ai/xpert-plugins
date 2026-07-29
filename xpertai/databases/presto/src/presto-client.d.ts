declare module 'presto-client' {
  export type Engine = 'presto' | 'trino'

  export interface ClientOptions {
    host?: string
    port?: number
    user?: string
    source?: string
    catalog?: string
    schema?: string
    basic_auth?: {
      user: string
      password: string
    }
    ssl?: {
      rejectUnauthorized: boolean
    }
    engine?: Engine
  }

  export interface ResultColumn {
    name: string
    type: string
  }

  export interface ExecuteOptions {
    query: string
    catalog?: string
    schema?: string
    source?: string
    state?: (error: unknown, queryId: string, stats: unknown) => void
    columns?: (error: unknown, columns: ResultColumn[]) => void
    data?: (
      error: unknown,
      rows: unknown[][],
      columns: ResultColumn[],
      stats: unknown
    ) => void
    success: (error: unknown, stats: unknown, info?: unknown) => void
    error: (error: unknown) => void
  }

  export class Client {
    constructor(options?: ClientOptions)
    execute(options: ExecuteOptions): void
  }
}
