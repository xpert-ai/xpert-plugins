import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { ProcurementParseJobStatus, ProcurementParseJobType } from '../types.js'

@Entity('procurement_parse_job')
@Index(['tenantId', 'organizationId', 'projectId', 'caseId'])
export class ProcurementParseJob {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Column({ type: 'varchar' })
  tenantId!: string

  @Column({ type: 'varchar', nullable: true })
  organizationId?: string

  @Column({ type: 'varchar', nullable: true })
  workspaceId?: string

  @Column({ type: 'varchar', nullable: true })
  projectId?: string

  @Column({ type: 'uuid' })
  caseId!: string

  @Column({ type: 'uuid', nullable: true })
  documentId?: string

  @Column({ type: 'varchar' })
  type!: ProcurementParseJobType

  @Column({ type: 'varchar', default: 'queued' })
  status?: ProcurementParseJobStatus

  @Column({ type: 'varchar', nullable: true })
  taskId?: string

  @Column({ type: 'varchar', nullable: true })
  executionId?: string

  @Column({ type: 'varchar', nullable: true })
  conversationId?: string

  @Column({ type: 'varchar', nullable: true })
  threadId?: string

  @Column({ type: 'varchar', nullable: true })
  clientMessageId?: string

  @Column({ type: 'text', nullable: true })
  errorMessage?: string

  @CreateDateColumn()
  createdAt?: Date

  @UpdateDateColumn()
  updatedAt?: Date
}
