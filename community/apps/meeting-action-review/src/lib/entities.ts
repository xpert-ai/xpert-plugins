import { Entity, Column, PrimaryColumn, Index, Check, ManyToOne, JoinColumn, type Relation } from 'typeorm'
import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import type { AgentMiddlewareAssistantTaskInput } from '@xpert-ai/plugin-sdk'
import { NAMESPACE } from './constants.js'
import type { RecordStatus, AttemptStatus, ReviewItem, Segments } from './types.js'

abstract class OwnedRow {
  @PrimaryColumn('uuid') id!: string
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string
  @Column('uuid', { name: 'organization_id' }) organizationId!: string
  @Column('uuid', { name: 'owner_user_id' }) ownerUserId!: string
  @Column('timestamptz', { name: 'created_at' }) createdAt!: Date
  @Column('timestamptz', { name: 'updated_at' }) updatedAt!: Date
}

@Entity(pluginArtifactTableName(NAMESPACE, 'record'))
@Index('meeting_action_review_record_scope', ['tenantId', 'organizationId', 'ownerUserId', 'assistantId', 'updatedAt', 'id'])
@Index('meeting_action_review_create_unique', ['tenantId', 'organizationId', 'ownerUserId', 'assistantId', 'createOperationId'], { unique: true })
@Index('meeting_action_review_record_owner_unique', ['id', 'tenantId', 'organizationId', 'ownerUserId'], { unique: true })
@Check('meeting_action_review_record_revision', 'revision >= 1')
@Check('meeting_action_review_record_status', "status IN ('processing','review_ready','confirmed','failed')")
@Check('meeting_action_review_record_text', "length(trim(title)) > 0 AND length(trim(source_text)) > 0")
@Check('meeting_action_review_record_items', "(status IN ('review_ready','confirmed') AND initial_items IS NOT NULL AND review_items IS NOT NULL AND jsonb_typeof(initial_items) = 'array' AND jsonb_typeof(review_items) = 'array') OR (status IN ('processing','failed') AND initial_items IS NULL AND review_items IS NULL)")
@Check('meeting_action_review_record_confirm', "(status = 'confirmed' AND confirm_operation_id IS NOT NULL AND confirm_payload_hash IS NOT NULL AND confirmed_at IS NOT NULL AND confirmed_by IS NOT NULL AND confirmed_by = owner_user_id) OR (status <> 'confirmed' AND confirm_operation_id IS NULL AND confirm_payload_hash IS NULL AND confirmed_at IS NULL AND confirmed_by IS NULL)")
export class MeetingRecord extends OwnedRow {
  @Column('text', { name: 'assistant_id' }) assistantId!: string
  @Column('text') title!: string
  @Column('text', { name: 'source_text' }) sourceText!: string
  @Column('jsonb', { name: 'source_segments' }) sourceSegments!: Segments
  @Column('char', { length: 64, name: 'source_hash' }) sourceHash!: string
  @Column('text') status!: RecordStatus
  @Column('uuid', { name: 'active_attempt_id', nullable: true }) activeAttemptId!: string | null
  @Column('jsonb', { name: 'initial_items', nullable: true }) initialItems!: ReviewItem[] | null
  @Column('jsonb', { name: 'review_items', nullable: true }) reviewItems!: ReviewItem[] | null
  @Column('integer', { default: 1 }) revision!: number
  @Column('uuid', { name: 'create_operation_id' }) createOperationId!: string
  @Column('char', { length: 64, name: 'create_payload_hash' }) createPayloadHash!: string
  @Column('uuid', { name: 'last_save_operation_id', nullable: true }) lastSaveOperationId!: string | null
  @Column('char', { length: 64, name: 'last_save_payload_hash', nullable: true }) lastSavePayloadHash!: string | null
  @Column('uuid', { name: 'confirm_operation_id', nullable: true }) confirmOperationId!: string | null
  @Column('char', { length: 64, name: 'confirm_payload_hash', nullable: true }) confirmPayloadHash!: string | null
  @Column('timestamptz', { name: 'confirmed_at', nullable: true }) confirmedAt!: Date | null
  @Column('uuid', { name: 'confirmed_by', nullable: true }) confirmedBy!: string | null
  @ManyToOne(() => AnalysisAttempt, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn([{ name: 'id', referencedColumnName: 'recordId', foreignKeyConstraintName: 'meeting_action_review_active_fk' }, { name: 'active_attempt_id', referencedColumnName: 'id' }])
  activeAttempt?: Relation<AnalysisAttempt>
}

@Entity(pluginArtifactTableName(NAMESPACE, 'attempt'))
@Index('meeting_action_review_attempt_number', ['recordId', 'attemptNo'], { unique: true })
@Index('meeting_action_review_attempt_request', ['recordId', 'requestOperationId'], { unique: true })
@Index('meeting_action_review_attempt_record_id', ['recordId', 'id'], { unique: true })
@Index('meeting_action_review_attempt_active', ['recordId'], { unique: true, where: "status IN ('queued','dispatching','running')" })
@Index('meeting_action_review_attempt_recovery', ['installationScopeKey', 'nextCheckAt', 'id'], { where: "status IN ('queued','dispatching','running')" })
@Check('meeting_action_review_attempt_status', "status IN ('queued','dispatching','running','succeeded','failed','timed_out')")
@Check('meeting_action_review_attempt_finished', "(status IN ('succeeded','failed','timed_out') AND finished_at IS NOT NULL) OR (status IN ('queued','dispatching','running') AND finished_at IS NULL)")
@Check('meeting_action_review_attempt_output', "status <> 'succeeded' OR output_hash IS NOT NULL")
export class AnalysisAttempt extends OwnedRow {
  @Column('uuid', { name: 'record_id' }) recordId!: string
  @Column('integer', { name: 'attempt_no' }) attemptNo!: number
  @Column('uuid', { name: 'request_operation_id' }) requestOperationId!: string
  @Column('char', { length: 64, name: 'request_payload_hash' }) requestPayloadHash!: string
  @Column('text') status!: AttemptStatus
  @Column('text', { name: 'installation_scope_key' }) installationScopeKey!: string
  @Column('text', { name: 'published_version', nullable: true }) publishedVersion!: string | null
  @Column('text', { name: 'agent_key', nullable: true }) agentKey!: string | null
  @Index('meeting_action_review_attempt_call', { unique: true })
  @Column('text', { name: 'client_message_id' }) clientMessageId!: string
  @Index('meeting_action_review_attempt_conversation', { unique: true })
  @Column('text', { name: 'conversation_id' }) conversationId!: string
  @Index('meeting_action_review_attempt_execution', { unique: true })
  @Column('text', { name: 'root_execution_id' }) rootExecutionId!: string
  @Column('text', { name: 'thread_id', nullable: true }) threadId!: string | null
  @Column('jsonb', { name: 'dispatch_input', nullable: true }) dispatchInput!: AgentMiddlewareAssistantTaskInput | null
  @Column('char', { length: 64, name: 'output_hash', nullable: true }) outputHash!: string | null
  @Column('text', { name: 'platform_status', nullable: true }) platformStatus!: string | null
  @Column('text', { name: 'error_code', nullable: true }) errorCode!: string | null
  @Column('text', { name: 'error_message', nullable: true }) errorMessage!: string | null
  @Column('timestamptz', { name: 'deadline_at' }) deadlineAt!: Date
  @Column('timestamptz', { name: 'next_check_at' }) nextCheckAt!: Date
  @Column('timestamptz', { name: 'lease_until', nullable: true }) leaseUntil!: Date | null
  @Column('timestamptz', { name: 'started_at', nullable: true }) startedAt!: Date | null
  @Column('timestamptz', { name: 'finished_at', nullable: true }) finishedAt!: Date | null
  @ManyToOne(() => MeetingRecord, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'record_id', referencedColumnName: 'id', foreignKeyConstraintName: 'meeting_action_review_attempt_owner_fk' },
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'organization_id', referencedColumnName: 'organizationId' },
    { name: 'owner_user_id', referencedColumnName: 'ownerUserId' }
  ])
  record?: Relation<MeetingRecord>
}
