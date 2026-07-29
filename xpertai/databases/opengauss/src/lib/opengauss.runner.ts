import {
  PostgresAdapterOptions,
  PostgresRunner,
  createPostgresConfigurationSchema
} from '@xpert-ai/plugin-postgres'

export const OPENGAUSS_TYPE = 'opengauss'
const DEFAULT_DATABASE = 'gaussdb'

export type OpenGaussAdapterOptions = PostgresAdapterOptions

export class OpenGaussRunner extends PostgresRunner {
  override readonly name = 'OpenGauss'
  override readonly type = OPENGAUSS_TYPE
  override readonly jdbcDriver = 'org.opengauss.Driver'

  constructor(options?: OpenGaussAdapterOptions, ...args: unknown[]) {
    super(
      options
        ? {
            ...options,
            database: options.database || DEFAULT_DATABASE
          }
        : undefined,
      ...args
    )
  }

  override jdbcUrl(schema?: string): string {
    const schemaQuery = schema
      ? `currentSchema=${encodeURIComponent(schema)}&`
      : ''
    return (
      `jdbc:opengauss://${this.host}:${this.port}/` +
      `${encodeURIComponent(this.options?.database ?? DEFAULT_DATABASE)}?` +
      schemaQuery +
      `user=${encodeURIComponent(this.options?.username ?? '')}&` +
      `password=${encodeURIComponent(this.options?.password ?? '')}`
    )
  }

  override get configurationSchema(): Record<string, unknown> {
    return createPostgresConfigurationSchema(DEFAULT_DATABASE)
  }
}
