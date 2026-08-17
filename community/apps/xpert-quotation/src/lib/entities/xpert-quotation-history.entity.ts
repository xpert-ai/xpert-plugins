import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { XpertQuotationHistoryAction, XpertQuotationUndoSnapshot } from '../types.js'
import { xpertQuotationTable } from '../constants.js'

@Entity(xpertQuotationTable('history'))
@Index(['tenantId', 'organizationId', 'createdById', 'createdAt'])
@Index(['tenantId', 'organizationId', 'quotationId', 'createdAt'])
export class XpertQuotationHistory {
  @PrimaryGeneratedColumn('uuid') id?: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar', nullable: true }) organizationId?: string | null
  @Column({ type: 'varchar', nullable: true }) createdById?: string | null
  @Column({ type: 'varchar' }) action!: XpertQuotationHistoryAction
  @Column({ type: 'varchar', nullable: true }) quotationId?: string | null
  @Column({ type: 'varchar', nullable: true }) priceBookId?: string | null
  @Column({ type: 'jsonb', nullable: true }) snapshot?: XpertQuotationUndoSnapshot | null
  @Column({ type: 'timestamptz', nullable: true }) undoneAt?: Date | null
  @CreateDateColumn({ type: 'timestamptz' }) createdAt?: Date
}
