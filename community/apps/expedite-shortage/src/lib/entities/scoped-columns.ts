/**
 * 所有实体共用的租户/组织列。skill 要求每张插件表都带 tenantId、organizationId，并按它们过滤读写。
 * Python 类比：SQLAlchemy 里的 Mixin 类，被各个模型继承。
 */
import { Column } from 'typeorm'

export abstract class ScopedColumns {
  @Column({ type: 'varchar', length: 64 }) tenantId!: string
  @Column({ type: 'varchar', length: 64, nullable: true }) organizationId!: string | null
}
