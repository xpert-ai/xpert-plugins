import { z } from 'zod/v3'
import type { VehiclePickupRoleConfig } from './types'

export const VehiclePickupConfigSchema = z.object({
  enabled: z.boolean().default(true),
  defaultStoreId: z.string().default('store-001'),
  defaultCarrierId: z.string().default('carrier-001'),
  storeUserIds: z.array(z.string()).default([]),
  approverUserIds: z.array(z.string()).default([]),
  carrierUserIds: z.array(z.string()).default([]),
  demoSwitchUserIds: z.array(z.string()).default([]),
  storeIdByUserId: z.record(z.string()).default({}),
  carrierIdByUserId: z.record(z.string()).default({}),
  simulateExecutionFailureOnce: z.boolean().default(true)
})

function parseList(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseMap(value: string | undefined): Record<string, string> {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    )
  } catch {
    return {}
  }
}

export function readVehiclePickupRuntimeConfig(): VehiclePickupRoleConfig {
  return {
    storeUserIds: parseList(process.env['VEHICLE_PICKUP_STORE_USER_IDS']),
    approverUserIds: parseList(process.env['VEHICLE_PICKUP_APPROVER_USER_IDS']),
    carrierUserIds: parseList(process.env['VEHICLE_PICKUP_CARRIER_USER_IDS']),
    demoSwitchUserIds: parseList(process.env['VEHICLE_PICKUP_DEMO_SWITCH_USER_IDS']),
    defaultStoreId: process.env['VEHICLE_PICKUP_DEFAULT_STORE_ID'] || 'store-001',
    defaultCarrierId: process.env['VEHICLE_PICKUP_DEFAULT_CARRIER_ID'] || 'carrier-001',
    storeIdByUserId: parseMap(process.env['VEHICLE_PICKUP_STORE_BY_USER_JSON']),
    carrierIdByUserId: parseMap(process.env['VEHICLE_PICKUP_CARRIER_BY_USER_JSON']),
    simulateExecutionFailureOnce: process.env['VEHICLE_PICKUP_SIMULATE_EXECUTION_FAILURE_ONCE'] !== 'false'
  }
}

export function readVehiclePickupEnvDefaults() {
  return VehiclePickupConfigSchema.parse(readVehiclePickupRuntimeConfig())
}
