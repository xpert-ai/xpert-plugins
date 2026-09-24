import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

@Entity('plugin_procurement_recommendation')
@Index(['tenantId', 'organizationId', 'projectId', 'caseId'])
export class ProcurementRecommendation {
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

  @Column({ type: 'text' })
  summary!: string

  @Column({ type: 'varchar', nullable: true })
  recommendedSupplier?: string

  @Column({ type: 'text', nullable: true })
  recommendedPlan?: string

  @Column({ type: 'text', nullable: true })
  explanation?: string

  @Column({ type: 'text', nullable: true })
  reportDraft?: string

  @Column({ type: 'json', nullable: true })
  pendingQuestions?: string[]

  @CreateDateColumn()
  createdAt?: Date

  @UpdateDateColumn()
  updatedAt?: Date
}
