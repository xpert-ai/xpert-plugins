import { Injectable, Logger } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import type { DataSource } from 'typeorm'
import { LarkMessageLogEntity } from './entities/lark-message-log.entity.js'
import { LARK_ADMIN_SEARCH_FIELDS } from './lark-message-history.service.js'

const ADMIN_SEARCH_INDEX = 'plugin_lark_message_log_admin_search_trgm_idx'

@Injectable()
export class LarkMessageHistorySchemaService {
  private readonly logger = new Logger(LarkMessageHistorySchemaService.name)

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource
  ) {}

  async ensureSchema(): Promise<void> {
    if (!this.dataSource?.isInitialized || this.dataSource.options.type !== 'postgres') {
      return
    }

    let queryRunner: ReturnType<DataSource['createQueryRunner']> | undefined
    try {
      queryRunner = this.dataSource.createQueryRunner()
      await queryRunner.connect()
      if (!(await queryRunner.hasTable(LarkMessageLogEntity.tableName))) {
        return
      }
      await queryRunner.query('CREATE EXTENSION IF NOT EXISTS pg_trgm')
      const existingIndexes = (await queryRunner.query(
        'SELECT i.indisvalid FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE c.relname = $1',
        [ADMIN_SEARCH_INDEX]
      )) as Array<{ indisvalid?: boolean }>
      if (existingIndexes.some((index) => index.indisvalid === false)) {
        await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "${ADMIN_SEARCH_INDEX}"`)
      }
      const expression = `LOWER(${LARK_ADMIN_SEARCH_FIELDS.map(
        (field) => `COALESCE(CAST("${field}" AS text), '')`
      ).join(" || ' ' || ")})`
      await queryRunner.query(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS "${ADMIN_SEARCH_INDEX}" ON "${LarkMessageLogEntity.tableName}" USING GIN ((${expression}) gin_trgm_ops)`
      )
    } catch (error) {
      // Search remains exact via the portable LIKE query; an unavailable extension
      // only removes the PostgreSQL acceleration and must not block plugin startup.
      this.logger.warn(`Unable to ensure Lark admin search index: ${getErrorMessage(error)}`)
    } finally {
      try {
        await queryRunner?.release()
      } catch (error) {
        this.logger.warn(`Unable to release Lark schema query runner: ${getErrorMessage(error)}`)
      }
    }
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
