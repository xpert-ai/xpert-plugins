import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { ArtifactAccessMode, ArtifactLinkVersionMode, WorkspacePortableFileReference } from '@xpert-ai/plugin-sdk'
import { canvasTable } from '../canvas-artifact-namespace.js'
import type { CanvasJsonObject } from '../types.js'

export type CanvasArtifactExportStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

@Entity(canvasTable('artifact_export'))
@Index(['tenantId', 'organizationId', 'documentId', 'createdAt'])
@Index(['tenantId', 'organizationId', 'status'])
export class CanvasArtifactExport {
  @PrimaryGeneratedColumn('uuid') id?: string
  @Index() @Column({ type: 'varchar', nullable: true }) tenantId?: string
  @Index() @Column({ type: 'varchar', nullable: true }) organizationId?: string
  @Column({ type: 'varchar', nullable: true }) workspaceId?: string
  @Column({ type: 'varchar', nullable: true }) projectId?: string
  @Column({ type: 'varchar', nullable: true }) userId?: string
  @Column({ type: 'varchar', nullable: true }) assistantId?: string
  @Index() @Column({ type: 'varchar' }) documentId!: string
  @Column({ type: 'varchar', default: 'queued' }) status!: CanvasArtifactExportStatus
  @Column({ type: 'varchar', default: 'queued' }) stage!: string
  @Column({ type: 'varchar', nullable: true }) queueJobId?: string | null
  @Column({ type: 'varchar', nullable: true }) sandboxJobId?: string | null
  @Column({ type: 'int' }) revision!: number
  @Column({ type: 'varchar', length: 64 }) snapshotChecksum!: string
  @Column({ type: 'varchar' }) pageId!: string
  @Column({ type: 'varchar', nullable: true }) pageName?: string | null
  @Column({ type: 'varchar' }) accessMode!: ArtifactAccessMode
  @Column({ type: 'varchar' }) targetMode!: ArtifactLinkVersionMode
  @Column({ type: 'boolean', default: false }) userConfirmedPublicLink!: boolean
  @Column({ type: 'jsonb', nullable: true }) inputFileReference?: WorkspacePortableFileReference | null
  @Column({ type: 'int', nullable: true }) inputSize?: number | null
  @Column({ type: 'varchar', length: 64, nullable: true }) inputSha256?: string | null
  @Column({ type: 'jsonb', nullable: true }) outputFileReference?: WorkspacePortableFileReference | null
  @Column({ type: 'int', nullable: true }) outputSize?: number | null
  @Column({ type: 'varchar', length: 64, nullable: true }) outputSha256?: string | null
  @Column({ type: 'varchar', nullable: true }) outputMimeType?: string | null
  @Column({ type: 'varchar', nullable: true }) artifactId?: string | null
  @Column({ type: 'varchar', nullable: true }) artifactVersionId?: string | null
  @Column({ type: 'varchar', nullable: true }) artifactLinkId?: string | null
  @Column({ type: 'text', nullable: true }) publicUrl?: string | null
  @Column({ type: 'varchar', nullable: true }) errorCode?: string | null
  @Column({ type: 'text', nullable: true }) errorMessage?: string | null
  @Column({ type: 'jsonb', nullable: true }) report?: CanvasJsonObject | null
  @CreateDateColumn({ type: 'timestamptz' }) createdAt?: Date
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt?: Date
}
