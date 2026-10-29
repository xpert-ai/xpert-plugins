import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

@Entity('plugin_procurement_requirement_item')
@Index(['tenantId', 'organizationId', 'projectId', 'caseId'])
export class ProcurementRequirementItem {
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

  @Column({ type: 'varchar' })
  name!: string

  @Column({ type: 'text', nullable: true })
  specification?: string

  @Column({ type: 'float', nullable: true })
  quantity?: number

  @Column({ type: 'varchar', nullable: true })
  unit?: string

  @Column({ type: 'varchar', nullable: true })
  budgetAmount?: string

  @Column({ type: 'varchar', nullable: true })
  expectedDeliveryDate?: string

  @Column({ type: 'text', nullable: true })
  requirements?: string

  @Column({ type: 'text', nullable: true })
  rawText?: string

  @CreateDateColumn()
  createdAt?: Date

  @UpdateDateColumn()
  updatedAt?: Date
}
