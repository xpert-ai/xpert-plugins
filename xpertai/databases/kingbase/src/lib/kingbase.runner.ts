import {
  PostgresAdapterOptions,
  PostgresRunner,
  createPostgresConfigurationSchema
} from '@xpert-ai/plugin-postgres'

export const KINGBASE_TYPE = 'kingbase'
const DEFAULT_DATABASE = 'kingbase'

export type KingbaseAdapterOptions = PostgresAdapterOptions

export class KingbaseRunner extends PostgresRunner {
  override readonly name = 'KingbaseES'
  override readonly type = KINGBASE_TYPE
  override readonly jdbcDriver = 'com.kingbase8.Driver'

  constructor(options?: KingbaseAdapterOptions, ...args: unknown[]) {
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
      `jdbc:kingbase8://${this.host}:${this.port}/` +
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
