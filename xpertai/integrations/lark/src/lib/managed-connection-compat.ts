/**
 * @deprecated Remove after @xpert-ai/plugin-sdk exports ManagedConnection tokens/types
 * in this plugin workspace.
 */
export const MANAGED_CONNECTION_REGISTRY_TOKEN = 'XPERT_MANAGED_CONNECTION_REGISTRY'

/**
 * @deprecated Remove after @xpert-ai/plugin-sdk exports ManagedConnection tokens/types
 * in this plugin workspace.
 */
export const CONNECTION_COMMAND_ROUTER_TOKEN = 'XPERT_CONNECTION_COMMAND_ROUTER'

/** @deprecated Remove after @xpert-ai/plugin-sdk exports ManagedConnection types in this plugin workspace. */
export type ManagedConnectionDirection = 'inbound' | 'outbound' | 'internal'

/** @deprecated Remove after @xpert-ai/plugin-sdk exports ManagedConnection types in this plugin workspace. */
export type ManagedConnectionTransportType =
  | 'websocket'
  | 'socket_io'
  | 'sse'
  | 'tcp_tunnel'
  | 'worker'
  | 'custom'

/** @deprecated Remove after @xpert-ai/plugin-sdk exports ManagedConnection types in this plugin workspace. */
export type ManagedConnectionStatus = 'connected' | 'disconnected' | 'stale' | 'error'

/** @deprecated Remove after @xpert-ai/plugin-sdk exports ManagedConnection types in this plugin workspace. */
export type ManagedConnectionRecord = {
  id?: string
  pluginName: string
  connectionType: string
  connectionKey: string
  transportType: ManagedConnectionTransportType
  direction: ManagedConnectionDirection
  ownerInstanceId: string
  status: ManagedConnectionStatus
  connectedAt?: Date | string | null
  lastSeenAt?: Date | string | null
  leaseExpiresAt?: Date | string | null
  disconnectedAt?: Date | string | null
  remoteAddress?: string | null
  metadata?: Record<string, unknown> | null
  lastError?: string | null
  tenantId?: string | null
  organizationId?: string | null
}

/** @deprecated Remove after @xpert-ai/plugin-sdk exports ManagedConnection types in this plugin workspace. */
export type ManagedConnectionRegistry = {
  register(input: {
    pluginName: string
    connectionType: string
    connectionKey: string
    transportType: ManagedConnectionTransportType
    direction?: ManagedConnectionDirection
    tenantId?: string | null
    organizationId?: string | null
    remoteAddress?: string | null
    metadata?: Record<string, unknown>
    leaseTtlMs?: number
  }): Promise<ManagedConnectionRecord>
  heartbeat(input: {
    pluginName?: string
    connectionType: string
    connectionKey: string
    remoteAddress?: string | null
    metadata?: Record<string, unknown>
    leaseTtlMs?: number
  }): Promise<void>
  syncMetadata(input: {
    pluginName?: string
    connectionType: string
    connectionKey: string
    tenantId?: string | null
    organizationId?: string | null
    metadata?: Record<string, unknown>
    merge?: boolean
    leaseTtlMs?: number
  }): Promise<void>
  markDisconnected(input: {
    pluginName?: string
    connectionType: string
    connectionKey: string
    tenantId?: string | null
    organizationId?: string | null
  }, reason?: string): Promise<void>
  list(query: {
    pluginName?: string
    connectionType?: string
    connectionKey?: string
    transportType?: ManagedConnectionTransportType
    direction?: ManagedConnectionDirection
    ownerInstanceId?: string
    status?: ManagedConnectionStatus | ManagedConnectionStatus[]
    activeOnly?: boolean
    tenantId?: string | null
    organizationId?: string | null
    limit?: number
    offset?: number
  }): Promise<ManagedConnectionRecord[]>
  getOwner(input: {
    pluginName?: string
    connectionType: string
    connectionKey: string
    tenantId?: string | null
    organizationId?: string | null
  }): Promise<string | null>
}

/** @deprecated Remove after @xpert-ai/plugin-sdk exports ManagedConnection types in this plugin workspace. */
export type ManagedConnectionCommandRequest = {
  requestId: string
  connectionType: string
  connectionKey: string
  command: string
  payload?: unknown
}

/** @deprecated Remove after @xpert-ai/plugin-sdk exports ManagedConnection types in this plugin workspace. */
export type ConnectionCommandRouter = {
  registerHandler(
    connectionType: string,
    handler: (request: ManagedConnectionCommandRequest) => Promise<unknown> | unknown
  ): void
  invokeOwner(
    connectionType: string,
    connectionKey: string,
    command: string,
    payload?: unknown,
    options?: {
      pluginName?: string
      tenantId?: string | null
      organizationId?: string | null
      timeoutMs?: number
    }
  ): Promise<unknown>
}
