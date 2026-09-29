import { Injectable } from '@nestjs/common'
import type { AgriServiceCatalogOption } from './types'

export interface AgriServiceCatalog {
  deviceTypes: AgriServiceCatalogOption[]
  devices: AgriServiceCatalogOption[]
  faultCategories: AgriServiceCatalogOption[]
  urgencies: AgriServiceCatalogOption[]
  serviceTypes: AgriServiceCatalogOption[]
  locations: AgriServiceCatalogOption[]
  departments: AgriServiceCatalogOption[]
  roles: AgriServiceCatalogOption[]
  parts: AgriServiceCatalogOption[]
  businessContexts: AgriServiceCatalogOption[]
  customers?: AgriServiceCatalogOption[]
  projects?: AgriServiceCatalogOption[]
}

@Injectable()
export class AgriServiceMockCatalogService {
  getCatalog(): AgriServiceCatalog {
    return {
      customers: [
        { code: 'wang', label: '王大叔' },
        { code: 'coop', label: '东河村合作社' },
        { code: 'green', label: '绿野家庭农场' }
      ],
      projects: [
        { code: 'spring_plant', label: '春耕植保' },
        { code: 'rice_patrol', label: '水稻巡查' },
        { code: 'consult', label: '农技咨询' }
      ],
      deviceTypes: [
        { code: 'rice', label: '水稻' },
        { code: 'wheat', label: '小麦' },
        { code: 'corn', label: '玉米' },
        { code: 'soybean', label: '大豆' },
        { code: 'rape', label: '油菜' },
        { code: 'vegetable', label: '蔬菜' },
        { code: 'fruit', label: '果树' },
        { code: 'tea', label: '茶叶' },
        { code: 'other_crop', label: '其他作物' }
      ],
      devices: [
        { code: 'plot-east-3', label: '东河村三组北地', deviceType: '水稻', location: '东河村三组北地' },
        { code: 'plot-east-2', label: '东河村二组南地', deviceType: '水稻', location: '东河村二组南地' },
        { code: 'plot-west-1', label: '西湾一组河滩地', deviceType: '小麦', location: '西湾一组河滩地' },
        { code: 'plot-green-a', label: '绿野农场 A 区', deviceType: '玉米', location: '绿野农场 A 区' },
        { code: 'plot-hill-tea', label: '南岗茶园二号地', deviceType: '茶叶', location: '南岗茶园二号地' },
        { code: 'plot-veg-1', label: '镇东蔬菜基地 1 号棚', deviceType: '蔬菜', location: '镇东蔬菜基地' }
      ],
      faultCategories: [
        { code: 'blast', label: '稻瘟病' },
        { code: 'sheath_blight', label: '纹枯病' },
        { code: 'planthopper', label: '稻飞虱' },
        { code: 'army_worm', label: '粘虫' },
        { code: 'aphid', label: '蚜虫' },
        { code: 'drought', label: '干旱缺水' },
        { code: 'nutrient', label: '缺素黄叶' },
        { code: 'weed', label: '草害' },
        { code: 'consult', label: '技术咨询' },
        { code: 'other', label: '其他问题' }
      ],
      urgencies: [
        { code: 'low', label: '低' },
        { code: 'medium', label: '一般' },
        { code: 'high', label: '紧急' }
      ],
      serviceTypes: [
        { code: 'repair', label: '植保喷施' },
        { code: 'inspection', label: '田间巡查' },
        { code: 'after_sales', label: '农技咨询' },
        { code: 'other', label: '其他农服' }
      ],
      locations: [
        { code: 'donghe-3-north', label: '东河村三组北地' },
        { code: 'donghe-2-south', label: '东河村二组南地' },
        { code: 'xiwan-1', label: '西湾一组河滩地' },
        { code: 'green-a', label: '绿野农场 A 区' },
        { code: 'nangang-tea', label: '南岗茶园二号地' },
        { code: 'zhengdong-veg', label: '镇东蔬菜基地' },
        { code: 'coop-center', label: '东河村合作社晒场' }
      ],
      departments: [
        { code: 'plant_protect', label: '植保服务组' },
        { code: 'field_patrol', label: '田间巡查组' },
        { code: 'tech_consult', label: '农技咨询组' },
        { code: 'township_station', label: '乡镇农服站' },
        { code: 'drone_team', label: '无人机作业组' }
      ],
      roles: [
        { code: 'plant_protect_officer', label: '植保员', departmentCode: 'plant_protect' },
        { code: 'field_inspector', label: '田间巡查员', departmentCode: 'field_patrol' },
        { code: 'agri_advisor', label: '农技员', departmentCode: 'tech_consult' },
        { code: 'station_dispatcher', label: '农服调度', departmentCode: 'township_station' },
        { code: 'drone_operator', label: '飞防手', departmentCode: 'drone_team' }
      ],
      parts: [
        { code: 'tricyclazole', label: '三环唑', deviceType: '水稻' },
        { code: 'rice_blast_agent', label: '稻瘟灵', deviceType: '水稻' },
        { code: 'imidacloprid', label: '吡虫啉', deviceType: '水稻' },
        { code: 'herbicide', label: '选择性除草剂', deviceType: '小麦' },
        { code: 'foliar_fertilizer', label: '叶面肥', deviceType: '玉米' },
        { code: 'fungicide_generic', label: '通用杀菌剂' },
        { code: 'insecticide_generic', label: '通用杀虫剂' }
      ],
      businessContexts: [
        { code: 'donghe-village', label: '东河村农服服务区' },
        { code: 'spring-protect', label: '春耕植保专项' },
        { code: 'coop-demo', label: '合作社统防统治演示' }
      ]
    }
  }

  getPartsForDeviceType(deviceType?: string | null): AgriServiceCatalogOption[] {
    const parts = this.getCatalog().parts
    if (!deviceType) {
      return parts
    }
    return parts.filter((part) => !part.deviceType || part.deviceType === deviceType)
  }
}
