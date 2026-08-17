import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { PriceItem } from '../types.js'
import { xpertQuotationTable } from '../constants.js'

@Entity(xpertQuotationTable('price_book'))
@Index(['tenantId', 'organizationId', 'createdAt'])
export class XpertPriceBook {
  @PrimaryGeneratedColumn('uuid') id?: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar', nullable: true }) organizationId?: string | null
  @Column({ type: 'varchar', nullable: true }) workspaceId?: string | null
  @Column({ type: 'varchar', nullable: true }) projectId?: string | null
  @Column({ type: 'varchar', nullable: true }) createdById?: string | null
  @Column({ type: 'varchar' }) name!: string
  @Column({ type: 'varchar' }) fileName!: string
  @Column({ type: 'varchar' }) checksum!: string
  @Column({ type: 'int' }) itemCount!: number
  @Column({ type: 'jsonb' }) items!: PriceItem[]
  @DeleteDateColumn({ type: 'timestamptz', nullable: true }) deletedAt?: Date | null
  @CreateDateColumn({ type: 'timestamptz' }) createdAt?: Date
}
