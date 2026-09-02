import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { OfficeSnapshotSource } from '../types.js'
import { officeEditorTable } from '../constants.js'
import { OfficeDocument } from './office-document.entity.js'

@Entity(officeEditorTable('snapshot'))
@ForeignKey(() => OfficeDocument, ['documentId'], ['id'], {
  name: 'plugin_office_editor_snapshot_parent_fk',
  onDelete: 'CASCADE'
})
@ForeignKey(() => OfficeDocument, ['documentId', 'projectId'], ['id', 'projectId'], {
  name: 'plugin_office_editor_snapshot_parent_project_fk',
  onDelete: 'CASCADE'
})
@Index(['tenantId', 'organizationId', 'documentId', 'versionNumber'])
@Index(['tenantId', 'organizationId', 'documentId', 'createdAt'])
export class OfficeSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  tenantId?: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  organizationId?: string

  @Column({ type: 'varchar', nullable: true })
  workspaceId?: string

  @Column({ type: 'uuid', nullable: true, update: false })
  projectId?: string

  @Column({ type: 'uuid' })
  documentId!: string

  @Column({ type: 'int' })
  versionNumber!: number

  @Column({ type: 'varchar', default: 'workbench' })
  source?: OfficeSnapshotSource

  @Column({ type: 'json', nullable: true })
  snapshot?: unknown

  @Column({ type: 'text', nullable: true })
  snapshotText?: string

  @Column({ type: 'text', nullable: true })
  yjsStateBase64?: string

  @Column({ type: 'text', nullable: true })
  yjsStateVectorBase64?: string

  @Column({ type: 'int', default: 0 })
  yjsUpdateCount?: number

  @Column({ type: 'text', nullable: true })
  changeSummary?: string

  @Column({ type: 'varchar', nullable: true })
  operationId?: string

  @Column({ type: 'varchar', nullable: true })
  createdById?: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date
}
