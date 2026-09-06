import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm'
import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { ARTIFACT_NAMESPACE } from '../artifact-namespace.js'
import type {
  GovernanceCase,
  ExecutionRecord,
  NodeStatus,
  RoleKey,
  ActionReceipt,
  Proposal,
} from '../contracts.js'

export abstract class ScopedEntity {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar' }) organizationId!: string
  @Column({ type: 'varchar' }) scopeKey!: string
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date
}
@Entity(pluginArtifactTableName(ARTIFACT_NAMESPACE, 'case'))
@Index(['scopeKey', 'caseKey'], { unique: true })
@Index(['tenantId', 'organizationId', 'status', 'updatedAt'])
export class MaterialCaseEntity extends ScopedEntity {
  @Column({ type: 'varchar' }) caseKey!: string
  @Column({ type: 'varchar' }) title!: string
  @Column({ type: 'varchar' }) kind!: GovernanceCase['kind']
  @Column({ type: 'varchar' }) status!: GovernanceCase['status']
  @Column({ type: 'int' }) revision!: number
  @Column({ type: 'jsonb' }) snapshot!: GovernanceCase
  @Column({ type: 'varchar' }) createdById!: string
  @Column({ type: 'varchar' }) coordinatorId!: string
  @Column({ type: 'uuid' }) projectId!: string
  @Column({ type: 'varchar', default: 'pending' }) projectStatus!:
    | 'pending'
    | 'ready'
    | 'failed'
  @Column({ type: 'jsonb', default: [] }) assignedAssistantIds!: string[]
  @Column({ type: 'boolean', default: false }) autoRun!: boolean
  @Column({ type: 'boolean', default: false }) criticalConflict!: boolean
  @Column({ type: 'double precision', default: 0 }) exposure!: number
}
@Entity(pluginArtifactTableName(ARTIFACT_NAMESPACE, 'execution'))
@Index(['scopeKey', 'operationId'], { unique: true })
@Index(['scopeKey', 'caseId', 'nodeKey', 'attempt'], { unique: true })
@Index(['tenantId', 'organizationId', 'status'])
export class MaterialExecutionEntity extends ScopedEntity {
  @Column({ type: 'uuid' }) caseId!: string
  @Column({ type: 'varchar' }) operationId!: string
  @Column({ type: 'varchar' }) nodeKey!: string
  @Column({ type: 'varchar' }) roleKey!: RoleKey
  @Column({ type: 'int' }) attempt!: number
  @Column({ type: 'int' }) inputRevision!: number
  @Column({ type: 'varchar' }) status!: ExecutionRecord['status']
  @Column({ type: 'jsonb' }) record!: ExecutionRecord
  @Column({ type: 'varchar' }) requestedBy!: string
  @Column({ type: 'varchar', nullable: true }) queueJobId!: string | null
  @Column({ type: 'varchar', nullable: true }) executorId!: string | null
  @Column({ type: 'varchar', nullable: true }) executorVersion!: string | null
}
@Entity(pluginArtifactTableName(ARTIFACT_NAMESPACE, 'node_state'))
@Index(['scopeKey', 'caseId', 'nodeKey'], { unique: true })
export class MaterialNodeEntity extends ScopedEntity {
  @Column({ type: 'uuid' }) caseId!: string
  @Column({ type: 'varchar' }) nodeKey!: string
  @Column({ type: 'varchar' }) roleKey!: RoleKey
  @Column({ type: 'varchar' }) status!: NodeStatus
}
@Entity(pluginArtifactTableName(ARTIFACT_NAMESPACE, 'mutation'))
@Index(['scopeKey', 'operationId'], { unique: true })
export class MaterialMutationEntity extends ScopedEntity {
  @Column({ type: 'uuid' }) caseId!: string
  @Column({ type: 'varchar' }) operationId!: string
  @Column({ type: 'varchar' }) requestHash!: string
  @Column({ type: 'jsonb' }) receipt!: ActionReceipt
  @Column({ type: 'varchar' }) actorId!: string
  @Column({ type: 'varchar' }) action!: string
}
@Entity(pluginArtifactTableName(ARTIFACT_NAMESPACE, 'mock_delivery'))
@Index(['scopeKey', 'deliveryKey'], { unique: true })
export class MaterialMockDeliveryEntity extends ScopedEntity {
  @Column({ type: 'uuid' }) caseId!: string
  @Column({ type: 'varchar' }) deliveryKey!: string
  @Column({ type: 'varchar' }) system!: string
  @Column({ type: 'varchar' }) requestHash!: string
  @Column({ type: 'jsonb' }) payload!: Proposal
  @Column({ type: 'varchar' }) externalReference!: string
}
@Entity(pluginArtifactTableName(ARTIFACT_NAMESPACE, 'golden'))
@Index(['scopeKey', 'goldenId'], { unique: true })
export class MaterialGoldenEntity extends ScopedEntity {
  @Column({ type: 'varchar' }) goldenId!: string
  @Column({ type: 'varchar' }) fingerprint!: string
  @Column({ type: 'jsonb' }) material!: GovernanceCase['materials'][number]
}
@Entity(pluginArtifactTableName(ARTIFACT_NAMESPACE, 'alias'))
@Index(['scopeKey', 'system', 'plant', 'localCode', 'sourceReference'], {
  unique: true,
})
export class MaterialAliasEntity extends ScopedEntity {
  @Column({ type: 'varchar' }) system!: string
  @Column({ type: 'varchar' }) plant!: string
  @Column({ type: 'varchar' }) localCode!: string
  @Column({ type: 'varchar' }) sourceReference!: string
  @Column({ type: 'varchar' }) goldenId!: string
  @Column({ type: 'varchar' }) relation!: string
  @Column({ type: 'uuid' }) approvedCaseId!: string
}
export const MATERIAL_ENTITIES = [
  MaterialCaseEntity,
  MaterialExecutionEntity,
  MaterialNodeEntity,
  MaterialMutationEntity,
  MaterialMockDeliveryEntity,
  MaterialGoldenEntity,
  MaterialAliasEntity,
]
