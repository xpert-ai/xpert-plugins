import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { CutCaptionDraftStatus, CutCaptionItem, CutCaptionRules } from '../types.js'

@Entity('plugin_cut_caption_draft')
@Index(['tenantId', 'organizationId', 'cutProjectId', 'status', 'updatedAt'])
export class CutCaptionDraft {
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
  transcriptId!: string

  @Column({ type: 'int' })
  sourceRevision!: number

  @Column({ type: 'varchar', default: 'draft' })
  status!: CutCaptionDraftStatus

  @Column({ type: 'int', default: 1 })
  revision!: number

  @Column({ type: 'varchar' })
  language!: string

  @Column({ type: 'varchar', nullable: true })
  targetTrackId?: string | null

  @Column({ type: 'jsonb' })
  captions!: CutCaptionItem[]

  @Column({ type: 'jsonb', nullable: true })
  rules?: CutCaptionRules | null

  @Column({ type: 'int', nullable: true })
  committedRevision?: number | null

  @Column({ type: 'varchar', nullable: true })
  createdById?: string | null

  @Column({ type: 'varchar', nullable: true })
  assistantId?: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
