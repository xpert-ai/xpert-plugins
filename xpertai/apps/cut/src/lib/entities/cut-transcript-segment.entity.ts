import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { CutTranscriptWord } from '../types.js'

@Entity('plugin_cut_transcript_segment')
@Index(['tenantId', 'organizationId', 'cutProjectId', 'transcriptId', 'sequence'], { unique: true })
@Index(['tenantId', 'organizationId', 'cutProjectId', 'start'])
export class CutTranscriptSegment {
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
  sequence!: number

  @Column({ type: 'float' })
  start!: number

  @Column({ type: 'float' })
  end!: number

  @Column({ type: 'text' })
  text!: string

  @Column({ type: 'float', nullable: true })
  confidence?: number | null

  @Column({ type: 'varchar', nullable: true })
  speaker?: string | null

  @Column({ type: 'jsonb', nullable: true })
  words?: CutTranscriptWord[] | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date
}
