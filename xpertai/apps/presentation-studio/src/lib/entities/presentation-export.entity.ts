import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { presentationStudioTable } from '../constants.js'
import type { PresentationAssetReference, PresentationExportKind, PresentationExportStatus, PresentationJsonObject } from '../types.js'

@Entity(presentationStudioTable('export'))
@Index(['tenantId', 'organizationId', 'deckId', 'createdAt'])
@Index(['tenantId', 'organizationId', 'status'])
export class PresentationExport {
  @PrimaryGeneratedColumn('uuid') id?: string
  @Index() @Column({ type: 'varchar', nullable: true }) tenantId?: string
  @Index() @Column({ type: 'varchar', nullable: true }) organizationId?: string
  @Column({ type: 'varchar', nullable: true }) workspaceId?: string
  @Column({ type: 'varchar', nullable: true }) projectId?: string
  @Column({ type: 'varchar', nullable: true }) userId?: string
  @Column({ type: 'varchar' }) deckId!: string
  @Column({ type: 'varchar' }) versionId!: string
  @Column({ type: 'varchar' }) kind!: PresentationExportKind
  @Column({ type: 'varchar', default: 'queued' }) status!: PresentationExportStatus
  @Column({ type: 'varchar', nullable: true }) jobId?: string
  @Column({ type: 'int', default: 0 }) progress!: number
  @Column({ type: 'varchar', nullable: true }) stage?: string
  @Column({ type: 'varchar' }) checksum!: string
  @Column({ type: 'varchar', nullable: true }) fileName?: string
  @Column({ type: 'varchar', nullable: true }) mimeType?: string
  @Column({ type: 'int', nullable: true }) size?: number
  @Column({ type: 'json', nullable: true }) fileReference?: PresentationAssetReference
  @Column({ type: 'varchar', nullable: true }) artifactId?: string
  @Column({ type: 'varchar', nullable: true }) artifactVersionId?: string
  @Column({ type: 'varchar', nullable: true }) artifactLinkId?: string
  @Column({ type: 'varchar', nullable: true }) artifactLinkVersionMode?: 'latest' | 'version'
  @Column({ type: 'varchar', nullable: true }) artifactLinkAccessMode?: string
  @Column({ type: 'text', nullable: true }) artifactPublicUrl?: string
  @Column({ type: 'timestamptz', nullable: true }) artifactSharedAt?: Date
  @Column({ type: 'json', nullable: true }) report?: PresentationJsonObject
  @Column({ type: 'text', nullable: true }) errorMessage?: string
  @Column({ type: 'varchar', nullable: true }) createdById?: string
  @CreateDateColumn({ type: 'timestamptz' }) createdAt?: Date
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt?: Date
}
