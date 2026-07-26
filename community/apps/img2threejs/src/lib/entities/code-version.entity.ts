import { Column, Entity, Index } from 'typeorm'
import { IMG2THREEJS_TABLES } from '../constants.js'
import type { DeterministicReview, WorkspaceAssetReference } from '../domain/types.js'
import { ScopedRevisionEntity } from './scoped.entity.js'

@Entity(IMG2THREEJS_TABLES.codeVersion)
@Index(['tenantId', 'organizationId', 'projectId', 'version'], { unique: true })
export class CodeVersionEntity extends ScopedRevisionEntity {
  @Column({ type: 'uuid' })
  projectId!: string

  @Column({ type: 'uuid' })
  specVersionId!: string

  @Column({ type: 'int' })
  version!: number

  @Column({ type: 'varchar' })
  sha256!: string

  @Column({ type: 'json', nullable: true })
  sourceAsset!: WorkspaceAssetReference | null

  @Column({ type: 'text', nullable: true })
  sourcePreview!: string | null

  @Column({ type: 'json' })
  deterministicReview!: DeterministicReview

  @Column({ type: 'varchar' })
  status!: 'passed' | 'failed'

  @Column({ type: 'json', default: () => "'[]'" })
  failureReasons!: string[]
}
