import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

@Entity('plugin_trade_compliance_controlled_goods')
@Index(['tenantId', 'organizationId', 'hsCode'])
@Index(['tenantId', 'organizationId', 'enabled'])
export class ControlledGoodsRecord {
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

  @Column({ type: 'varchar' })
  productName!: string

  @Column({ type: 'varchar', nullable: true })
  hsCode?: string

  @Column({ type: 'jsonb', nullable: true })
  keywords?: string[]

  @Column({ type: 'text', nullable: true })
  controlNote?: string

  @Column({ type: 'boolean', default: true })
  enabled?: boolean

  @Column({ type: 'varchar', nullable: true })
  sourceFileName?: string

  @Column({ type: 'varchar', nullable: true })
  sourceLocation?: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
