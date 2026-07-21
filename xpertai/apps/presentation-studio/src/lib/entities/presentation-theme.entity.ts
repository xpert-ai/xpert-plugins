import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { presentationStudioTable } from '../constants.js'
import type {
  PresentationAssetReference,
  PresentationJsonObject,
  PresentationThemeSourceType,
  PresentationThemeStatus
} from '../types.js'

@Entity(presentationStudioTable('theme'))
@Index(['tenantId', 'organizationId', 'workspaceId', 'projectId', 'assistantId', 'themeKey'], { unique: true })
@Index(['tenantId', 'organizationId', 'workspaceId', 'projectId', 'assistantId', 'status', 'updatedAt'])
export class PresentationTheme {
  @PrimaryGeneratedColumn('uuid') id?: string
  @Index() @Column({ type: 'varchar', nullable: true }) tenantId?: string
  @Index() @Column({ type: 'varchar', nullable: true }) organizationId?: string
  @Column({ type: 'varchar', nullable: true }) workspaceId?: string
  @Column({ type: 'varchar', nullable: true }) projectId?: string
  @Column({ type: 'varchar', nullable: true }) assistantId?: string
  @Column({ type: 'varchar' }) themeKey!: string
  @Column({ type: 'varchar' }) name!: string
  @Column({ type: 'varchar' }) sourceType!: PresentationThemeSourceType
  @Column({ type: 'varchar', default: 'prepared' }) status!: PresentationThemeStatus
  @Column({ type: 'varchar', nullable: true }) adapterMode?: string
  @Column({ type: 'json' }) sourceReference!: PresentationAssetReference
  @Column({ type: 'json', nullable: true }) packageReference?: PresentationAssetReference
  @Column({ type: 'varchar', nullable: true }) packageSha256?: string
  @Column({ type: 'int', nullable: true }) packageSize?: number
  @Column({ type: 'json', nullable: true }) runtimeMetadata?: PresentationJsonObject
  @Column({ type: 'json', nullable: true }) qualityReport?: PresentationJsonObject
  @Column({ type: 'text', nullable: true }) failureReason?: string
  @Column({ type: 'varchar', nullable: true }) createdById?: string
  @CreateDateColumn({ type: 'timestamptz' }) createdAt?: Date
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt?: Date
}
