import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { ArtifactAccessMode, ArtifactLinkVersionMode, WorkspacePortableFileReference } from '@xpert-ai/plugin-sdk'

export type ExcalidrawArtifactPublicationStatus = 'active' | 'superseded' | 'revoked'

@Entity('plugin_excalidraw_artifact_publication')
@Index(['tenantId', 'organizationId', 'drawingId', 'createdAt'])
@Index(['tenantId', 'organizationId', 'drawingId', 'checksum'])
export class ExcalidrawArtifactPublication {
  @PrimaryGeneratedColumn('uuid') id?: string
  @Index() @Column({ type: 'varchar', nullable: true }) tenantId?: string
  @Index() @Column({ type: 'varchar', nullable: true }) organizationId?: string
  @Column({ type: 'varchar', nullable: true }) workspaceId?: string
  @Column({ type: 'varchar', nullable: true }) projectId?: string
  @Column({ type: 'varchar', nullable: true }) userId?: string
  @Index() @Column({ type: 'varchar' }) drawingId!: string
  @Column({ type: 'int' }) collaborationSequence!: number
  @Column({ type: 'varchar', nullable: true }) sourceVersionId?: string
  @Column({ type: 'varchar' }) checksum!: string
  @Column({ type: 'varchar' }) fileName!: string
  @Column({ type: 'varchar', default: 'text/html' }) mimeType!: string
  @Column({ type: 'int' }) size!: number
  @Column({ type: 'varchar' }) sha256!: string
  @Column({ type: 'jsonb' }) workspaceFileReference!: WorkspacePortableFileReference
  @Column({ type: 'varchar' }) artifactId!: string
  @Column({ type: 'varchar' }) artifactVersionId!: string
  @Column({ type: 'varchar', nullable: true }) artifactLinkId?: string
  @Column({ type: 'varchar', nullable: true }) artifactLinkVersionMode?: ArtifactLinkVersionMode
  @Column({ type: 'varchar', nullable: true }) artifactLinkAccessMode?: ArtifactAccessMode
  @Column({ type: 'boolean', default: true }) allowDownload!: boolean
  @Column({ type: 'text', nullable: true }) publicUrl?: string
  @Column({ type: 'varchar', default: 'active' }) status!: ExcalidrawArtifactPublicationStatus
  @Column({ type: 'timestamptz', nullable: true }) sharedAt?: Date
  @Column({ type: 'varchar', nullable: true }) createdById?: string
  @CreateDateColumn({ type: 'timestamptz' }) createdAt?: Date
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt?: Date
}
