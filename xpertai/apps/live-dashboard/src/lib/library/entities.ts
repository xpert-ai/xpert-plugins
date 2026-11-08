import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { WorkspacePortableFileReference } from '@xpert-ai/plugin-sdk'
import { libraryTable, type ResourceDocumentV2, type AssetDescriptor } from './resource-contract'

/** @beta Library V2 tables are additive. Existing V1 releases and Dashboard versions are not rewritten. */
export class LibraryOwnedRecord {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar' }) organizationId!: string
  @Column({ type: 'varchar' }) ownerId!: string
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date
}
@Entity(libraryTable('resource_v2'))
@Index(['tenantId', 'organizationId', 'ownerId', 'logicalId'], { unique: true })
export class LibraryResourceRecord extends LibraryOwnedRecord {
  @Column({ type: 'uuid' }) logicalId!: string
  @Column({ type: 'varchar' }) kind!: ResourceDocumentV2['kind']
  @Column({ type: 'uuid', nullable: true }) currentVersionId!: string | null
}
@Entity(libraryTable('resource_draft_v2'))
@Index(['tenantId', 'organizationId', 'ownerId', 'resourceId'], { unique: true })
export class LibraryDraftRecord extends LibraryOwnedRecord {
  @Column({ type: 'uuid' }) resourceId!: string
  @Column({ type: 'integer' }) revision!: number
  @Column({ type: 'jsonb' }) document!: ResourceDocumentV2
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date
}
@Entity(libraryTable('resource_version_v2'))
@Index(['tenantId', 'organizationId', 'ownerId', 'logicalId', 'version'], { unique: true })
@Index(['tenantId', 'organizationId', 'ownerId', 'state', 'createdAt'])
export class LibraryVersionRecord extends LibraryOwnedRecord {
  @Column({ type: 'uuid' }) resourceId!: string
  @Column({ type: 'uuid' }) logicalId!: string
  @Column({ type: 'varchar' }) version!: string
  @Column({ type: 'varchar' }) kind!: ResourceDocumentV2['kind']
  @Column({ type: 'varchar' }) title!: string
  @Column({ type: 'text' }) description!: string
  @Column({ type: 'jsonb' }) categories!: string[]
  @Column({ type: 'jsonb' }) catalogMetadata!: Pick<ResourceDocumentV2, 'locale' | 'translations' | 'tags' | 'license' | 'presentation'> & {
    taskData?: { mode: 'demo' | 'web' | 'external'; tools: string[] }
  }
  @Column({ type: 'jsonb' }) document!: ResourceDocumentV2
  @Column({ type: 'varchar' }) sha256!: string
  @Column({ type: 'varchar', default: 'staging' }) state!: 'staging' | 'ready'
  @Column({ type: 'uuid', nullable: true }) jobId!: string | null
}
@Entity(libraryTable('resource_publication_v2'))
@Index(['tenantId', 'organizationId', 'ownerId', 'versionId'], { unique: true })
@Index(['active', 'versionId'])
export class LibraryPublicationRecord extends LibraryOwnedRecord {
  @Column({ type: 'uuid' }) versionId!: string
  @Column({ type: 'boolean', default: false }) active!: boolean
}
@Entity(libraryTable('resource_file_v2'))
@Index(['tenantId', 'organizationId', 'ownerId', 'sha256'], { unique: true })
export class LibraryFileRecord extends LibraryOwnedRecord {
  @Column({ type: 'varchar' }) sha256!: string
  @Column({ type: 'integer' }) size!: number
  @Column({ type: 'varchar' }) mimeType!: AssetDescriptor['mimeType']
  @Column({ type: 'varchar' }) fileName!: string
  @Column({ type: 'uuid', nullable: true }) artifactId!: string | null
  @Column({ type: 'uuid', nullable: true }) artifactVersionId!: string | null
  @Column({ type: 'varchar', default: 'pending' }) state!: 'pending' | 'ready'
}
@Entity(libraryTable('resource_transfer_v2'))
@Index(['tenantId', 'organizationId', 'ownerId', 'requestId'], { unique: true })
export class LibraryTransferRecord extends LibraryOwnedRecord {
  @Column({ type: 'uuid' }) requestId!: string
  @Column({ type: 'varchar' }) sha256!: string
  @Column({ type: 'jsonb' }) file!: WorkspacePortableFileReference
  @Column({ type: 'varchar' }) mode!: 'reuse' | 'copy'
  @Column({ type: 'jsonb' }) identityMap!: Record<string, string>
  @Column({ type: 'jsonb', default: [] }) releaseIds!: string[]
  @Column({ type: 'varchar', default: 'prepared' }) status!: 'prepared' | 'running' | 'failed' | 'complete' | 'cancelled'
  @Column({ type: 'uuid', nullable: true }) leaseToken!: string | null
  @Column({ type: 'timestamptz', nullable: true }) leaseUntil!: Date | null
  @Column({ type: 'varchar', nullable: true }) failureCode!: string | null
  @Column({ type: 'timestamptz', nullable: true }) filesClearedAt!: Date | null
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date
}
export const LIBRARY_V2_ENTITIES = [LibraryResourceRecord, LibraryDraftRecord, LibraryVersionRecord,
  LibraryPublicationRecord, LibraryFileRecord, LibraryTransferRecord]
