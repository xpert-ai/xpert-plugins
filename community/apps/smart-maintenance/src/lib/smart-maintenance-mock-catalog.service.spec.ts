import { SmartMaintenanceMockCatalogService } from './smart-maintenance-mock-catalog.service'

describe('SmartMaintenanceMockCatalogService', () => {
  let service: SmartMaintenanceMockCatalogService

  beforeEach(() => {
    service = new SmartMaintenanceMockCatalogService()
  })

  it('returns all first-version catalog groups', () => {
    const catalog = service.getCatalog()

    expect(catalog.deviceTypes.map((item) => item.label)).toContain('中央空调')
    expect(catalog.faultCategories.map((item) => item.label)).toContain('制冷异常')
    expect(catalog.urgencies.map((item) => item.code)).toEqual(['low', 'medium', 'high'])
    expect(catalog.serviceTypes.map((item) => item.code)).toEqual(['repair', 'inspection', 'after_sales', 'other'])
    expect(catalog.departments.map((item) => item.label)).toContain('暖通维修组')
    expect(catalog.roles.map((item) => item.departmentCode)).toContain('hvac')
    expect(catalog.parts.map((item) => item.label)).toContain('温度传感器')
    expect(catalog.businessContexts.map((item) => item.label)).toContain('华东总部园区')
  })

  it('filters recommended parts by device type while preserving generic parts', () => {
    const parts = service.getPartsForDeviceType('中央空调')

    expect(parts.map((item) => item.label)).toContain('温度传感器')
    expect(parts.map((item) => item.label)).toContain('电源模块')
    expect(parts.map((item) => item.label)).not.toContain('打印机硒鼓')
  })

  it('contains the design demo device and location options', () => {
    const catalog = service.getCatalog()

    expect(catalog.deviceTypes.map((item) => item.label)).toEqual(
      expect.arrayContaining(['中央空调', '电梯', '照明系统', '给排水', '门禁系统'])
    )
    expect(catalog.locations.map((item) => item.label)).toEqual(
      expect.arrayContaining(['2号楼3层会议室', '1号楼电梯2号', '地下停车场B区', '1号楼5层卫生间', '3号楼1层大厅'])
    )
  })
})
