import { Injectable, Logger, Optional } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository, Table, TableColumn, TableIndex, type TableColumnOptions } from 'typeorm'
import { PluginCodexpertConnectorRunEntity } from './entities/codexpert-connector-run.entity.js'

type UpsertRunInput = {
  tenantId: string
  organizationId: string
  userId: string
  xpertId?: string | null
  conversationId?: string | null
  executionId?: string | null
  codingSessionId?: string | null
  taskId?: string | null
  threadId?: string | null
  codexpertExecutionId?: string | null
  status: string
  lastError?: string | null
  metadata?: Record<string, unknown> | null
}

@Injectable()
export class CodexpertConnectorRunService {
  private readonly logger = new Logger(CodexpertConnectorRunService.name)
  private schemaEnsured = false

  constructor(
    @Optional()
    @InjectDataSource()
    private readonly dataSource?: DataSource,
    @Optional()
    @InjectRepository(PluginCodexpertConnectorRunEntity)
    private readonly repository?: Repository<PluginCodexpertConnectorRunEntity>,
  ) {}

  async ensureSchema(): Promise<void> {
    if (this.schemaEnsured || !this.dataSource?.isInitialized) {
      return
    }

    const queryRunner = this.dataSource.createQueryRunner()
    try {
      await queryRunner.connect()
      const table = await queryRunner.getTable(PluginCodexpertConnectorRunEntity.tableName)
      if (!table) {
        await queryRunner.createTable(
          new Table({
            name: PluginCodexpertConnectorRunEntity.tableName,
            columns: [
              { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'gen_random_uuid()' },
              { name: 'tenant_id', type: 'varchar', length: '64' },
              { name: 'organization_id', type: 'varchar', length: '64' },
              { name: 'user_id', type: 'varchar', length: '64' },
              { name: 'xpert_id', type: 'varchar', length: '64', isNullable: true },
              { name: 'conversation_id', type: 'varchar', length: '128', isNullable: true },
              { name: 'execution_id', type: 'varchar', length: '128', isNullable: true },
              { name: 'coding_session_id', type: 'varchar', length: '128', isNullable: true },
              { name: 'task_id', type: 'varchar', length: '128', isNullable: true },
              { name: 'thread_id', type: 'varchar', length: '128', isNullable: true },
              { name: 'codexpert_execution_id', type: 'varchar', length: '128', isNullable: true },
              { name: 'status', type: 'varchar', length: '32' },
              { name: 'last_error', type: 'text', isNullable: true },
              { name: 'metadata', type: 'jsonb', isNullable: true },
              { name: 'created_at', type: 'timestamp with time zone', default: 'now()' },
              { name: 'updated_at', type: 'timestamp with time zone', default: 'now()' },
            ],
          }),
          true,
        )
      } else {
        await this.ensureColumn(table, 'codexpert_execution_id', { type: 'varchar', length: '128', isNullable: true })
        await this.ensureColumn(table, 'last_error', { type: 'text', isNullable: true })
        await this.ensureColumn(table, 'metadata', { type: 'jsonb', isNullable: true })
      }

      await this.ensureIndex('IDX_plugin_codexpert_run_scope', ['tenant_id', 'organization_id', 'user_id'])
      await this.ensureIndex('IDX_plugin_codexpert_run_execution', ['execution_id'])
      await this.ensureIndex('IDX_plugin_codexpert_run_session', ['coding_session_id'])
      this.schemaEnsured = true
    } catch (error) {
      this.logger.warn(`Failed to ensure Codexpert connector run schema: ${describeError(error)}`)
    } finally {
      await queryRunner.release()
    }
  }

  async record(input: UpsertRunInput): Promise<void> {
    if (!this.repository) {
      return
    }
    try {
      await this.ensureSchema()
      const existing = input.executionId
        ? await this.repository.findOne({ where: { executionId: input.executionId } })
        : null
      const entity = this.repository.create({
        ...(existing ?? {}),
        ...input,
        updatedAt: new Date(),
      })
      await this.repository.save(entity)
    } catch (error) {
      this.logger.warn(`Failed to record Codexpert connector run: ${describeError(error)}`)
    }
  }

  private async ensureColumn(table: Table, name: string, definition: Omit<TableColumnOptions, 'name'>) {
    if (table.findColumnByName(name) || !this.dataSource?.isInitialized) {
      return
    }
    const queryRunner = this.dataSource.createQueryRunner()
    try {
      await queryRunner.connect()
      await queryRunner.addColumn(
        PluginCodexpertConnectorRunEntity.tableName,
        new TableColumn({ name, ...definition }),
      )
    } finally {
      await queryRunner.release()
    }
  }

  private async ensureIndex(name: string, columnNames: string[]) {
    if (!this.dataSource?.isInitialized) {
      return
    }
    const queryRunner = this.dataSource.createQueryRunner()
    try {
      await queryRunner.connect()
      const table = await queryRunner.getTable(PluginCodexpertConnectorRunEntity.tableName)
      if (!table || table.indices.some((index) => index.name === name)) {
        return
      }
      await queryRunner.createIndex(
        PluginCodexpertConnectorRunEntity.tableName,
        new TableIndex({ name, columnNames }),
      )
    } finally {
      await queryRunner.release()
    }
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
