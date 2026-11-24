import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { NAMESPACE } from './constants.js'

@Entity(pluginArtifactTableName(NAMESPACE,'tasks'))
@Index(['tenantId','organizationId','workspaceId','userId','xpertId','requestKey'],{unique:true})
export class ResearchTaskEntity {
  @PrimaryColumn({type:'varchar',length:36}) id!: string
  @Column({type:'varchar'}) tenantId!: string
  @Column({type:'varchar'}) organizationId!: string
  @Column({type:'varchar'}) workspaceId!: string
  @Column({type:'varchar'}) userId!: string
  @Column({type:'varchar'}) xpertId!: string
  @Column({type:'varchar'}) requestKey!: string
  @Column({type:'int'}) revision!: number
  @Column({type:'varchar'}) updatedAt!: string
  @Column({type:'text'}) payloadJson!: string
}
