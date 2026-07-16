import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { CutTranscriptSource } from '../types.js'

@Entity('plugin_cut_transcript')
@Index(['tenantId', 'organizationId', 'cutProjectId', 'createdAt'])
@Index(['tenantId', 'organizationId', 'cutProjectId', 'jobId'])
export class CutTranscript {
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
  jobId?: string | null

  @Column({ type: 'varchar', nullable: true })
  mediaAssetId?: string | null

  @Column({ type: 'varchar' })
  source!: CutTranscriptSource

  @Column({ type: 'varchar' })
  language!: string

  @Column({ type: 'varchar', nullable: true })
  model?: string | null

  @Column({ type: 'varchar', nullable: true })
  sourceFormat?: string | null

  @Column({ type: 'float', nullable: true })
  duration?: number | null

  @Column({ type: 'int', default: 0 })
  segmentCount!: number

  @Column({ type: 'int' })
  inputRevision!: number

  @Column({ type: 'varchar', nullable: true })
  createdById?: string | null

  @Column({ type: 'varchar', nullable: true })
  assistantId?: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date
}
