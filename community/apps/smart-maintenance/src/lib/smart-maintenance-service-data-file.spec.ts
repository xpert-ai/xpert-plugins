import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import * as XLSX from 'xlsx'

const SERVICE_DATA_KEYS = [
  'customers',
  'projects',
  'locations',
  'deviceTypes',
  'devices',
  'faultCategories',
  'departments',
  'roles',
  'personnel',
  'parts',
  'serviceTypes',
  'urgencies',
  'businessContexts',
  'similarCases',
  'workOrderSeeds'
] as const

describe('smart maintenance service data upload file', () => {
  function readSampleData() {
    return JSON.parse(
      readFileSync(join(__dirname, '../../examples/service-data-complete.json'), 'utf8')
    ) as Record<string, unknown>
  }

  it('provides a complete JSON file for service data upload', () => {
    const data = readSampleData()

    expect(data).toHaveProperty('version')
    expect(data).toHaveProperty('customers')
    expect(data).toHaveProperty('projects')
    expect(data).toHaveProperty('locations')
    expect(data).toHaveProperty('deviceTypes')
    expect(data).toHaveProperty('devices')
    expect(data).toHaveProperty('faultCategories')
    expect(data).toHaveProperty('departments')
    expect(data).toHaveProperty('roles')
    expect(data).toHaveProperty('personnel')
    expect(data).toHaveProperty('parts')
    expect(data).toHaveProperty('serviceTypes')
    expect(data).toHaveProperty('urgencies')
    expect(data).toHaveProperty('workOrderSeeds')

    for (const key of SERVICE_DATA_KEYS.filter((key) => key !== 'businessContexts' && key !== 'similarCases')) {
      expect(Array.isArray(data[key])).toBe(true)
      expect((data[key] as unknown[]).length).toBeGreaterThan(0)
    }
  })

  it('provides a complete Excel file for direct upload', () => {
    const filePath = join(__dirname, '../../examples/service-data-complete.xlsx')

    expect(existsSync(filePath)).toBe(true)

    const workbook = XLSX.read(readFileSync(filePath), { type: 'buffer' })

    for (const key of SERVICE_DATA_KEYS) {
      expect(workbook.SheetNames).toContain(key)
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[key], { defval: '' })
      expect(rows.length).toBeGreaterThan(0)
    }
  })
})
