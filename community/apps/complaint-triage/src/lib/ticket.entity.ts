import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { PLUGIN_NAMESPACE } from './constants.js'
import type { AttemptStatus, FailureCode, FaultInjection, TicketStatus } from './domain/contracts.js'
import type { Channel, Severity } from './domain/policy.js'

// Timestamps are ISO-8601 strings and JSON payloads are text, so the same entities run on the host's
// Postgres and on sql.js in unit tests. Union-typed columns declare `type` explicitly because
// emitDecoratorMetadata reports them as Object.

@Entity(pluginArtifactTableName(PLUGIN_NAMESPACE, 'ticket'))
@Index(['tenantId', 'organizationId', 'ticketNo'], { unique: true })
@Index(['tenantId', 'organizationId', 'status'])
export class ComplaintTicket {
  @PrimaryColumn({ type: 'varchar', length: 36 }) id!: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar' }) organizationId!: string

  @Column({ type: 'varchar', length: 40 }) ticketNo!: string
  @Column({ type: 'varchar', length: 16 }) channel!: Channel
  @Column({ type: 'varchar', length: 60, nullable: true }) customerName!: string | null
  @Column({ type: 'text' }) content!: string

  @Column({ type: 'varchar', length: 24 }) status!: TicketStatus
  // Number of analysis attempts started so far; the running/latest attempt has attemptNo === attemptCount.
  @Column({ type: 'int' }) attemptCount!: number
  // Written by the same conditional UPDATE that starts an attempt, so a re-read tells which of two
  // concurrent requests won, on every driver (sql.js does not report affected rows reliably).
  @Column({ type: 'varchar', length: 36, nullable: true }) currentAttemptId!: string | null
  @Column({ type: 'varchar', nullable: true }) analysisRequestedAt!: string | null
  @Column({ type: 'varchar', length: 24 }) faultInjection!: FaultInjection

  @Column({ type: 'text', nullable: true }) analysisJson!: string | null
  @Column({ type: 'text', nullable: true }) resolutionJson!: string | null
  // Denormalized for the list: the AI's grade while pending review, the reviewer's grade once confirmed.
  @Column({ type: 'varchar', length: 4, nullable: true }) severity!: Severity | null
  @Column({ type: 'varchar', length: 40, nullable: true }) failureCode!: FailureCode | null
  @Column({ type: 'text', nullable: true }) failureMessage!: string | null

  @Column({ type: 'varchar' }) createdById!: string
  @Column({ type: 'varchar', nullable: true }) confirmedById!: string | null
  @Column({ type: 'varchar', nullable: true }) confirmedAt!: string | null
  @Column({ type: 'varchar' }) createdAt!: string
  @Column({ type: 'varchar' }) updatedAt!: string
}

// One row per analysis attempt: the audit trail that proves a retry did not create a second ticket
// or a second analysis result.
@Entity(pluginArtifactTableName(PLUGIN_NAMESPACE, 'analysis_attempt'))
@Index(['tenantId', 'organizationId', 'ticketId', 'attemptNo'], { unique: true })
export class ComplaintAnalysisAttempt {
  @PrimaryColumn({ type: 'varchar', length: 36 }) id!: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar' }) organizationId!: string

  @Column({ type: 'varchar', length: 36 }) ticketId!: string
  @Column({ type: 'int' }) attemptNo!: number
  @Column({ type: 'varchar', length: 16 }) status!: AttemptStatus
  @Column({ type: 'varchar', length: 40, nullable: true }) failureCode!: FailureCode | null
  @Column({ type: 'text', nullable: true }) failureMessage!: string | null
  @Column({ type: 'varchar' }) requestedById!: string
  @Column({ type: 'varchar' }) startedAt!: string
  @Column({ type: 'varchar', nullable: true }) finishedAt!: string | null
}

export const ENTITIES = [ComplaintTicket, ComplaintAnalysisAttempt]
