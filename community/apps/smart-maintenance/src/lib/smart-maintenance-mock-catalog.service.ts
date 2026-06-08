import { Injectable } from '@nestjs/common'
import type { SmartMaintenanceCatalogOption } from './types'

export interface SmartMaintenanceCatalog {
  deviceTypes: SmartMaintenanceCatalogOption[]
  devices: SmartMaintenanceCatalogOption[]
  faultCategories: SmartMaintenanceCatalogOption[]
  urgencies: SmartMaintenanceCatalogOption[]
  serviceTypes: SmartMaintenanceCatalogOption[]
  locations: SmartMaintenanceCatalogOption[]
  departments: SmartMaintenanceCatalogOption[]
  roles: SmartMaintenanceCatalogOption[]
  parts: SmartMaintenanceCatalogOption[]
  businessContexts: SmartMaintenanceCatalogOption[]
}

@Injectable()
export class SmartMaintenanceMockCatalogService {
  getCatalog(): SmartMaintenanceCatalog {
    return {
      deviceTypes: [
        { code: 'central_ac', label: '中央空调' },
        { code: 'elevator', label: '电梯' },
        { code: 'lighting_system', label: '照明系统' },
        { code: 'water_supply', label: '给排水' },
        { code: 'access_control_system', label: '门禁系统' },
        { code: 'printer', label: '打印机' },
        { code: 'access_control', label: '门禁' },
        { code: 'network', label: '网络设备' },
        { code: 'camera', label: '监控设备' },
        { code: 'freezer', label: '冷柜' },
        { code: 'pos', label: 'POS 机' },
        { code: 'packing_machine', label: '包装机' },
        { code: 'lighting', label: '照明' }
      ],
      devices: [
        { code: 'AC-B2-3F-001', label: '格力中央空调', deviceType: '中央空调', location: '2号楼3层会议室' },
        { code: 'ELV-B1-02', label: '1号楼2号客梯', deviceType: '电梯', location: '1号楼电梯2号' },
        { code: 'LIGHT-B-PARKING', label: '地下停车场B区照明回路', deviceType: '照明系统', location: '地下停车场B区' },
        { code: 'WATER-B1-5F', label: '1号楼5层卫生间供水系统', deviceType: '给排水', location: '1号楼5层卫生间' },
        { code: 'DOOR-B3-1F', label: '3号楼1层大厅门禁读卡器', deviceType: '门禁系统', location: '3号楼1层大厅' },
        { code: 'AC-A3-001', label: 'A 区 3 楼中央空调', deviceType: '中央空调', location: 'A 区 3 楼' },
        { code: 'PRT-F2-002', label: '二楼财务室打印机', deviceType: '打印机', location: '二楼财务室' },
        { code: 'DOOR-B1-001', label: 'B 座一楼门禁', deviceType: '门禁', location: 'B 座一楼' },
        { code: 'NET-3F-CORE', label: '三楼核心交换机', deviceType: '网络设备', location: '三楼弱电间' }
      ],
      faultCategories: [
        { code: 'cooling', label: '制冷异常' },
        { code: 'mechanical_noise', label: '机械异响' },
        { code: 'lighting_fault', label: '照明故障' },
        { code: 'water_pressure', label: '水压异常' },
        { code: 'card_reader', label: '刷卡异常' },
        { code: 'power', label: '无法开机' },
        { code: 'alarm', label: '频繁报警' },
        { code: 'network', label: '网络异常' },
        { code: 'access', label: '无法通行' },
        { code: 'display', label: '显示异常' },
        { code: 'mechanical', label: '机械故障' },
        { code: 'other', label: '其他故障' }
      ],
      urgencies: [
        { code: 'low', label: '低' },
        { code: 'medium', label: '中' },
        { code: 'high', label: '高' }
      ],
      serviceTypes: [
        { code: 'repair', label: '设备维修' },
        { code: 'inspection', label: '巡检排查' },
        { code: 'after_sales', label: '售后支持' },
        { code: 'other', label: '其他服务' }
      ],
      locations: [
        { code: 'building-2-3f-meeting', label: '2号楼3层会议室' },
        { code: 'building-1-elevator-2', label: '1号楼电梯2号' },
        { code: 'parking-b', label: '地下停车场B区' },
        { code: 'building-1-5f-restroom', label: '1号楼5层卫生间' },
        { code: 'building-3-1f-lobby', label: '3号楼1层大厅' },
        { code: 'a-3f', label: 'A 区 3 楼' },
        { code: 'b-1f-lobby', label: 'B 座一楼大厅' },
        { code: 'finance-2f', label: '二楼财务室' },
        { code: 'nanshan-store', label: '深圳南山店' },
        { code: 'line-2', label: '生产线 2 号区域' }
      ],
      departments: [
        { code: 'engineering', label: '工程部' },
        { code: 'hvac', label: '暖通维修组' },
        { code: 'weak_current', label: '弱电运维组' },
        { code: 'it_support', label: 'IT 支持组' },
        { code: 'equipment', label: '设备维修组' },
        { code: 'property_engineering', label: '物业工程组' },
        { code: 'vendor_after_sales', label: '厂商售后组' }
      ],
      roles: [
        { code: 'hvac_engineer_demo', label: '暖通工程师', departmentCode: 'engineering' },
        { code: 'elevator_engineer', label: '电梯维保工程师', departmentCode: 'engineering' },
        { code: 'strong_current_engineer', label: '强电工程师', departmentCode: 'engineering' },
        { code: 'water_electric_engineer', label: '水电工程师', departmentCode: 'engineering' },
        { code: 'weak_current_engineer_demo', label: '弱电工程师', departmentCode: 'engineering' },
        { code: 'hvac_engineer', label: '空调维修工程师', departmentCode: 'hvac' },
        { code: 'weak_current_engineer', label: '弱电工程师', departmentCode: 'weak_current' },
        { code: 'it_ops_engineer', label: 'IT 运维工程师', departmentCode: 'it_support' },
        { code: 'equipment_technician', label: '设备维修技师', departmentCode: 'equipment' },
        { code: 'after_sales_engineer', label: '售后工程师', departmentCode: 'vendor_after_sales' }
      ],
      parts: [
        { code: 'temperature_sensor', label: '温度传感器', deviceType: '中央空调' },
        { code: 'control_panel', label: '控制面板', deviceType: '中央空调' },
        { code: 'compressor_protector', label: '压缩机保护器', deviceType: '中央空调' },
        { code: 'led_tube', label: 'LED灯管', deviceType: '照明系统' },
        { code: 'led_driver', label: '驱动电源', deviceType: '照明系统' },
        { code: 'water_filter', label: '过滤器滤芯', deviceType: '给排水' },
        { code: 'valve_assembly', label: '阀门组件', deviceType: '给排水' },
        { code: 'access_card_reader', label: '门禁读卡器', deviceType: '门禁系统' },
        { code: 'toner', label: '打印机硒鼓', deviceType: '打印机' },
        { code: 'network_module', label: '网络模块', deviceType: '网络设备' },
        { code: 'card_reader', label: '门禁读卡器', deviceType: '门禁' },
        { code: 'camera_power_adapter', label: '摄像头电源适配器', deviceType: '监控设备' },
        { code: 'power_module', label: '电源模块' }
      ],
      businessContexts: [
        { code: 'east-hq', label: '华东总部园区' },
        { code: 'nanshan-store', label: '深圳南山店' },
        { code: 'customer-service-demo', label: '厂商售后演示项目' }
      ]
    }
  }

  getPartsForDeviceType(deviceType?: string | null): SmartMaintenanceCatalogOption[] {
    const parts = this.getCatalog().parts
    if (!deviceType) {
      return parts
    }
    return parts.filter((part) => !part.deviceType || part.deviceType === deviceType)
  }
}
