import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { ContractReviewJobStatus, ContractReviewJobType } from '../types.js'

@Entity('plugin_contract_review_job')
@Index(['tenantId', 'organizationId', 'projectId', 'reviewId'])
export class ContractReviewJob {
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
  reviewId!: string

  @Column({ type: 'varchar' })
  type!: ContractReviewJobType

  @Column({ type: 'varchar', default: 'queued' })
  status?: ContractReviewJobStatus

  @Column({ type: 'varchar', nullable: true })
  clientMessageId?: string

  @Column({ type: 'varchar', nullable: true })
  conversationId?: string

  @Column({ type: 'int', default: 0 })
  attempts?: number

  @Column({ type: 'text', nullable: true })
  errorMessage?: string

  @CreateDateColumn()
  createdAt?: Date

  @UpdateDateColumn()
  updatedAt?: Date
}
