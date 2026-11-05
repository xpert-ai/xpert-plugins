import { IsNull } from 'typeorm'
import type { ContractReviewScope } from './types'

export function scopeColumns(scope: ContractReviewScope) {
  return {
    tenantId: scope.tenantId ?? null,
    organizationId: scope.organizationId ?? null
  }
}

export function scopeWhere(scope: ContractReviewScope, extra: Record<string, unknown> = {}) {
  return {
    tenantId: scope.tenantId ? scope.tenantId : IsNull(),
    organizationId: scope.organizationId ? scope.organizationId : IsNull(),
    ...extra
  }
}

export function applyScopeToQueryBuilder<
  T extends { andWhere: (condition: string, parameters?: Record<string, unknown>) => T }
>(qb: T, alias: string, scope: ContractReviewScope) {
  if (scope.tenantId) {
    qb.andWhere(`${alias}.tenantId = :tenantId`, { tenantId: scope.tenantId })
  } else {
    qb.andWhere(`${alias}.tenantId IS NULL`)
  }
  if (scope.organizationId) {
    qb.andWhere(`${alias}.organizationId = :organizationId`, { organizationId: scope.organizationId })
  } else {
    qb.andWhere(`${alias}.organizationId IS NULL`)
  }
  return qb
}
