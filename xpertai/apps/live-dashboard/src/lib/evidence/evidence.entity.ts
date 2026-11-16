import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { AnalysisEvidenceSnapshot } from '@xpert-ai/contracts'
import { libraryTable } from '../library/resource-contract'

/** Immutable snapshot; only the derived Artifact pointer may be completed after a retry. */
@Entity(libraryTable('analysis_evidence_v1'))
@Index(['tenantId', 'organizationId', 'projectId', 'requestId'], { unique: true })
export class AnalysisEvidenceRecord {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar' }) organizationId!: string
  @Column({ type: 'uuid' }) projectId!: string
  @Column({ type: 'uuid' }) createdById!: string
  @Column({ type: 'uuid' }) requestId!: string
  @Column({ type: 'varchar', length: 64 }) requestHash!: string
  @Column({ type: 'jsonb' }) snapshot!: AnalysisEvidenceSnapshot
  @Column({ type: 'uuid', nullable: true }) artifactId!: string | null
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date
}
