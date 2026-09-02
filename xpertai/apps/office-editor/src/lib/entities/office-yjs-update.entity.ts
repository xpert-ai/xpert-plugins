import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryGeneratedColumn } from 'typeorm'
import { officeEditorTable } from '../constants.js'
import { OfficeDocument } from './office-document.entity.js'

@Entity(officeEditorTable('yjs_update'))
@ForeignKey(() => OfficeDocument, ['documentId'], ['id'], {
  name: 'plugin_office_editor_yjs_update_parent_fk',
  onDelete: 'CASCADE'
})
@ForeignKey(() => OfficeDocument, ['documentId', 'projectId'], ['id', 'projectId'], {
  name: 'plugin_office_editor_yjs_update_parent_project_fk',
  onDelete: 'CASCADE'
})
@Index(['tenantId', 'organizationId', 'documentId', 'sequenceNumber'])
@Index(['tenantId', 'organizationId', 'documentId', 'updateHash'])
export class OfficeYjsUpdate {
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
  sequenceNumber!: number

  @Column({ type: 'text' })
  updateBase64!: string

  @Column({ type: 'varchar' })
  updateHash!: string

  @Column({ type: 'varchar', nullable: true })
  origin?: string

  @Column({ type: 'varchar', nullable: true })
  clientId?: string

  @Column({ type: 'varchar', nullable: true })
  createdById?: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date
}
