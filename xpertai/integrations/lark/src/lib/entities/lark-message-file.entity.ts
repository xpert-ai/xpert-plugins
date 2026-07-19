import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	PrimaryGeneratedColumn,
	UpdateDateColumn
} from 'typeorm'
import type { WorkspaceFileCatalog } from '@xpert-ai/plugin-sdk'
import type { LarkMessageResourceType } from '../types.js'

export type LarkMessageFileStatus = 'pending' | 'processing' | 'ready' | 'failed'

@Entity(LarkMessageFileEntity.tableName)
@Index('plugin_lark_message_file_resource_uq', ['messageLogId', 'resourceKey'], { unique: true })
@Index('plugin_lark_message_file_log_idx', ['messageLogId'])
@Index('plugin_lark_message_file_asset_idx', ['fileAssetId'])
@Index('plugin_lark_message_file_history_idx', ['scopeKey', 'xpertId', 'createdAt'])
@Index('plugin_lark_message_file_tenant_org_idx', ['tenantId', 'organizationId'])
export class LarkMessageFileEntity {
	static readonly tableName = 'plugin_lark_message_file'

	@PrimaryGeneratedColumn('uuid')
	id: string

	@Column({ length: 36 })
	messageLogId: string

	@Column({ length: 36 })
	integrationId: string

	@Column({ length: 512 })
	scopeKey: string

	@Column({ nullable: true, length: 36 })
	xpertId?: string | null

	@Column({ nullable: true, length: 128 })
	messageId?: string | null

	@Column({ length: 512 })
	resourceKey: string

	@Column({ length: 16 })
	resourceType: LarkMessageResourceType

	@Column({ nullable: true, length: 36 })
	fileAssetId?: string | null

	@Column({ nullable: true, length: 36 })
	fileId?: string | null

	@Column({ nullable: true, length: 36 })
	storageFileId?: string | null

	@Column({ nullable: true, length: 1024 })
	workspacePath?: string | null

	@Column({ nullable: true, length: 1024 })
	filePath?: string | null

	@Column({ nullable: true, length: 2048 })
	fileUrl?: string | null

	@Column({ nullable: true, length: 255 })
	originalName?: string | null

	@Column({ nullable: true, length: 255 })
	mimeType?: string | null

	@Column({ type: 'integer', nullable: true })
	size?: number | null

	@Column({ length: 24, default: 'pending' })
	status: LarkMessageFileStatus

	@Column({ nullable: true, length: 1024 })
	error?: string | null

	@Column({ nullable: true, length: 24 })
	workspaceCatalog?: WorkspaceFileCatalog | null

	@Column({ nullable: true, length: 36 })
	workspaceScopeId?: string | null

	@Column({ nullable: true, length: 36 })
	workspaceUserId?: string | null

	@Column({ type: 'boolean', nullable: true })
	workspaceIsolateByUser?: boolean | null

	@Column({ nullable: true, length: 36 })
	tenantId?: string | null

	@Column({ nullable: true, length: 36 })
	organizationId?: string | null

	@Column({ nullable: true, length: 36 })
	createdById?: string | null

	@Column({ nullable: true, length: 36 })
	updatedById?: string | null

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt: Date

	@UpdateDateColumn({ type: 'timestamptz' })
	updatedAt: Date
}
