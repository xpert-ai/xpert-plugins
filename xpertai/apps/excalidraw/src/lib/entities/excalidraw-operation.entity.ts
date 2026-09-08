import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { EXCALIDRAW_ARTIFACT_NAMESPACE } from '../constants.js'
import type { JSONValue } from '@xpert-ai/contracts'

@Entity(pluginArtifactTableName(EXCALIDRAW_ARTIFACT_NAMESPACE, 'operation'))
@Index(['tenantId', 'organizationId', 'actorId', 'operationId'], { unique: true })
export class ExcalidrawOperation {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar' }) organizationId!: string
  @Column({ type: 'varchar' }) actorId!: string
  @Column({ type: 'varchar', length: 100 }) operationId!: string
  @Column({ type: 'varchar', length: 100 }) tool!: string
  @Column({ type: 'varchar', length: 64 }) inputHash!: string
  @Column({ type: 'jsonb', nullable: true }) result?: JSONValue
  @CreateDateColumn() createdAt!: Date
}
