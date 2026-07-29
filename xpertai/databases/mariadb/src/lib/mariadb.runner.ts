import {
  MySQLRunner,
  MysqlAdapterOptions
} from '@xpert-ai/plugin-mysql'

export const MARIADB_TYPE = 'mariadb'

export type MariaDbAdapterOptions = MysqlAdapterOptions

export class MariaDbRunner extends MySQLRunner<MariaDbAdapterOptions> {
  override readonly name = 'MariaDB'
  override readonly type = MARIADB_TYPE
  override readonly jdbcDriver = 'org.mariadb.jdbc.Driver'

  override jdbcUrl(schema?: string): string {
    const catalog = encodeURIComponent(this.options.catalog ?? '')
    const currentSchema = schema
      ? `currentSchema=${encodeURIComponent(schema)}&`
      : ''
    return (
      `jdbc:mariadb://${this.host}:${this.port}/${catalog}?` +
      currentSchema +
      `user=${encodeURIComponent(this.options.username)}&` +
      `password=${encodeURIComponent(this.options.password)}`
    )
  }
}
