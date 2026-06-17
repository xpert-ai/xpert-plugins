import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { ControlledGoodsStatus } from '../types.js'

@Entity('plugin_trade_compliance_product')
@Index(['tenantId', 'organizationId', 'supplierName'])
@Index(['tenantId', 'organizationId', 'enrichedHsCode'])
@Index(['tenantId', 'organizationId', 'controlledStatus'])
export class TradeProduct {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Column({ type: 'varchar', nullable: true })
  tenantId?: string

  @Column({ type: 'varchar', nullable: true })
  organizationId?: string

  @Column({ type: 'varchar', nullable: true })
  workspaceId?: string

  @Column({ type: 'varchar', nullable: true })
  createdById?: string

  @Column({ type: 'varchar', nullable: true })
  supplierId?: string

  @Column({ type: 'varchar' })
  supplierName!: string

  @Column({ type: 'varchar' })
  productName!: string

  @Column({ type: 'varchar', nullable: true })
  model?: string

  @Column({ type: 'text', nullable: true })
  description?: string

  @Column({ type: 'float', nullable: true })
  quantity?: number

  @Column({ type: 'varchar', nullable: true })
  unit?: string

  @Column({ type: 'float', nullable: true })
  taxInclusiveUnitPrice?: number

  @Column({ type: 'float', nullable: true })
  taxInclusiveTotalAmount?: number

  @Column({ type: 'varchar', nullable: true })
  contractHsCode?: string

  @Column({ type: 'varchar', nullable: true })
  enrichedHsCode?: string

  @Column({ type: 'varchar', nullable: true })
  taxRefundRate?: string

  @Column({ type: 'varchar', nullable: true })
  englishName?: string

  @Column({ type: 'varchar', default: 'unchecked' })
  controlledStatus?: ControlledGoodsStatus

  @Column({ type: 'text', nullable: true })
  controlNote?: string

  @Column({ type: 'jsonb', nullable: true })
  matchedControlledGoods?: Array<Record<string, unknown>>

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
