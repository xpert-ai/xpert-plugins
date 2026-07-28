import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm'
import type { CutJsonObject } from '../types.js'

@Entity('plugin_cut_story_handoff_receipt')
@Index(['tenantId', 'organizationId', 'handoffId'], { unique: true })
@Index(['tenantId', 'organizationId', 'sourceProjectId', 'sourceRevision'])
export class CutStoryHandoffReceipt {
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

  @Column({ type: 'uuid' })
  handoffId!: string

  @Column({ type: 'uuid' })
  sourceProjectId!: string

  @Column({ type: 'int' })
  sourceRevision!: number

  @Column({ type: 'varchar', length: 16 })
  contractVersion!: '1.0'

  @Column({ type: 'varchar', length: 24 })
  mode!: 'create' | 'proposal'

  @Column({ type: 'varchar', length: 24, default: 'processing' })
  status!: 'processing' | 'succeeded' | 'failed'

  @Column({ type: 'varchar', length: 64 })
  contractChecksum!: string

  @Column({ type: 'uuid', nullable: true })
  cutProjectId?: string | null

  @Column({ type: 'int', nullable: true })
  cutProjectRevision?: number | null

  @Column({ type: 'uuid', nullable: true })
  cutProposalId?: string | null

  @Column({ type: 'jsonb', default: () => "'{}'" })
  mediaAssetIds!: CutJsonObject

  @Column({ type: 'jsonb', default: () => "'{}'" })
  evidenceSegmentIds!: CutJsonObject

  @Column({ type: 'text', nullable: true })
  errorMessage?: string | null

  @Column({ type: 'varchar', length: 240 })
  changeSummary!: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
