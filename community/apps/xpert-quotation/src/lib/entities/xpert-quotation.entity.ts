import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { XpertSheetMapping, QuotationStatus } from '../types.js'
import { xpertQuotationTable } from '../constants.js'

@Entity(xpertQuotationTable('quotation'))
@Index(['tenantId', 'organizationId', 'updatedAt'])
@Index(['tenantId', 'organizationId', 'officeDocumentId'], { unique: true })
export class XpertQuotation {
  @PrimaryGeneratedColumn('uuid') id?: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar', nullable: true }) organizationId?: string | null
  @Column({ type: 'varchar', nullable: true }) workspaceId?: string | null
  @Column({ type: 'varchar', nullable: true }) projectId?: string | null
  @Column({ type: 'varchar', nullable: true }) assistantId?: string | null
  @Column({ type: 'varchar', nullable: true }) createdById?: string | null
  @Column({ type: 'varchar' }) title!: string
  @Column({ type: 'varchar' }) officeDocumentId!: string
  @Column({ type: 'varchar', nullable: true }) officeFileVersionId?: string | null
  @Column({ type: 'int' }) officeVersionNumber!: number
  @Column({ type: 'varchar', nullable: true }) priceBookId?: string | null
  @Column({ type: 'uuid', nullable: true }) quotaSourceVersionId?: string | null
  @Column({ type: 'varchar', default: 'uploaded' }) status!: QuotationStatus
  @Column({ type: 'int', default: 0 }) matchedCount!: number
  @Column({ type: 'int', default: 0 }) reviewCount!: number
  @Column({ type: 'int', default: 0 }) unmatchedCount!: number
  @Column({ type: 'varchar', nullable: true }) totalAmount?: string | null
  @Column({ type: 'jsonb', nullable: true }) warnings?: string[] | null
  @Column({ type: 'jsonb', nullable: true }) sheetMappings?: XpertSheetMapping[] | null
  @Column({ type: 'double precision', nullable: true }) recognitionConfidence?: number | null
  @Column({ type: 'text', nullable: true }) recognitionRationale?: string | null
  @Column({ type: 'timestamptz', nullable: true }) recognizedAt?: Date | null
  @DeleteDateColumn({ type: 'timestamptz', nullable: true }) deletedAt?: Date | null
  @CreateDateColumn({ type: 'timestamptz' }) createdAt?: Date
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt?: Date
}
