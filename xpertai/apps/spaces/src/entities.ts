import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { WorkspacePortableFileReference } from '@xpert-ai/plugin-sdk'
import type { ItemKind } from './domain.js'

export abstract class ScopedEntity {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ type: 'uuid' }) tenantId!: string
  @Column({ type: 'uuid' }) organizationId!: string
  @CreateDateColumn() createdAt!: Date
  @UpdateDateColumn() updatedAt!: Date
}
@Entity('plugin_spaces_space')
@Index(['tenantId', 'organizationId'])
@Index('IDX_space_project', ['tenantId', 'organizationId', 'projectId'], { unique: true })
export class Space extends ScopedEntity {
  /** Storage and membership belong to this Project; Space only adds content metadata. */
  @Column({ type: 'uuid' }) projectId!: string
  @Column({ type: 'uuid', nullable: true }) knowledgebaseId!: string | null
  @Column({ type: 'varchar', length: 200 }) title!: string
  @Column({ type: 'uuid' }) ownerId!: string
  @Column({ type: 'varchar', length: 20 }) visibility!: 'personal' | 'team'
  @Column({ type: 'int', default: 1 }) version!: number
  @Column({ type: 'boolean', default: false }) deleted!: boolean
}
@Entity('plugin_spaces_item')
@Index(['tenantId', 'organizationId', 'spaceId'])
@Index('IDX_space_page_parent', ['tenantId', 'organizationId', 'spaceId', 'parentPageId'])
@Index('IDX_space_item_active_path', ['spaceId', 'filePath'], { unique: true, where: '"deleted" = false AND "filePath" IS NOT NULL' })
export class SpaceItem extends ScopedEntity {
  /** Immutable import receipt; content stays in the project file. A copy does not inherit remote ACLs. */
  @Column({ type: 'jsonb', nullable: true }) importOrigin!: {
    provider: string; documentId: string; url: string | null; revision: string; contentHash: string;
    format: 'text/plain'; importedAt: string; warnings: string[]; bindingId: string; requestHash: string
  } | null
  /** Logical page parent; parentId continues to mean the physical file folder. */
  @Column({ type: 'uuid', nullable: true }) parentPageId!: string | null
  /** Original request title makes a retried create idempotent even after a later rename. */
  @Column({ type: 'varchar', length: 200, nullable: true }) childRequestTitle!: string | null
  @Column({ type: 'text', nullable: true }) filePath!: string | null
  @Column({ type: 'varchar', length: 64, nullable: true }) fileHash!: string | null
  @Column({ type: 'varchar', length: 24, default: 'pending' }) syncStatus!: 'pending' | 'ready' | 'conflict' | 'failed'
  @Column({ type: 'text', nullable: true }) syncError!: string | null
  @Column({ type: 'uuid', nullable: true }) knowledgeDocumentId!: string | null
  @Column({ type: 'varchar', length: 64, nullable: true }) indexedHash!: string | null
  @Column({ type: 'varchar', length: 24, default: 'pending' }) indexStatus!: 'pending' | 'processing' | 'ready' | 'failed'
  @Column({ type: 'text', nullable: true }) indexError!: string | null
  @Column({ type: 'uuid' }) spaceId!: string
  @Column({ type: 'uuid', nullable: true }) parentId!: string | null
  @Column({ type: 'uuid' }) createdById!: string
  @Column({ type: 'varchar', length: 200 }) title!: string
  @Column({ type: 'varchar', length: 20 }) kind!: ItemKind
  @Column({ type: 'int', default: 1 }) version!: number
  @Column({ type: 'boolean', default: false }) deleted!: boolean
  @Column({ type: 'int', default: -1 }) projectedSequence!: number
  @Column({ type: 'text', default: '' }) markdown!: string
  @Column({ type: 'varchar', length: 100, nullable: true }) editorKey!: string | null
  @Column({ type: 'uuid', nullable: true }) currentFileVersionId!: string | null
  @Column({ type: 'jsonb', nullable: true }) file!: WorkspacePortableFileReference | null
  @Column({ type: 'uuid', nullable: true }) artifactId!: string | null
  @Column({ type: 'uuid', nullable: true }) artifactVersionId!: string | null
}
@Entity('plugin_spaces_file_version')
@Index(['tenantId', 'organizationId', 'itemId'])
export class SpaceFileVersion extends ScopedEntity {
  @Column({ type: 'uuid' }) itemId!: string
  @Column({ type: 'uuid' }) createdById!: string
  @Column({ type: 'jsonb' }) reference!: WorkspacePortableFileReference
  @Column({ type: 'uuid', nullable: true }) revisionId!: string | null
  @Column({ type: 'varchar', length: 64 }) sha256!: string
}
/** Organizational placement only. Native resources keep one authoritative provider and
 * stable project bundle; moving a library entry never duplicates business content. */
@Entity('plugin_spaces_resource_placement')
@Index('IDX_space_resource_placement', ['tenantId', 'organizationId', 'spaceId', 'contentId'], { unique: true })
export class SpaceResourcePlacement extends ScopedEntity {
  @Column({ type: 'uuid' }) spaceId!: string
  @Column({ type: 'uuid' }) contentId!: string
  @Column({ type: 'uuid', nullable: true }) parentId!: string | null
  @Column({ type: 'int', default: 1 }) version!: number
}
/** Disposable revision-bound knowledge state, never a source body or permission cache. */
@Entity('plugin_spaces_content_index')
@Index('IDX_space_content_index', ['tenantId', 'organizationId', 'spaceId', 'contentId'], { unique: true })
export class SpaceContentIndex extends ScopedEntity {
  @Column({ type: 'uuid' }) spaceId!: string
  @Column({ type: 'uuid' }) contentId!: string
  @Column({ type: 'varchar', length: 256, nullable: true }) revision!: string | null
  @Column({ type: 'int', nullable: true }) bindingRevision!: number | null
  @Column({ type: 'varchar', length: 24, default: 'pending' }) status!: 'pending' | 'processing' | 'ready' | 'failed'
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" }) documents!: Array<{ id: string; anchor: { kind: string; id: string } }>
}
export const entities = [Space, SpaceItem, SpaceFileVersion, SpaceResourcePlacement, SpaceContentIndex]
