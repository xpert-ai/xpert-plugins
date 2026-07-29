import {
  PrestoAdapterOptions,
  PrestoEngine,
  PrestoQueryRunner,
  createPrestoConfigurationSchema
} from '@xpert-ai/plugin-presto'

export const TRINO_TYPE = 'trino'

export type TrinoAdapterOptions = PrestoAdapterOptions

export class TrinoQueryRunner extends PrestoQueryRunner {
  override readonly name = 'Trino'
  override readonly type = TRINO_TYPE
  override readonly jdbcDriver = 'io.trino.jdbc.TrinoDriver'

  protected override get engine(): PrestoEngine {
    return 'trino'
  }

  override jdbcUrl(schema?: string): string {
    const catalog = encodeURIComponent(this.options?.catalog ?? 'hive')
    const schemaName = encodeURIComponent(
      schema ?? this.options?.schema ?? 'default'
    )
    const properties: string[] = []
    if (this.options?.username) {
      properties.push(
        `user=${encodeURIComponent(this.options.username)}`
      )
    }
    if (this.options?.password) {
      properties.push(
        `password=${encodeURIComponent(this.options.password)}`
      )
    }
    if (this.options?.useSSL) {
      properties.push('SSL=true')
    }
    return (
      `jdbc:trino://${this.host}:${this.port}/${catalog}/${schemaName}?` +
      properties.join('&')
    )
  }

  override get configurationSchema(): Record<string, unknown> {
    return createPrestoConfigurationSchema()
  }
}
