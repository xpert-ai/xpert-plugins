import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm'

@Entity(PluginCodexpertConnectorRunEntity.tableName)
@Index('IDX_plugin_codexpert_run_scope', ['tenantId', 'organizationId', 'userId'])
@Index('IDX_plugin_codexpert_run_execution', ['executionId'])
@Index('IDX_plugin_codexpert_run_session', ['codingSessionId'])
export class PluginCodexpertConnectorRunEntity {
  static readonly tableName = 'plugin_codexpert_connector_run'

  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'tenant_id', type: 'varchar', length: 64 })
  tenantId!: string

  @Column({ name: 'organization_id', type: 'varchar', length: 64 })
  organizationId!: string

  @Column({ name: 'user_id', type: 'varchar', length: 64 })
  userId!: string

  @Column({ name: 'xpert_id', type: 'varchar', length: 64, nullable: true })
  xpertId?: string | null

  @Column({ name: 'conversation_id', type: 'varchar', length: 128, nullable: true })
  conversationId?: string | null

  @Column({ name: 'execution_id', type: 'varchar', length: 128, nullable: true })
  executionId?: string | null

  @Column({ name: 'coding_session_id', type: 'varchar', length: 128, nullable: true })
  codingSessionId?: string | null

  @Column({ name: 'task_id', type: 'varchar', length: 128, nullable: true })
  taskId?: string | null

  @Column({ name: 'thread_id', type: 'varchar', length: 128, nullable: true })
  threadId?: string | null

  @Column({ name: 'codexpert_execution_id', type: 'varchar', length: 128, nullable: true })
  codexpertExecutionId?: string | null

  @Column({ name: 'status', type: 'varchar', length: 32 })
  status!: string

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError?: string | null

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown> | null

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date
}
