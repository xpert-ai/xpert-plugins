import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { WorkspacePortableFileReference } from '@xpert-ai/plugin-sdk'

@Entity('plugin_cut_export')
@Index(['tenantId', 'organizationId', 'cutProjectId', 'createdAt'])
@Index(['tenantId', 'organizationId', 'analysisJobId'])
export class CutExport {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Column({ type: 'varchar' })
  tenantId!: string

  @Column({ type: 'varchar', nullable: true })
  organizationId?: string | null

  @Column({ type: 'varchar', nullable: true })
  workspaceId?: string | null

  @Column({ type: 'varchar', nullable: true })
  platformProjectId?: string | null

  @Column({ type: 'varchar' })
  cutProjectId!: string

  @Column({ type: 'varchar', nullable: true })
  analysisJobId?: string | null

  @Column({ type: 'int', nullable: true })
  sourceRevision?: number | null

  @Column({ type: 'varchar', default: 'mp4' })
  kind!: 'mp4' | 'webm'

  @Column({ type: 'varchar' })
  mimeType!: string

  @Column({ type: 'int' })
  size!: number

  @Column({ type: 'varchar', length: 64 })
  checksum!: string

  @Column({ type: 'jsonb' })
  fileReference!: WorkspacePortableFileReference

  @Column({ type: 'text', nullable: true })
  fileUrl?: string | null

  @Column({ type: 'text' })
  changeSummary!: string

  @Column({ type: 'varchar', nullable: true })
  renderer?: string | null

  @Column({ type: 'jsonb', nullable: true })
  report?: Record<string, unknown> | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date
}
