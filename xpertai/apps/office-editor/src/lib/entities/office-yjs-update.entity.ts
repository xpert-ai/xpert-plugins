import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import { officeEditorTable } from '../constants.js'

@Entity(officeEditorTable('yjs_update'))
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

  @Column({ type: 'varchar', nullable: true })
  projectId?: string

  @Column({ type: 'varchar' })
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
