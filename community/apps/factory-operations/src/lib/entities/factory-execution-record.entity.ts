import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm'
import type { FactoryAgentExecutionStatus } from '../domain/types.js'
import { factoryTable } from '../artifact-namespace.js'

@Entity(factoryTable('execution_record'))
@Index(['scopeKey', 'operationId'], { unique: true })
@Index(['tenantId', 'organizationId', 'caseId', 'nodeKey', 'sequence'], {
  unique: true
})
@Index(['tenantId', 'organizationId', 'status', 'updatedAt'])
export class FactoryExecutionRecordEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', nullable: true })
  tenantId?: string | null

  @Column({ type: 'varchar', nullable: true })
  organizationId?: string | null

  @Column({ type: 'varchar', length: 180 })
  scopeKey!: string

  @Column({ type: 'uuid' })
  caseId!: string

  @Column({ type: 'uuid' })
  workspaceProjectId!: string

  @Column({ type: 'varchar', length: 100 })
  nodeKey!: string

  @Column({ type: 'varchar', length: 100 })
  roleKey!: string

  @Column({ type: 'varchar', length: 120 })
  roleLabel!: string

  @Column({ type: 'varchar', length: 100 })
  agentKey!: string

  @Column({ type: 'varchar', length: 128 })
  operationId!: string

  @Column({ type: 'int' })
  sequence!: number

  @Column({ type: 'int' })
  attemptNumber!: number

  @Column({ type: 'varchar', length: 32 })
  status!: FactoryAgentExecutionStatus

  @Column({ type: 'int' })
  inputRevision!: number

  @Column({ type: 'int', nullable: true })
  outputRevision?: number | null

  @Column({ type: 'varchar', length: 500 })
  safeSummary!: string

  @Column({ type: 'varchar', nullable: true })
  queueJobId?: string | null

  @Column({ type: 'varchar' })
  requesterXpertId!: string

  @Column({ type: 'varchar', nullable: true })
  assistantTaskId?: string | null

  @Column({ type: 'varchar', nullable: true })
  conversationId?: string | null

  @Column({ type: 'varchar', nullable: true })
  threadId?: string | null

  @Column({ type: 'varchar', nullable: true })
  executionId?: string | null

  @Column({ type: 'varchar', nullable: true })
  executorXpertId?: string | null

  @Column({ type: 'varchar', nullable: true })
  executorAgentKey?: string | null

  @Column({ type: 'varchar', nullable: true })
  executorAssistantTemplateKey?: string | null

  @Column({ type: 'varchar', length: 240, nullable: true })
  executorAssistantTitle?: string | null

  @Column({ type: 'varchar', nullable: true })
  executorPublishedVersion?: string | null

  @Column({ type: 'uuid', nullable: true })
  supersededByRecordId?: string | null

  @Column({ type: 'timestamptz' })
  startedAt!: Date

  @Column({ type: 'timestamptz', nullable: true })
  finishedAt?: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date
}
