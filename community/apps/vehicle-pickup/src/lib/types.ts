export type VehiclePickupRole = 'store' | 'approver' | 'carrier'

export type VehiclePickupStatus = 'applied' | 'approved' | 'rejected' | 'cancelled' | 'executed'

export type VehiclePickupRejectionSource = 'manual' | 'system'

export type MockVehicleStatus = 'available' | 'customs_locked' | 'under_maintenance' | 'sold'

export interface MockVehicle {
  vehicleNo: string
  model: string
  storeId: string
  status: MockVehicleStatus
}

export interface PickupActor {
  tenantId: string
  organizationId: string
  userId: string
  role: VehiclePickupRole
  storeId?: string
  carrierId?: string
  canSwitchRole: boolean
}

export interface PickupVehicleSnapshot {
  vehicleNo: string
  model: string
  storeId: string
  status: MockVehicleStatus
  eligible: boolean
}

export interface PickupValidationError {
  vehicleNo?: string
  code: string
  message: string
}

export interface PickupValidationResult {
  canPickup: boolean
  vehicles: PickupVehicleSnapshot[]
  errors: PickupValidationError[]
  validatedAt: string
}

export interface PickupRequestDto {
  id: string
  requestNo: string
  status: VehiclePickupStatus
  storeId: string
  applicantId: string
  applicantName?: string
  vehicles: PickupVehicleSnapshot[]
  sourceText?: string
  approvalReason?: string
  rejectionSource?: VehiclePickupRejectionSource
  approvedAt?: string
  rejectedAt?: string
  cancelledAt?: string
  cancelReason?: string
  carrierId?: string
  executionAttempts: number
  executedAt?: string
  executionFailureReason?: string | null
  validationSnapshot?: PickupValidationResult
  validatedAt?: string
  version: number
  createdAt?: string
  updatedAt?: string
  logs?: PickupLogDto[]
}

export interface PickupLogDto {
  id: string
  action: string
  actorId?: string
  actorName?: string
  actorRole?: VehiclePickupRole | 'system'
  fromStatus?: VehiclePickupStatus
  toStatus?: VehiclePickupStatus
  reason?: string
  metadata?: unknown
  createdAt?: string
}

export interface PickupViewer {
  role: VehiclePickupRole
  storeId?: string
  carrierId?: string
  canSwitchRole: boolean
  availableRoles: VehiclePickupRole[]
}

export interface PickupViewData {
  viewer: PickupViewer
  requests: PickupRequestDto[]
  selectedRequest: PickupRequestDto | null
  total: number
  statusOptions: Array<{ value: VehiclePickupStatus; label: string }>
  demo: {
    executionFailureEnabled: boolean
    vehicleIssueSimulationEnabled: boolean
  }
}

export interface VehiclePickupCreateInput {
  vehicleNos: string[]
  sourceText?: string
}

export interface VehiclePickupQueryInput {
  status?: VehiclePickupStatus
  keyword?: string
  requestId?: string
  requestNo?: string
}

export interface VehiclePickupViewQuery extends VehiclePickupQueryInput {
  role?: VehiclePickupRole
}

export interface VehiclePickupRoleConfig {
  storeUserIds: string[]
  approverUserIds: string[]
  carrierUserIds: string[]
  demoSwitchUserIds: string[]
  defaultStoreId: string
  defaultCarrierId: string
  storeIdByUserId: Record<string, string>
  carrierIdByUserId: Record<string, string>
  simulateExecutionFailureOnce: boolean
}
