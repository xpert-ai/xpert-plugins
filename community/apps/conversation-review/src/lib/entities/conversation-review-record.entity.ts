import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { CONVERSATION_REVIEW_ARTIFACT_NAMESPACE, CONVERSATION_REVIEW_RECORD_TABLE_KEY } from '../constants'
import type {
  ConversationIntentLevel,
  ConversationReviewAnalysis,
  ConversationReviewStatus,
  ConversationSource
} from '../types'

// -> plugin_conversation_review_record
@Entity(pluginArtifactTableName(CONVERSATION_REVIEW_ARTIFACT_NAMESPACE, CONVERSATION_REVIEW_RECORD_TABLE_KEY))
@Index(['tenantId', 'organizationId', 'createdById', 'status'])
@Index(['tenantId', 'organizationId', 'createdById', 'updatedAt'])
// Re-import checks every incoming externalId against the seller's existing rows.
@Index(['tenantId', 'organizationId', 'createdById', 'externalId'])
// Customer history/search group rows by this instead of re-deriving it from customerName each time.
@Index(['tenantId', 'organizationId', 'createdById', 'customerId'])
export class ConversationReviewRecord {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  tenantId?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  organizationId?: string

  /** Owning salesperson. Reads are scoped to this so one seller cannot see another's records. */
  @Index()
  @Column({ type: 'varchar', nullable: true })
  createdById?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  assistantId?: string

  @Column({ type: 'varchar', nullable: true })
  conversationId?: string

  @Column({ type: 'varchar' })
  customerName?: string

  /**
   * Resolved customer identity, deterministically derived from `customerExternalId` when the
   * source supplied one, or from `customerName` otherwise. See `resolveCustomerId` in
   * `customer-identity.ts`. This — not `customerName` — is what history/search grouping keys on,
   * so two different customers who happen to share a name are not merged when the source can tell
   * them apart.
   */
  @Column({ type: 'uuid', nullable: true })
  customerId?: string

  /** Customer id as given by the source system (CRM number, WeCom external contact id, ...), kept for traceability. */
  @Column({ type: 'varchar', nullable: true })
  customerExternalId?: string

  @Column({ type: 'text' })
  conversation?: string

  /** Which ingestion adapter this record arrived through. See `ConversationSource`. */
  @Column({ type: 'varchar', default: 'manual' })
  source?: ConversationSource

  /**
   * Id in the source system. Unique per salesperson, which is what makes re-importing the same
   * file idempotent: a second import of an unchanged export adds nothing instead of doubling
   * every conversation.
   */
  @Column({ type: 'varchar', nullable: true })
  externalId?: string

  /**
   * When the conversation actually took place, as reported by the source.
   *
   * Distinct from `createdAt` on purpose. Importing three months of history in one afternoon
   * would otherwise stack every conversation onto today's bar and make the trend chart a lie.
   */
  @Column({ type: 'timestamptz', nullable: true })
  occurredAt?: Date

  @Index()
  @Column({ type: 'varchar', default: 'draft' })
  status?: ConversationReviewStatus

  @Column({ type: 'varchar', nullable: true })
  intentLevel?: ConversationIntentLevel

  /**
   * Which deterministic rule-set version (see `RULE_VERSION` in `rule-check.ts`) was applied when
   * `aiResult` was produced. Null on a record that has never been analysed. Not touched by
   * confirmation — it describes the analysis run, not the human sign-off.
   */
  @Column({ type: 'varchar', nullable: true })
  ruleVersion?: string

  /** Untouched AI output, kept so the human edit can always be compared against it. */
  @Column({ type: 'jsonb', nullable: true })
  aiResult?: ConversationReviewAnalysis

  /** What the salesperson actually signed off on. This is the business result of record. */
  @Column({ type: 'jsonb', nullable: true })
  confirmedResult?: ConversationReviewAnalysis

  @Column({ type: 'text', nullable: true })
  errorMessage?: string

  @Column({ type: 'int', default: 0 })
  retryCount?: number

  /** Optimistic-lock counter; bumped on every state transition. */
  @Column({ type: 'int', default: 0 })
  revision?: number

  @Column({ type: 'timestamptz', nullable: true })
  analyzedAt?: Date

  @Column({ type: 'timestamptz', nullable: true })
  confirmedAt?: Date

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt?: Date
}
