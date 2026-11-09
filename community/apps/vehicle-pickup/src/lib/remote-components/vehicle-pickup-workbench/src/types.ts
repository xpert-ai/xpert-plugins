export interface HostContext {
  locale?: string
  initialQuery?: {
    search?: string
    parameters?: Record<string, unknown>
  }
  theme?: unknown
}

export interface BridgeMessage {
  channel?: string
  protocolVersion?: number
  instanceId?: string | null
  type?: string
  requestId?: string
  initialQuery?: HostContext['initialQuery']
  locale?: string
  theme?: unknown
  data?: unknown
  result?: unknown
  message?: string
}

export type PickupRole = 'store' | 'approver' | 'carrier'
export type PickupStatus = 'applied' | 'approved' | 'rejected' | 'cancelled' | 'executed'

export interface VehicleSnapshot {
  vehicleNo: string
  model: string
  storeId: string
  status: string
  eligible: boolean
}

export interface PickupLog {
  id: string
  action: string
  actorRole?: string
  reason?: string
  createdAt?: string
  fromStatus?: PickupStatus
  toStatus?: PickupStatus
}

export interface PickupRequest {
  id: string
  requestNo: string
  status: PickupStatus
  storeId: string
  applicantId: string
  applicantName?: string
  vehicles: VehicleSnapshot[]
  approvalReason?: string
  rejectionSource?: 'manual' | 'system'
  cancelReason?: string
  carrierId?: string
  executionAttempts: number
  executionFailureReason?: string | null
  validationSnapshot?: {
    canPickup: boolean
    errors: Array<{ vehicleNo?: string; code: string; message: string }>
    validatedAt: string
  }
  version: number
  createdAt?: string
  updatedAt?: string
  logs?: PickupLog[]
}

export interface PickupViewer {
  role: PickupRole
  storeId?: string
  carrierId?: string
  canSwitchRole: boolean
  availableRoles: PickupRole[]
}

export interface PickupViewData {
  viewer: PickupViewer
  requests: PickupRequest[]
  selectedRequest: PickupRequest | null
  total: number
  statusOptions: Array<{ value: PickupStatus; label: string }>
  demo: {
    executionFailureEnabled: boolean
    vehicleIssueSimulationEnabled: boolean
  }
}

declare global {
  interface Window {
    React: typeof import('react')
    ReactDOM: typeof import('react-dom') & {
      createRoot?: (container: Element | DocumentFragment | null) => { render(node: import('react').ReactNode): void }
    }
    __vehiclePickupReload?: () => void
  }
}
