import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { PLUGIN_NAMESPACE } from './constants.js'

@Entity(pluginArtifactTableName(PLUGIN_NAMESPACE, 'road_event_draft'))
@Index(['tenantId', 'organizationId', 'workspaceId', 'userId', 'xpertId'], { unique: true })
export class RoadEventDraftRecord {
  @PrimaryColumn({ type: 'varchar', length: 64 }) id!: string
  @Column({ type: 'varchar', length: 128 }) tenantId!: string
  @Column({ type: 'varchar', length: 128 }) organizationId!: string
  @Column({ type: 'varchar', length: 128 }) workspaceId!: string
  @Column({ type: 'varchar', length: 128 }) userId!: string
  @Column({ type: 'varchar', length: 128 }) xpertId!: string
  @Column({ type: 'int' }) revision!: number
  @Column({ type: 'text' }) payloadJson!: string
  @Column({ type: 'varchar' }) updatedAt!: string
}
