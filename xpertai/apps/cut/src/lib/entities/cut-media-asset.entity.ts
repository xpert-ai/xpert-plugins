import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { WorkspacePortableFileReference } from '@xpert-ai/plugin-sdk'
import type { CutTranscriptionAudioProxy } from '../types.js'

@Entity('plugin_cut_media_asset')
@Index(['tenantId', 'organizationId', 'cutProjectId', 'createdAt'])
export class CutMediaAsset {
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
  originalName!: string

  @Column({ type: 'varchar' })
  mimeType!: string

  @Column({ type: 'int' })
  size!: number

  @Column({ type: 'varchar', length: 64 })
  checksum!: string

  @Column({ type: 'jsonb' })
  fileReference!: WorkspacePortableFileReference

  @Column({ type: 'text', nullable: true })
  previewUrl?: string | null

  @Column({ type: 'float', nullable: true })
  duration?: number | null

  @Column({ type: 'float', nullable: true })
  containerDuration?: number | null

  @Column({ type: 'float', nullable: true })
  videoDuration?: number | null

  @Column({ type: 'float', nullable: true })
  audioDuration?: number | null

  @Column({ type: 'jsonb', nullable: true })
  transcriptionAudioProxy?: CutTranscriptionAudioProxy | null

  @Column({ type: 'int', nullable: true })
  codedWidth?: number | null

  @Column({ type: 'int', nullable: true })
  codedHeight?: number | null

  @Column({ type: 'int', nullable: true })
  displayWidth?: number | null

  @Column({ type: 'int', nullable: true })
  displayHeight?: number | null

  @Column({ type: 'int', nullable: true })
  rotationDegrees?: number | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date
}
