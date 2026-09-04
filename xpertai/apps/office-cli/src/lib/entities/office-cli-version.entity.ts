import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import { officeCliTable } from '../constants.js'
import type { OfficeCliVersionSource, OfficeCliWorkspaceCatalog } from '../types.js'

@Entity(officeCliTable('version'))
@Index(['tenantId', 'organizationId', 'documentId', 'versionNumber'])
@Index(['documentId', 'versionNumber'], { unique: true })
export class OfficeCliVersion {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  tenantId?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  organizationId?: string

  @Column({ type: 'varchar', nullable: true })
  workspaceId?: string

  // Keep the persisted identifier type compatible with OfficeCLI 0.2.x tables.
  @Column({ type: 'varchar', nullable: true, update: false })
  projectId?: string

  @Column({ type: 'varchar' })
  documentId!: string

  @Column({ type: 'int' })
  versionNumber!: number

  @Column({ type: 'varchar' })
  source!: OfficeCliVersionSource

  @Column({ type: 'text' })
  workspaceFilePath!: string

  @Column({ type: 'text', nullable: true })
  workspaceFileUrl?: string

  @Column({ type: 'varchar' })
  workspaceCatalog!: OfficeCliWorkspaceCatalog

  @Column({ type: 'varchar' })
  workspaceScopeId!: string

  @Column({ type: 'varchar' })
  fileName!: string

  @Column({ type: 'varchar' })
  mimeType!: string

  @Column({ type: 'int' })
  size!: number

  @Column({ type: 'varchar' })
  checksum!: string

  @Column({ type: 'varchar', nullable: true })
  command?: string

  @Column({ type: 'jsonb', nullable: true })
  commandArgs?: string[]

  @Column({ type: 'varchar', nullable: true })
  sourceVersionId?: string

  @Column({ type: 'text', nullable: true })
  changeSummary?: string

  @Column({ type: 'varchar', nullable: true })
  createdById?: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date
}
