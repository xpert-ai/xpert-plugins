import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { PLUGIN_NAMESPACE } from './constants.js'
import type { Priority, Team, TicketStatus } from './domain/contracts.js'

export abstract class OwnedRecord {
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar' }) organizationId!: string
  @Column({ type: 'varchar' }) workspaceId!: string
  @Column({ type: 'varchar' }) userId!: string
  @Column({ type: 'varchar' }) xpertId!: string
}

@Entity(pluginArtifactTableName(PLUGIN_NAMESPACE, 'ticket'))
@Index(['tenantId', 'organizationId', 'workspaceId', 'userId', 'xpertId', 'ticketCode'], { unique: true })
export class TicketRecord extends OwnedRecord {
  @PrimaryColumn({ type: 'varchar', length: 64 }) id!: string
  @Column({ type: 'varchar' }) ticketCode!: string
  @Column({ type: 'varchar' }) subject!: string
  @Column({ type: 'text' }) body!: string
  @Column({ type: 'varchar' }) channel!: string
  @Column({ type: 'varchar' }) customerTier!: string
  @Column({ type: 'varchar' }) status!: TicketStatus
  @Column({ type: 'varchar', nullable: true }) priority!: Priority | null
  @Column({ type: 'varchar', nullable: true }) team!: Team | null
  @Column({ type: 'text', nullable: true }) rationale!: string | null
  @Column({ type: 'text', nullable: true }) draftReply!: string | null
  @Column({ type: 'text', nullable: true }) reviewNote!: string | null
  @Column({ type: 'int' }) attemptCount!: number
  @Column({ type: 'varchar', nullable: true }) lastErrorCode!: string | null
  @Column({ type: 'int' }) revision!: number
  @Column({ type: 'varchar' }) createdAt!: string
  @Column({ type: 'varchar' }) updatedAt!: string
}
