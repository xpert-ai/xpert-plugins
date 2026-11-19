import { Injectable } from '@nestjs/common'
import type { MockVehicle, MockVehicleStatus } from './types'

const DEFAULT_VEHICLES: MockVehicle[] = [
  { vehicleNo: '123334', model: '星云 SUV', storeId: 'store-001', status: 'available' },
  { vehicleNo: '124728', model: '星云 MPV', storeId: 'store-001', status: 'available' },
  { vehicleNo: '555555', model: '远航轿车', storeId: 'store-001', status: 'available' },
  { vehicleNo: '777777', model: '远航 SUV', storeId: 'store-001', status: 'customs_locked' },
  { vehicleNo: '888888', model: '星云跨界车', storeId: 'store-001', status: 'under_maintenance' },
  { vehicleNo: '999999', model: '远航 MPV', storeId: 'store-002', status: 'available' }
]

@Injectable()
export class VehiclePickupMockCatalogService {
  private readonly vehicles = new Map(DEFAULT_VEHICLES.map((vehicle) => [vehicle.vehicleNo, { ...vehicle }]))

  getVehicle(vehicleNo: string): MockVehicle | null {
    const vehicle = this.vehicles.get(vehicleNo.toUpperCase())
    return vehicle ? { ...vehicle } : null
  }

  listVehicles(storeId?: string): MockVehicle[] {
    return [...this.vehicles.values()]
      .filter((vehicle) => !storeId || vehicle.storeId === storeId)
      .map((vehicle) => ({ ...vehicle }))
  }

  setVehicleStatus(vehicleNo: string, status: MockVehicleStatus): MockVehicle | null {
    const vehicle = this.vehicles.get(vehicleNo.toUpperCase())
    if (!vehicle) return null
    vehicle.status = status
    return { ...vehicle }
  }
}
