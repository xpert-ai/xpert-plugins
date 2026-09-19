import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import { MEETING_ARTIFACT_NAMESPACE } from '../constants'
import type { JsonObject } from '../types'

@Entity(pluginArtifactTableName(MEETING_ARTIFACT_NAMESPACE, 'operation'))
@Index(['scopeKey', 'operationId'], { unique: true })
export class MeetingOperation {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ type: 'varchar', length: 300 }) scopeKey!: string
  @Column({ type: 'varchar', length: 100 }) operationId!: string
  @Column({ type: 'varchar', length: 64 }) operationType!: string
  @Column({ type: 'varchar', length: 64 }) requestHash!: string
  @Column({ type: 'uuid', nullable: true }) meetingId!: string | null
  @Column({ type: 'jsonb' }) receipt!: JsonObject
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date
}
