import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

@Entity('plugin_contract_suggestion')
@Index(['tenantId', 'organizationId', 'projectId', 'reviewId'])
export class ContractSuggestion {
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

  @Column({ type: 'varchar', nullable: true })
  clauseRef?: string

  @Column({ type: 'varchar' })
  riskTitle!: string

  @Column({ type: 'text', nullable: true })
  originalText?: string

  @Column({ type: 'text' })
  suggestedText!: string

  @Column({ type: 'text', nullable: true })
  rationale?: string

  @CreateDateColumn()
  createdAt?: Date

  @UpdateDateColumn()
  updatedAt?: Date
}
