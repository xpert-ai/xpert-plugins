import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { PLUGIN_NAMESPACE } from './constants.js'
// Historical entity retained for schema compatibility; no AI task endpoints remain.
type ProposalStatus = 'pending' | 'running' | 'ready' | 'applied' | 'cancelled' | 'failed' | 'expired'

export abstract class OwnedRecord {
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar' }) organizationId!: string
  @Column({ type: 'varchar' }) workspaceId!: string
  @Column({ type: 'varchar' }) userId!: string
  @Column({ type: 'varchar' }) xpertId!: string
}

@Entity(pluginArtifactTableName(PLUGIN_NAMESPACE, 'workspace_record'))
@Index(['tenantId', 'organizationId', 'workspaceId', 'userId', 'xpertId', 'kind'], { unique: true })
export class WorkspaceRecord extends OwnedRecord {
  @PrimaryColumn({ type: 'varchar', length: 64 }) id!: string
  @Column({ type: 'varchar' }) kind!: 'layout' | 'buffers' | 'scratchpad'
  @Column({ type: 'int' }) revision!: number
  @Column({ type: 'text' }) payloadJson!: string
  @Column({ type: 'varchar' }) updatedAt!: string
}

@Entity(pluginArtifactTableName(PLUGIN_NAMESPACE, 'layout_proposal'))
@Index(['tenantId', 'organizationId', 'workspaceId', 'userId', 'xpertId'])
export class LayoutProposal extends OwnedRecord {
  @PrimaryColumn({ type: 'varchar', length: 36 }) id!: string
  @Column({ type: 'int' }) revision!: number
  @Column({ type: 'int' }) baseRevision!: number
  @Column({ type: 'varchar' }) status!: ProposalStatus
  @Column({ type: 'text' }) intent!: string
  @Column({ type: 'text' }) baseStateJson!: string
  @Column({ type: 'text', nullable: true }) previewStateJson!: string | null
  @Column({ type: 'text', nullable: true }) operationsJson!: string | null
  @Column({ type: 'text', nullable: true }) summary!: string | null
  @Column({ type: 'varchar', nullable: true }) failureCode!: string | null
  @Column({ type: 'varchar' }) deadline!: string
  @Column({ type: 'varchar' }) createdAt!: string
  @Column({ type: 'varchar' }) updatedAt!: string
}
