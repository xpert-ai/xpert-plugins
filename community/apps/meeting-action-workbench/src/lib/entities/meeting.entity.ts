import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { MEETING_ARTIFACT_NAMESPACE } from '../constants'
import type { MeetingStatus } from '../types'

@Entity(pluginArtifactTableName(MEETING_ARTIFACT_NAMESPACE, 'meeting'))
@Index(['tenantId', 'organizationId', 'updatedAt'])
@Index(['tenantId', 'organizationId', 'status', 'updatedAt'])
export class MeetingRecord {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ type: 'varchar', nullable: true }) tenantId!: string | null
  @Column({ type: 'varchar', nullable: true }) organizationId!: string | null
  @Column({ type: 'varchar', length: 200 }) title!: string
  @Column({ type: 'text' }) sourceText!: string
  @Column({ type: 'varchar', length: 32 }) status!: MeetingStatus
  @Column({ type: 'integer', default: 1 }) revision!: number
  @Column({ type: 'integer', default: 1 }) extractionAttempt!: number
  @Column({ type: 'varchar', length: 80, nullable: true }) errorCode!: string | null
  @Column({ type: 'text', nullable: true }) errorMessage!: string | null
  @Column({ type: 'varchar', nullable: true }) createdById!: string | null
  @Column({ type: 'varchar', nullable: true }) assistantId!: string | null
  @Column({ type: 'varchar', nullable: true }) conversationId!: string | null
  @Column({ type: 'varchar', nullable: true }) reviewedById!: string | null
  @Column({ type: 'timestamptz', nullable: true }) reviewedAt!: Date | null
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date
}
