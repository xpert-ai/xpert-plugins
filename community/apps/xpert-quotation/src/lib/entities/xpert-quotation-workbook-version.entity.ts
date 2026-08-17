import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { WorkspaceFileCatalog } from '@xpert-ai/plugin-sdk'
import { xpertQuotationTable } from '../constants.js'

export type XpertQuotationWorkbookVersionSource = 'import' | 'workbench' | 'patch' | 'restore'

@Entity(xpertQuotationTable('workbook_version'))
@Index(['tenantId', 'organizationId', 'quotationId', 'createdAt'])
@Index(['quotationId', 'versionNumber'], { unique: true })
@Index(['quotationId', 'idempotencyKey'], { unique: true })
export class XpertQuotationWorkbookVersion {
  @PrimaryGeneratedColumn('uuid') id?: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar', nullable: true }) organizationId?: string | null
  @Column({ type: 'varchar', nullable: true }) workspaceId?: string | null
  @Column({ type: 'varchar', nullable: true }) projectId?: string | null
  @Column({ type: 'varchar' }) quotationId!: string
  @Column({ type: 'int' }) versionNumber!: number
  @Column({ type: 'varchar' }) source!: XpertQuotationWorkbookVersionSource
  @Column({ type: 'text' }) workspaceFilePath!: string
  @Column({ type: 'text', nullable: true }) workspaceFileUrl?: string | null
  @Column({ type: 'varchar' }) workspaceCatalog!: WorkspaceFileCatalog
  @Column({ type: 'varchar' }) workspaceScopeId!: string
  @Column({ type: 'varchar' }) fileName!: string
  @Column({ type: 'varchar' }) mimeType!: string
  @Column({ type: 'int' }) size!: number
  @Column({ type: 'varchar' }) checksum!: string
  @Column({ type: 'varchar', nullable: true }) sourceVersionId?: string | null
  @Column({ type: 'varchar', nullable: true }) idempotencyKey?: string | null
  @Column({ type: 'text', nullable: true }) changeSummary?: string | null
  @Column({ type: 'jsonb' }) snapshot!: object
  @Column({ type: 'varchar', nullable: true }) createdById?: string | null
  @CreateDateColumn({ type: 'timestamptz' }) createdAt?: Date
}
