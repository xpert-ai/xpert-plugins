import { Injectable, Logger } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, QueryRunner, Table, TableIndex } from 'typeorm'
import { DingTalkConversationBindingEntity } from './entities/dingtalk-conversation-binding.entity.js'

const USER_ID_INDEX = 'plugin_dingtalk_conversation_binding_user_id_idx'

@Injectable()
export class DingTalkConversationBindingSchemaService {
  private readonly logger = new Logger(DingTalkConversationBindingSchemaService.name)

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource
  ) {}

  async ensureSchema(): Promise<void> {
    if (!this.dataSource?.isInitialized) {
      return
    }

    const queryRunner = this.dataSource.createQueryRunner()
    const actions: string[] = []

    try {
      await queryRunner.connect()

      let table = await this.loadTable(queryRunner)
      if (!table) {
        this.logger.warn(
          `[dingtalk-bind] Table "${DingTalkConversationBindingEntity.tableName}" is missing, skip schema ensure.`
        )
        return
      }

      const droppedLegacyUserIdUnique = await this.dropUniqueSemantics(queryRunner, table, ['userId'], actions)
      if (droppedLegacyUserIdUnique) {
        table = await this.loadTable(queryRunner)
      }
      if (!table) {
        return
      }

      if (!this.hasPlainIndex(table, ['userId'])) {
        await queryRunner.createIndex(
          DingTalkConversationBindingEntity.tableName,
          new TableIndex({
            name: USER_ID_INDEX,
            columnNames: ['userId']
          })
        )
        actions.push(`create index ${USER_ID_INDEX}`)
      }

      if (actions.length) {
        this.logger.log(`[dingtalk-bind] Ensured schema: ${actions.join(', ')}`)
      }
    } finally {
      await queryRunner.release()
    }
  }

  private async loadTable(queryRunner: QueryRunner): Promise<Table | undefined> {
    return (await queryRunner.getTable(DingTalkConversationBindingEntity.tableName)) ?? undefined
  }

  private async dropUniqueSemantics(
    queryRunner: QueryRunner,
    table: Table,
    columns: string[],
    actions: string[]
  ): Promise<boolean> {
    let changed = false

    for (const index of table.indices) {
      if (!index.isUnique || !this.hasSameColumnSet(index.columnNames, columns)) {
        continue
      }

      await queryRunner.dropIndex(DingTalkConversationBindingEntity.tableName, index)
      actions.push(`drop unique index ${index.name ?? `(${columns.join('+')}-index)`}`)
      changed = true
    }

    for (const unique of table.uniques) {
      if (!this.hasSameColumnSet(unique.columnNames, columns)) {
        continue
      }

      await queryRunner.dropUniqueConstraint(DingTalkConversationBindingEntity.tableName, unique)
      actions.push(`drop unique constraint ${unique.name ?? `(${columns.join('+')}-constraint)`}`)
      changed = true
    }

    return changed
  }

  private hasPlainIndex(table: Table, columns: string[]): boolean {
    return table.indices.some((index) => !index.isUnique && this.hasSameColumnSet(index.columnNames, columns))
  }

  private hasSameColumnSet(actual: string[], expected: string[]): boolean {
    if (actual.length !== expected.length) {
      return false
    }

    const actualSet = [...actual].sort()
    const expectedSet = [...expected].sort()
    return actualSet.every((column, index) => column === expectedSet[index])
  }
}
