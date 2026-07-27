import { Column, Entity, Index } from 'typeorm'
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
  admissionStatus!: 'admitted' | 'rejected'

  @Column({ type: 'json', default: () => "'[]'" })
  observations!: ImageEvidenceObservation[]

  @Column({ type: 'float', default: 0 })
  confidence!: number

  @Column({ type: 'json', default: () => "'[]'" })
  failureReasons!: string[]
}
