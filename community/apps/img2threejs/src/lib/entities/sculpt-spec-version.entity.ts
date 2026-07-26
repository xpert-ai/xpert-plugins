import { Column, Entity, Index } from 'typeorm'
import { IMG2THREEJS_TABLES } from '../constants.js'
import type { SculptSpec } from '../domain/sculpt-spec.schema.js'
import { ScopedRevisionEntity } from './scoped.entity.js'

@Entity(IMG2THREEJS_TABLES.sculptSpec)
@Index(['tenantId', 'organizationId', 'projectId', 'version'], { unique: true })
export class SculptSpecVersionEntity extends ScopedRevisionEntity {
  @Column({ type: 'uuid' })
  projectId!: string

  @Column({ type: 'int' })
  version!: number

  @Column({ type: 'json' })
  spec!: SculptSpec

  @Column({ type: 'varchar' })
  checksum!: string

  @Column({ type: 'varchar' })
  validationStatus!: 'valid' | 'invalid'

  @Column({ type: 'json', default: () => "'[]'" })
  validationIssues!: Array<{ path: string; message: string }>

  @Column({ type: 'float' })
  confidence!: number

  @Column({ type: 'varchar' })
  changeSummary!: string
}
