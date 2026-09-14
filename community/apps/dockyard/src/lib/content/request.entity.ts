import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { OwnedRecord } from '../workspace.entity.js'
@Entity(pluginArtifactTableName('dockyard', 'content_request'))
@Index(['tenantId', 'organizationId', 'workspaceId', 'userId', 'xpertId'])
export class ContentRequestRecord extends OwnedRecord {
  @PrimaryColumn({ type: 'varchar', length: 36 }) id!: string
  @Column({ type: 'int' }) revision!: number
  @Column({ type: 'text' }) payloadJson!: string
  @Column({ type: 'varchar' }) createdAt!: string
}
