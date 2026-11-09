import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const rules = require('../dist/lib/vehicle-pickup.rules.js')

const config = {
  storeUserIds: ['store-user'],
  approverUserIds: ['approver-user'],
  carrierUserIds: ['carrier-user'],
  demoSwitchUserIds: ['demo-user'],
  defaultStoreId: 'store-001',
  defaultCarrierId: 'carrier-001',
  storeIdByUserId: {},
  carrierIdByUserId: {},
  simulateExecutionFailureOnce: true
}

test('normalizes and deduplicates vehicle numbers', () => {
  assert.deepEqual(rules.normalizeVehicleNos([' 123334 ', '123334', 'ab-12']), ['123334', 'AB-12'])
})

test('creates stable fingerprints regardless of input order', () => {
  assert.equal(
    rules.requestFingerprint('user-1', ['123334', '124728']),
    rules.requestFingerprint('user-1', ['124728', '123334'])
  )
})

test('only allows cancellation before execution', () => {
  assert.equal(rules.canTransition('applied', 'cancel'), true)
  assert.equal(rules.canTransition('approved', 'cancel'), true)
  assert.equal(rules.canTransition('executed', 'cancel'), false)
  assert.equal(rules.canTransition('rejected', 'cancel'), false)
})

test('resolves configured roles and demo role switching', () => {
  assert.equal(
    rules.resolveActor('store-user', 'tenant-1', 'org-1', undefined, config).role,
    'store'
  )
  assert.equal(
    rules.resolveActor('approver-user', 'tenant-1', 'org-1', undefined, config).role,
    'approver'
  )
  assert.equal(
    rules.resolveActor('demo-user', 'tenant-1', 'org-1', 'carrier', config).role,
    'carrier'
  )
  assert.equal(rules.resolveActor('unknown', 'tenant-1', 'org-1', undefined, config), null)
})

test('builds a compact system rejection reason', () => {
  assert.equal(
    rules.formatSystemRejection([
      { vehicleNo: '123334', message: '车辆存在海关锁，不可自提' },
      { vehicleNo: '124728', message: '车辆正在维护，不可自提' }
    ]),
    '系统驳回：123334 车辆存在海关锁，不可自提；124728 车辆正在维护，不可自提。'
  )
})
