import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm'
import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { NAMESPACE } from './constants'
import type { Fields, Status, FailureCode, ReviewDraft } from './contracts'
import type { ScoreResult } from './scoring-input'

@Entity(pluginArtifactTableName(NAMESPACE, 'case'))
@Index(
  ['tenantId', 'organizationId', 'userId', 'assistantId', 'createdOperation'],
  { unique: true }
)
export class ReviewCase {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ type: 'uuid' }) tenantId!: string
  @Column({ type: 'uuid' }) organizationId!: string
  @Column({ type: 'uuid' }) userId!: string
  @Column({ type: 'uuid' }) assistantId!: string
  @Column({ type: 'uuid' }) createdOperation!: string
  @Column({ type: 'varchar', length: 120 }) title!: string
  @Column({ type: 'text' }) source!: string
  @Column({ type: 'varchar', default: 'draft' }) status!: Status
  @Column({ type: 'int', default: 1 }) revision!: number
  @Index() @Column({ type: 'uuid', nullable: true }) attemptId!: string | null
  @Column({ type: 'timestamptz', nullable: true })
  attemptStartedAt!: Date | null
  @Column({ type: 'jsonb', nullable: true }) candidates!: Fields | null
  @Column({ type: 'jsonb', nullable: true }) confirmed!: Fields | null
  @Column({ type: 'jsonb', nullable: true }) reviewDraft!: ReviewDraft | null
  @Column({ type: 'jsonb', nullable: true }) assessment!: ScoreResult | null
  @Column({ type: 'text', nullable: true }) reason!: string | null
  @Column({ type: 'varchar', nullable: true }) failureCode!: FailureCode
  @CreateDateColumn() createdAt!: Date
  @UpdateDateColumn() updatedAt!: Date
}

@Entity(pluginArtifactTableName(NAMESPACE, 'event'))
@Index(
  [
    'tenantId',
    'organizationId',
    'userId',
    'assistantId',
    'caseId',
    'operationId'
  ],
  { unique: true }
)
export class ReviewEvent {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ type: 'uuid' }) tenantId!: string
  @Column({ type: 'uuid' }) organizationId!: string
  @Column({ type: 'uuid' }) userId!: string
  @Column({ type: 'uuid' }) assistantId!: string
  @Column({ type: 'uuid' }) caseId!: string
  @Column({ type: 'varchar', length: 120 }) operationId!: string
  @Column({ type: 'varchar' }) kind!: string
  @Column({ type: 'int' }) revision!: number
  @Column({ type: 'jsonb', nullable: true }) snapshot!: {
    fields?: Fields
    reason?: string
    failureCode?: FailureCode
    reviewDraft?: ReviewDraft
    assessment?: ScoreResult
  } | null
  @CreateDateColumn() createdAt!: Date
}
