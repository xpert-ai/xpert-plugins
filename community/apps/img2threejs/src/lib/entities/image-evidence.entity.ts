import { Column, Entity, Index } from 'typeorm'
import type { ImageAdmissionDiagnostics } from '../domain/admission/image-admission.js'
import { IMG2THREEJS_TABLES } from '../constants.js'
import type { WorkspaceAssetReference } from '../domain/types.js'
import { ScopedRevisionEntity } from './scoped.entity.js'

export type ImageEvidenceObservation = {
  id: string
  kind: 'silhouette' | 'proportion' | 'material' | 'detail' | 'uncertainty'
  description: string
  confidence: number
}

@Entity(IMG2THREEJS_TABLES.imageEvidence)
@Index(['tenantId', 'organizationId', 'projectId', 'createdAt'])
@Index(['tenantId', 'organizationId', 'sha256'], { unique: false })
export class ImageEvidenceEntity extends ScopedRevisionEntity {
  @Column({ type: 'uuid' })
  projectId!: string

  @Column({ type: 'varchar' })
  label!: string

  @Column({ type: 'varchar' })
  view!: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'three-quarter' | 'detail' | 'unknown'

  @Column({ type: 'json' })
  asset!: WorkspaceAssetReference

  @Column({ type: 'varchar' })
  sha256!: string

  @Column({ type: 'varchar' })
  mimeType!: string

  @Column({ type: 'int' })
  size!: number

  @Column({ type: 'int', nullable: true })
  width!: number | null

  @Column({ type: 'int', nullable: true })
  height!: number | null

  @Column({ type: 'varchar' })
  admissionStatus!: 'admitted' | 'request-input' | 'rejected'

  @Column({ type: 'json', default: () => "'[]'" })
  observations!: ImageEvidenceObservation[]

  @Column({ type: 'float', default: 0 })
  confidence!: number

  @Column({ type: 'json', nullable: true })
  admissionDiagnostics!: ImageAdmissionDiagnostics | null

  @Column({ type: 'float', nullable: true })
  foregroundCoverage!: number | null

  @Column({ type: 'float', nullable: true })
  largestComponentFraction!: number | null

  @Column({ type: 'float', nullable: true })
  maskConfidence!: number | null

  @Column({ type: 'varchar', nullable: true })
  pHash!: string | null

  @Column({ type: 'float', nullable: true })
  viewpointConfidence!: number | null

  @Column({ type: 'varchar', nullable: true })
  requestInputReason!: string | null

  @Column({ type: 'json', default: () => "'[]'" })
  failureReasons!: string[]
}
