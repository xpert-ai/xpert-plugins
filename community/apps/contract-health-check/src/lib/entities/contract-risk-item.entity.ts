import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { ContractRiskDecision, ContractRiskLevel } from '../types.js'

@Entity('plugin_contract_risk_item')
@Index(['tenantId', 'organizationId', 'projectId', 'reviewId'])
export class ContractRiskItem {
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
  level!: ContractRiskLevel

  @Column({ type: 'varchar', nullable: true })
  clauseRef?: string

  @Column({ type: 'varchar' })
  title!: string

  @Column({ type: 'text' })
  issue!: string

  @Column({ type: 'text', nullable: true })
  basis?: string

  @Column({ type: 'varchar', default: 'pending' })
  decision?: ContractRiskDecision

  @Column({ type: 'text', nullable: true })
  customText?: string

  @Column({ type: 'text', nullable: true })
  note?: string

  @CreateDateColumn()
  createdAt?: Date

  @UpdateDateColumn()
  updatedAt?: Date
}
