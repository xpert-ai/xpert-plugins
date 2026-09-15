import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { PLUGIN_NAMESPACE } from './constants.js'
import type { TicketStatus } from './domain/contracts.js'

@Entity(pluginArtifactTableName(PLUGIN_NAMESPACE, 'ticket'))
@Index(['tenantId', 'organizationId', 'workspaceId', 'userId', 'xpertId', 'requestId'], { unique: true })
@Index(['tenantId', 'organizationId', 'workspaceId', 'userId', 'xpertId', 'status', 'createdAt'])
export class TicketRecord {
  @PrimaryColumn({ type: 'varchar', length: 36 }) id!: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar' }) organizationId!: string
  @Column({ type: 'varchar' }) workspaceId!: string
  @Column({ type: 'varchar' }) userId!: string
  @Column({ type: 'varchar' }) xpertId!: string
  @Column({ type: 'varchar', length: 36 }) requestId!: string
  @Column({ type: 'varchar', length: 120 }) title!: string
  @Column({ type: 'varchar', length: 80 }) customerAlias!: string
  @Column({ type: 'varchar' }) status!: TicketStatus
  @Column({ type: 'int' }) revision!: number
  @Column({ type: 'text' }) payloadJson!: string
  @Column({ type: 'varchar' }) createdAt!: string
  @Column({ type: 'varchar' }) updatedAt!: string
  @Column({ type: 'varchar', nullable: true }) attemptDeadline!: string | null
}
