import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { namespace } from './constants'
import type { IntakeRecord, Report } from '../shared/contracts'
import type { AnalysisResult, AnalysisState, Answer } from '../shared/analysis'

@Entity(pluginArtifactTableName(namespace, 'record'))
@Index(['tenantId', 'organizationId', 'ownerId', 'updatedAt'])
@Index(['tenantId', 'organizationId', 'ownerId', 'requestId'], { unique: true })
export class IntakeEntity {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ type: 'uuid' }) tenantId!: string
  @Column({ type: 'uuid' }) organizationId!: string
  @Column({ type: 'uuid' }) ownerId!: string
  @Column({ type: 'uuid' }) requestId!: string
  @Column({ type: 'text' }) originalFeedback!: string
  @Column({ type: 'text', default: '' }) supplement!: string
  @Column({ type: 'jsonb' }) report!: Report
  @Column({ type: 'varchar', default: 'draft' }) status!: IntakeRecord['status']
  @Column({ type: 'integer', default: 1 }) revision!: number
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" }) protectedFields!: (keyof Report)[]
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" }) answers!: Answer[]
  @Column({ type: 'jsonb', nullable: true }) analysis!: AnalysisState | null
  @Column({ type: 'jsonb', nullable: true }) aiResult!: AnalysisResult | null
  @Column({ type: 'jsonb', nullable: true }) confirmed!: IntakeRecord['confirmed']
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date
}
