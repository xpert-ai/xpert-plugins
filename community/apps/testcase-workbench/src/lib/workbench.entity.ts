import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { PLUGIN_NAMESPACE } from './constants.js'

// Ownership columns come only from the trusted host context. Every read and write is
// filtered by the full scope so one tenant/user/assistant cannot touch another's rows.
export abstract class OwnedRecord {
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar' }) organizationId!: string
  @Column({ type: 'varchar' }) workspaceId!: string
  @Column({ type: 'varchar' }) userId!: string
  @Column({ type: 'varchar' }) xpertId!: string
}

// One JSON document per scope holds requirements and test cases with a single
// optimistic-concurrency revision. Keeping the whole workbench in one row makes a
// stale client save fail loudly instead of silently dropping another change.
@Entity(pluginArtifactTableName(PLUGIN_NAMESPACE, 'workbench_record'))
@Index(['tenantId', 'organizationId', 'workspaceId', 'userId', 'xpertId'], { unique: true })
export class WorkbenchRecord extends OwnedRecord {
  @PrimaryColumn({ type: 'varchar', length: 64 }) id!: string
  @Column({ type: 'int' }) revision!: number
  @Column({ type: 'text' }) payloadJson!: string
  @Column({ type: 'varchar' }) updatedAt!: string
}
