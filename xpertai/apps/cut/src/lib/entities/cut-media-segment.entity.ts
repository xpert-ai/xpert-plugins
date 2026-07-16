import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { CutJsonValue, CutMediaEvidenceType } from '../types.js'

@Entity('plugin_cut_media_segment')
@Index(['tenantId', 'organizationId', 'cutProjectId', 'mediaAssetId', 'evidenceType', 'start'])
@Index(['tenantId', 'organizationId', 'cutProjectId', 'analysisJobId'])
export class CutMediaSegment {
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

  @Column({ type: 'varchar' })
  analysisJobId!: string

  @Column({ type: 'varchar' })
  mediaAssetId!: string

  @Column({ type: 'varchar' })
  evidenceType!: Exclude<CutMediaEvidenceType, 'transcript'>

  @Column({ type: 'float' })
  start!: number

  @Column({ type: 'float' })
  end!: number

  @Column({ type: 'varchar' })
  label!: string

  @Column({ type: 'text', nullable: true })
  text?: string | null

  @Column({ type: 'float', nullable: true })
  confidence?: number | null

  @Column({ type: 'float', nullable: true })
  thumbnailTime?: number | null

  @Column({ type: 'jsonb', nullable: true })
  metadata?: CutJsonValue | null

  @Column({ type: 'int' })
  inputRevision!: number

  @Column({ type: 'varchar', nullable: true })
  createdById?: string | null

  @Column({ type: 'varchar', nullable: true })
  assistantId?: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date
}
