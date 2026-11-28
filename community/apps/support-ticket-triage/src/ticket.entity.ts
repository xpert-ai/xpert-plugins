import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { namespace } from './constants.js'
import type { AttemptFailure, TicketDecision, TicketStatus, TicketSuggestion } from './contracts.js'

@Entity(pluginArtifactTableName(namespace, 'ticket'))
@Index(['tenantId', 'organizationId', 'workspaceId', 'userId', 'xpertId', 'updatedAt'])
export class TicketRecord {
  @PrimaryColumn({ type: 'varchar', length: 36 }) id!: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar' }) organizationId!: string
  @Column({ type: 'varchar' }) workspaceId!: string
  @Column({ type: 'varchar' }) userId!: string
  @Column({ type: 'varchar' }) xpertId!: string
  @Column({ type: 'varchar', length: 120 }) subject!: string
  @Column({ type: 'text' }) body!: string
  @Column({ type: 'varchar' }) status!: TicketStatus
  @Column({ type: 'int' }) revision!: number
  @Column({ type: 'varchar', nullable: true }) attemptId!: string | null
  @Column({ type: 'varchar', nullable: true }) deadline!: string | null
  @Column({ type: 'varchar', nullable: true }) failure!: AttemptFailure | null
  @Column({ type: 'simple-json', nullable: true }) ai!: TicketSuggestion | null
  @Column({ type: 'simple-json', nullable: true }) final!: TicketDecision | null
  @Column({ type: 'varchar' }) updatedAt!: string
}
