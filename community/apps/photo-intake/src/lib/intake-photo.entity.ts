import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { PLUGIN_ARTIFACT_NAMESPACE } from './constants.js'

/**
 * The uploaded photo, kept apart from the case row so case lists never load image bytes.
 * One photo per case; scope columns repeat the case's so every read stays owner-scoped.
 */
@Entity(pluginArtifactTableName(PLUGIN_ARTIFACT_NAMESPACE, 'intake_photo'))
@Index(['tenantId', 'organizationId', 'workspaceId', 'userId', 'xpertId', 'caseId'], { unique: true })
export class IntakePhoto {
  @PrimaryColumn({ type: 'varchar', length: 36 }) caseId!: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar' }) organizationId!: string
  @Column({ type: 'varchar' }) workspaceId!: string
  @Column({ type: 'varchar' }) userId!: string
  @Column({ type: 'varchar' }) xpertId!: string
  @Column({ type: 'varchar', length: 32 }) mimeType!: string
  @Column({ type: 'int' }) byteSize!: number
  @Column({ type: 'varchar', length: 64 }) sha256!: string
  /** Base64 of the verified bytes. */
  @Column({ type: 'text' }) base64!: string
  @Column({ type: 'varchar' }) createdAt!: string
}
