import { createHash } from 'node:crypto'
import type {
  VehiclePickupRole,
  VehiclePickupStatus,
  VehiclePickupRoleConfig,
  PickupActor
} from './types'

export const STATUS_LABELS: Record<VehiclePickupStatus, string> = {
  applied: '已申请',
  approved: '已审批',
  rejected: '已驳回',
  cancelled: '已取消',
  executed: '已执行'
}

export const ACTIVE_STATUSES: VehiclePickupStatus[] = ['applied', 'approved']

export function normalizeVehicleNos(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim().toUpperCase()).filter(Boolean))]
}

export function isValidVehicleNo(value: string): boolean {
  return /^[A-Z0-9-]{4,24}$/.test(value)
}

export function requestFingerprint(userId: string, vehicleNos: string[]): string {
  return createHash('sha256')
    .update(`${userId}|${normalizeVehicleNos(vehicleNos).sort().join(',')}`)
    .digest('hex')
}

export function canTransition(from: VehiclePickupStatus, action: 'approve' | 'reject' | 'cancel' | 'execute') {
  if (action === 'approve' || action === 'reject') return from === 'applied'
  if (action === 'cancel') return from === 'applied' || from === 'approved'
  return from === 'approved'
}

export function resolveActor(
  userId: string,
  tenantId: string,
  organizationId: string | null | undefined,
  requestedRole: VehiclePickupRole | undefined,
  config: VehiclePickupRoleConfig
): PickupActor | null {
  if (!organizationId) return null
  const canSwitchRole = config.demoSwitchUserIds.includes(userId)
  const configuredRole: VehiclePickupRole | null = config.storeUserIds.includes(userId)
    ? 'store'
    : config.approverUserIds.includes(userId)
      ? 'approver'
      : config.carrierUserIds.includes(userId)
        ? 'carrier'
        : null
  const role = canSwitchRole ? requestedRole ?? 'store' : configuredRole
  if (!role) return null
  return {
    tenantId,
    organizationId,
    userId,
    role,
    storeId: config.storeIdByUserId[userId] || config.defaultStoreId,
    carrierId: config.carrierIdByUserId[userId] || config.defaultCarrierId,
    canSwitchRole
  }
}

export function formatSystemRejection(errors: Array<{ vehicleNo?: string; message: string }>): string {
  return `系统驳回：${errors
    .map((error) => `${error.vehicleNo ? `${error.vehicleNo} ` : ''}${error.message}`)
    .join('；')}。`
}

export function statusAllowsRole(status: VehiclePickupStatus, role: VehiclePickupRole): boolean {
  if (role === 'approver') return true
  if (role === 'store') return true
  return status === 'approved' || status === 'executed'
}
