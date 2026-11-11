import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { ARTIFACT_NAMESPACE } from '../constants.js'
import type { TicketPriority } from '../../domain/analysis-parser.js'
import type { TicketStatus } from '../../domain/ticket-state.js'

@Entity(pluginArtifactTableName(ARTIFACT_NAMESPACE, 'ticket'))
@Index(['tenantId', 'organizationId', 'status'])
export class SupportTicketEntity {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ nullable: true }) tenantId?: string
  @Column({ nullable: true }) organizationId?: string
  @Column({ nullable: true }) createdBy?: string
  @Column({ nullable: true }) assistantId?: string
  @Column({ nullable: true }) conversationId?: string
  @Column() customerName!: string
  @Column({ nullable: true }) customerEmail?: string
  @Column() subject!: string
  @Column({ type: 'text' }) description!: string
  @Column({ default: 'pending_ai' }) status!: TicketStatus
  @Column({ nullable: true }) category?: string
  @Column({ nullable: true }) priority?: TicketPriority
  @Column({ type: 'text', nullable: true }) summary?: string
  @Column({ type: 'text', nullable: true }) suggestedReply?: string
  @Column({ type: 'float', nullable: true }) confidence?: number
  @Column({ type: 'simple-json', nullable: true }) evidence?: string[]
  @Column({ type: 'text', nullable: true }) failureReason?: string
  @Column({ type: 'text', nullable: true }) reviewComment?: string
  @Column({ default: 0 }) attemptCount!: number
  @Column({ default: 1 }) revision!: number
  @CreateDateColumn() createdAt!: Date
  @UpdateDateColumn() updatedAt!: Date
}
