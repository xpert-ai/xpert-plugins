import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MoreThanOrEqual, Not, Repository } from 'typeorm'
import * as XLSX from 'xlsx'
import { SmartMaintenanceMockCatalogService } from './smart-maintenance-mock-catalog.service'
import { SmartMaintenanceServiceData, SmartMaintenanceWorkOrder, SmartMaintenanceWorkOrderLog } from './entities'
import type {
  SmartMaintenanceGeneratedWorkOrderInput,
  SmartMaintenanceLogAction,
  SmartMaintenanceProcessingResult,
  SmartMaintenanceSearchInput,
  SmartMaintenanceServiceDataImportDraft,
  SmartMaintenanceServiceDataImportInput,
  SmartMaintenanceServiceDataPayload,
  SmartMaintenanceServiceDataRecord,
  SmartMaintenanceServiceDataSummary,
  SmartMaintenanceScope,
  SmartMaintenanceSimilarWorkOrderSummary,
  SmartMaintenanceSupplementDraftInput,
  SmartMaintenanceUpdateInput,
  SmartMaintenanceWorkOrderStatus
} from './types'

const EDITABLE_STATUSES: SmartMaintenanceWorkOrderStatus[] = ['pending_confirmation', 'needs_supplement']
const SIMILAR_LOOKBACK_DAYS = 7
const DEMO_OPERATOR_ID = 'smart-maintenance-demo'
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
const SERVICE_DATA_IMPORT_DRAFT_TTL_MS = 30 * 60 * 1000

interface StoredServiceDataImportDraft extends SmartMaintenanceServiceDataImportDraft {
  scopeKey: string
  createdAt: number
}

const serviceDataImportDrafts = new Map<string, StoredServiceDataImportDraft>()

const SERVICE_DATA_SHEET_KEYS: Record<string, keyof SmartMaintenanceServiceDataPayload> = {
  customers: 'customers',
  customer: 'customers',
  '客户': 'customers',
  '客户表': 'customers',
  projects: 'projects',
  project: 'projects',
  '项目': 'projects',
  '项目表': 'projects',
  locations: 'locations',
  location: 'locations',
  sites: 'locations',
  site: 'locations',
  '场所': 'locations',
  '场所表': 'locations',
  deviceTypes: 'deviceTypes',
  device_types: 'deviceTypes',
  deviceType: 'deviceTypes',
  '设备类型': 'deviceTypes',
  devices: 'devices',
  device: 'devices',
  '设备': 'devices',
  '设备目录': 'devices',
  faultCategories: 'faultCategories',
  fault_categories: 'faultCategories',
  faults: 'faultCategories',
  '故障分类': 'faultCategories',
  departments: 'departments',
  department: 'departments',
  '部门': 'departments',
  '处理部门': 'departments',
  roles: 'roles',
  role: 'roles',
  '岗位': 'roles',
  personnel: 'personnel',
  staff: 'personnel',
  people: 'personnel',
  '人员': 'personnel',
  '岗位人员': 'personnel',
  parts: 'parts',
  part: 'parts',
  '备件': 'parts',
  '备件目录': 'parts',
  serviceTypes: 'serviceTypes',
  service_types: 'serviceTypes',
  '服务类型': 'serviceTypes',
  urgencies: 'urgencies',
  urgency: 'urgencies',
  '紧急程度': 'urgencies',
  businessContexts: 'businessContexts',
  business_contexts: 'businessContexts',
  '业务上下文': 'businessContexts',
  similarCases: 'similarCases',
  similar_cases: 'similarCases',
  '相似案例': 'similarCases',
  workOrderSeeds: 'workOrderSeeds',
  work_order_seeds: 'workOrderSeeds',
  '工单种子': 'workOrderSeeds'
}

type DemoWorkOrder = Partial<SmartMaintenanceWorkOrder> & {
  workOrderNo: string
  status: SmartMaintenanceWorkOrderStatus
  sourceType: NonNullable<SmartMaintenanceWorkOrder['sourceType']>
  originalContent: string
  createdAt: Date
  updatedAt: Date
  demoLogs: Array<{
    action: SmartMaintenanceLogAction
    reason?: string
    remark?: string
    createdAt: Date
  }>
}

const DESIGN_DEMO_WORK_ORDERS: DemoWorkOrder[] = [
  {
    workOrderNo: 'MT-20250526-0001',
    status: 'pending_confirmation',
    sourceType: 'workbench_form',
    title: '2号楼3层会议室中央空调不制冷',
    originalContent: '2号楼3层会议室的格力中央空调不制冷，遥控器显示E4故障代码，出风口几乎没有冷风，会议马上要开始了，请尽快处理。',
    customerName: 'XX科技有限公司',
    projectName: '总部大厦项目',
    siteName: '2号楼3层会议室',
    reporterName: '张三',
    reporterDepartment: '行政部',
    reporterContact: '138****1234',
    deviceType: '中央空调',
    deviceName: '格力中央空调',
    faultCategory: '制冷异常',
    faultPhenomenon: '不制冷，显示E4故障代码',
    faultCode: 'E4',
    location: '2号楼3层会议室',
    impactScope: '会议室区域',
    urgency: 'high',
    serviceType: 'repair',
    needOnsite: true,
    aiDiagnosis: '疑似空调温度传感器或控制面板异常，E4 故障代码需要现场复核。',
    possibleCauses: ['温度传感器异常', '控制面板故障', '制冷系统保护停机'],
    suggestedAction: '建议优先检查 E4 对应传感器读数，再检查控制面板和压缩机保护状态。',
    completenessTips: ['未识别到设备编号，请补充设备编号', '未识别到预约时间，请补充预约时间', '未识别到是否需要上门，请确认是否需要上门'],
    aiConfidence: 0.92,
    aiRawResult: {
      source: 'demo',
      confidence: 0.92,
      extractedAt: '2025-05-26 10:30'
    },
    recommendedDepartment: '工程部',
    recommendedRole: '暖通工程师',
    recommendedDispatchAdvice: '建议安排暖通工程师尽快到场，会议开始前优先处理。',
    suggestedParts: ['温度传感器', '控制面板'],
    confirmedDepartment: '工程部',
    confirmedRole: '暖通工程师',
    confirmedDispatchAdvice: '安排工程部暖通工程师优先到场。',
    confirmedParts: ['温度传感器', '控制面板'],
    processingRemark: '请尽快安排现场检修，会议即将开始。',
    hasMultipleIssues: false,
    similarWorkOrders: [
      {
        id: 'demo-similar-1',
        workOrderNo: 'MT-20250525-0006',
        title: '2号楼空调制冷效果差',
        status: 'processing',
        deviceType: '中央空调',
        location: '2号楼3层',
        faultCategory: '制冷异常',
        faultPhenomenon: '制冷效果差',
        createdAt: '2025-05-25T08:45:00.000+08:00'
      }
    ],
    createdAt: dateInShanghai('2025-05-26 10:30'),
    updatedAt: dateInShanghai('2025-05-26 10:30'),
    demoLogs: [
      {
        action: 'ai_generated',
        remark: 'AI 识别报修信息并生成待确认工单。',
        createdAt: dateInShanghai('2025-05-26 10:30')
      }
    ]
  },
  {
    workOrderNo: 'MT-20250526-0002',
    status: 'needs_supplement',
    sourceType: 'agent_chat',
    title: '1号楼2号客梯运行异响',
    originalContent: '1号楼电梯2号运行时有明显异响，乘坐时能听到轿厢上方有摩擦声，请安排人员检查。',
    customerName: 'XX科技有限公司',
    projectName: '总部大厦项目',
    siteName: '1号楼电梯2号',
    reporterName: '李四',
    reporterDepartment: '物业部',
    reporterContact: '136****5678',
    deviceType: '电梯',
    deviceName: '客梯',
    faultCategory: '机械异响',
    faultPhenomenon: '运行时有异响',
    location: '1号楼电梯2号',
    impactScope: '乘客乘坐体验',
    urgency: 'medium',
    serviceType: 'repair',
    needOnsite: true,
    aiDiagnosis: '电梯运行异响可能与导靴、曳引系统或轿厢部件松动有关，需要补充型号和发生时间后安排维保。',
    possibleCauses: ['导靴磨损', '轿厢部件松动', '曳引系统异常'],
    suggestedAction: '先补充电梯型号、故障发生时间和使用频率，再安排电梯维保工程师现场检查。',
    completenessTips: ['未识别到设备型号', '未识别到故障发生时间', '请补充电梯使用频率'],
    aiConfidence: 0.78,
    recommendedDepartment: '工程部',
    recommendedRole: '电梯维保工程师',
    recommendedDispatchAdvice: '补齐信息后安排电梯维保单位到场检查。',
    confirmedDepartment: '工程部',
    confirmedRole: '电梯维保工程师',
    processingRemark: '补充电梯使用频率、设备型号和故障发生时间。',
    createdAt: dateInShanghai('2025-05-26 09:15'),
    updatedAt: dateInShanghai('2025-05-26 09:20'),
    demoLogs: [
      {
        action: 'ai_generated',
        remark: 'Assistant 对话生成待确认工单。',
        createdAt: dateInShanghai('2025-05-26 09:15')
      },
      {
        action: 'mark_needs_supplement',
        reason: '补充电梯使用频率、设备型号和故障发生时间。',
        createdAt: dateInShanghai('2025-05-26 09:20')
      }
    ]
  },
  {
    workOrderNo: 'MT-20250525-0009',
    status: 'processing',
    sourceType: 'workbench_form',
    title: '地下停车场B区部分照明不亮',
    originalContent: '地下停车场B区有一排灯不亮，晚间车辆通行视线较差，请尽快检查。',
    customerName: 'XX科技有限公司',
    projectName: '总部大厦项目',
    siteName: '地下停车场B区',
    reporterName: '王五',
    reporterDepartment: '安保部',
    reporterContact: '139****2468',
    deviceType: '照明系统',
    deviceName: '地下停车场照明回路',
    faultCategory: '照明故障',
    faultPhenomenon: '部分灯不亮',
    location: '地下停车场B区',
    impactScope: '停车场B区通行照明',
    urgency: 'medium',
    serviceType: 'repair',
    needOnsite: true,
    aiDiagnosis: '可能存在灯管损坏、驱动电源异常或回路开关跳闸。',
    possibleCauses: ['灯管损坏', '驱动电源异常', '回路开关跳闸'],
    suggestedAction: '检查照明回路开关和故障灯具，必要时更换驱动电源。',
    completenessTips: ['请确认故障灯具数量'],
    aiConfidence: 0.84,
    recommendedDepartment: '工程部',
    recommendedRole: '强电工程师',
    recommendedDispatchAdvice: '安排强电工程师现场检查停车场照明回路。',
    suggestedParts: ['LED灯管', '驱动电源'],
    confirmedDepartment: '工程部',
    confirmedRole: '强电工程师',
    confirmedDispatchAdvice: '现场检查照明回路后更换故障灯具。',
    confirmedParts: ['LED灯管', '驱动电源'],
    processingRemark: '已安排现场检查中。',
    processingStartedAt: dateInShanghai('2025-05-25 16:50'),
    createdAt: dateInShanghai('2025-05-25 16:45'),
    updatedAt: dateInShanghai('2025-05-25 16:50'),
    demoLogs: [
      {
        action: 'ai_generated',
        remark: 'AI 识别报修信息并生成工单。',
        createdAt: dateInShanghai('2025-05-25 16:45')
      },
      {
        action: 'confirm_processing',
        remark: '已安排现场检查中。',
        createdAt: dateInShanghai('2025-05-25 16:50')
      }
    ]
  },
  {
    workOrderNo: 'MT-20250524-0008',
    status: 'processed',
    sourceType: 'agent_chat',
    title: '1号楼5层卫生间水压不足',
    originalContent: '1号楼5层卫生间水压不足，多个水龙头出水很小，影响正常使用。',
    customerName: 'XX科技有限公司',
    projectName: '总部大厦项目',
    siteName: '1号楼5层卫生间',
    reporterName: '赵六',
    reporterDepartment: '行政部',
    reporterContact: '137****9876',
    deviceType: '给排水',
    deviceName: '卫生间供水系统',
    faultCategory: '水压异常',
    faultPhenomenon: '水压不足',
    location: '1号楼5层卫生间',
    impactScope: '楼层卫生间',
    urgency: 'medium',
    serviceType: 'repair',
    needOnsite: true,
    aiDiagnosis: '可能存在过滤器堵塞、管路阀门开度不足或增压设备异常。',
    possibleCauses: ['过滤器堵塞', '阀门开度不足', '增压设备异常'],
    suggestedAction: '检查楼层供水阀门、过滤器和增压设备运行状态。',
    aiConfidence: 0.86,
    recommendedDepartment: '工程部',
    recommendedRole: '水电工程师',
    recommendedDispatchAdvice: '安排水电工程师现场排查供水系统。',
    suggestedParts: ['过滤器滤芯', '阀门组件'],
    confirmedDepartment: '工程部',
    confirmedRole: '水电工程师',
    confirmedParts: ['过滤器滤芯', '阀门组件'],
    processingRemark: '检查供水阀门和过滤器。',
    processingStartedAt: dateInShanghai('2025-05-24 14:20'),
    processingResult: 'fixed',
    processingSummary: '更换了过滤器滤芯并调整阀门开度，水压恢复正常。',
    processedAt: dateInShanghai('2025-05-24 15:30'),
    processingDurationMinutes: 70,
    createdAt: dateInShanghai('2025-05-24 14:20'),
    updatedAt: dateInShanghai('2025-05-24 15:30'),
    demoLogs: [
      {
        action: 'ai_generated',
        remark: 'Assistant 对话生成待确认工单。',
        createdAt: dateInShanghai('2025-05-24 14:20')
      },
      {
        action: 'confirm_processing',
        remark: '检查供水阀门和过滤器。',
        createdAt: dateInShanghai('2025-05-24 14:25')
      },
      {
        action: 'mark_processed',
        remark: '更换了过滤器滤芯并调整阀门开度，水压恢复正常。',
        createdAt: dateInShanghai('2025-05-24 15:30')
      }
    ]
  },
  {
    workOrderNo: 'MT-20250524-0007',
    status: 'rejected',
    sourceType: 'workbench_form',
    title: '3号楼1层大厅门禁刷卡无反应',
    originalContent: '3号楼1层大厅门禁刷卡无反应，员工无法正常进入大厅。',
    customerName: 'XX科技有限公司',
    projectName: '总部大厦项目',
    siteName: '3号楼1层大厅',
    reporterName: '孙七',
    reporterDepartment: '前台',
    reporterContact: '135****1122',
    deviceType: '门禁系统',
    deviceName: '大厅门禁读卡器',
    faultCategory: '刷卡异常',
    faultPhenomenon: '刷卡无反应',
    location: '3号楼1层大厅',
    impactScope: '大厅入口通行',
    urgency: 'medium',
    serviceType: 'repair',
    needOnsite: true,
    aiDiagnosis: '可能为读卡器供电、网络或门禁控制器异常。',
    possibleCauses: ['读卡器供电异常', '网络连接异常', '门禁控制器异常'],
    suggestedAction: '检查读卡器供电、网络连接和控制器在线状态。',
    aiConfidence: 0.81,
    recommendedDepartment: '工程部',
    recommendedRole: '弱电工程师',
    recommendedDispatchAdvice: '建议弱电工程师现场核查读卡器和控制器。',
    suggestedParts: ['门禁读卡器', '网络模块'],
    rejectionReason: '该问题已由门禁系统供应商处理，重复报修关闭。',
    rejectedAt: dateInShanghai('2025-05-24 11:15'),
    createdAt: dateInShanghai('2025-05-24 11:05'),
    updatedAt: dateInShanghai('2025-05-24 11:15'),
    demoLogs: [
      {
        action: 'ai_generated',
        remark: 'AI 识别报修信息并生成待确认工单。',
        createdAt: dateInShanghai('2025-05-24 11:05')
      },
      {
        action: 'reject_closed',
        reason: '该问题已由门禁系统供应商处理，重复报修关闭。',
        createdAt: dateInShanghai('2025-05-24 11:15')
      }
    ]
  }
]

@Injectable()
export class SmartMaintenanceService {
  constructor(
    @InjectRepository(SmartMaintenanceWorkOrder)
    private readonly workOrderRepository: Repository<SmartMaintenanceWorkOrder>,
    @InjectRepository(SmartMaintenanceWorkOrderLog)
    private readonly logRepository: Repository<SmartMaintenanceWorkOrderLog>,
    @InjectRepository(SmartMaintenanceServiceData)
    private readonly serviceDataRepository: Repository<SmartMaintenanceServiceData>,
    private readonly catalogService: SmartMaintenanceMockCatalogService
  ) {}

  async saveGeneratedWorkOrder(input: SmartMaintenanceGeneratedWorkOrderInput, scope: SmartMaintenanceScope) {
    const originalContent = trimToUndefined(input.originalContent)
    if (!originalContent) {
      throw new BadRequestException('originalContent is required')
    }

    const normalizedInput = await this.normalizeGeneratedWorkOrderInput(scope, input)
    const similarWorkOrders = await this.findSimilarWorkOrders(scope, normalizedInput)
    const now = new Date()
    const completenessTips = normalizeCompletenessTips(normalizedInput)

    return this.workOrderRepository.manager.transaction(async (manager) => {
      const workOrderRepository = manager.getRepository(SmartMaintenanceWorkOrder)
      const logRepository = manager.getRepository(SmartMaintenanceWorkOrderLog)
      const workOrder = await workOrderRepository.save(
        workOrderRepository.create({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId ?? undefined,
          createdById: scope.userId ?? undefined,
          assistantId: scope.assistantId ?? undefined,
          conversationId: scope.conversationId ?? undefined,
          workOrderNo: generateWorkOrderNo(now),
          status: completenessTips?.length ? 'needs_supplement' : 'pending_confirmation',
          sourceType: normalizedInput.sourceType ?? 'agent_chat',
          title: trimToUndefined(normalizedInput.title) ?? buildTitle(normalizedInput),
          originalContent,
          customerName: trimToUndefined(normalizedInput.customerName),
          projectName: trimToUndefined(normalizedInput.projectName),
          siteName: trimToUndefined(normalizedInput.siteName),
          reporterName: trimToUndefined(normalizedInput.reporterName),
          reporterDepartment: trimToUndefined(normalizedInput.reporterDepartment),
          reporterContact: trimToUndefined(normalizedInput.reporterContact),
          deviceType: trimToUndefined(normalizedInput.deviceType),
          deviceName: trimToUndefined(normalizedInput.deviceName),
          deviceNo: trimToUndefined(normalizedInput.deviceNo),
          faultCategory: trimToUndefined(normalizedInput.faultCategory),
          faultPhenomenon: trimToUndefined(normalizedInput.faultPhenomenon),
          faultCode: trimToUndefined(normalizedInput.faultCode),
          location: trimToUndefined(normalizedInput.location),
          impactScope: trimToUndefined(normalizedInput.impactScope),
          urgency: normalizedInput.urgency,
          serviceType: normalizedInput.serviceType,
          needOnsite: normalizedInput.needOnsite,
          aiDiagnosis: trimToUndefined(normalizedInput.aiDiagnosis),
          possibleCauses: normalizeStringArray(normalizedInput.possibleCauses),
          suggestedAction: trimToUndefined(normalizedInput.suggestedAction),
          completenessTips,
          aiConfidence: normalizedInput.aiConfidence,
          aiRawResult: normalizedInput.aiRawResult,
          recommendedDepartment: trimToUndefined(normalizedInput.recommendedDepartment),
          recommendedRole: trimToUndefined(normalizedInput.recommendedRole),
          recommendedDispatchAdvice: trimToUndefined(normalizedInput.recommendedDispatchAdvice),
          suggestedParts: normalizeStringArray(normalizedInput.suggestedParts),
          confirmedDepartment: trimToUndefined(normalizedInput.recommendedDepartment),
          confirmedRole: trimToUndefined(normalizedInput.recommendedRole),
          confirmedDispatchAdvice: trimToUndefined(normalizedInput.recommendedDispatchAdvice),
          confirmedParts: normalizeStringArray(normalizedInput.suggestedParts),
          hasMultipleIssues: normalizedInput.hasMultipleIssues,
          multipleIssueTip: trimToUndefined(normalizedInput.multipleIssueTip),
          similarWorkOrders,
          lastOperatorId: scope.userId ?? undefined,
          lastOperatedAt: now
        })
      )

      await this.writeLogWithRepository(logRepository, scope, workOrder, 'ai_generated', {
        remark: 'AI generated smart maintenance work order.',
        snapshot: toWorkOrderSnapshot(workOrder)
      })

      return workOrder
    })
  }

  async getViewData(
    scope: SmartMaintenanceScope,
    input: {
      viewMode?: 'report' | 'review'
      workOrderId?: string
      status?: SmartMaintenanceWorkOrderStatus
      deviceType?: string
      urgency?: string
      search?: string
      page?: number
      pageSize?: number
    } = {}
  ) {
    await this.ensureDemoWorkOrders(scope)
    const page = input.page ?? 1
    const pageSize = input.pageSize ?? 20
    const allItems = await this.findScopedWorkOrders(scope)
    const filtered = filterWorkOrders(allItems, input)
    const selected = input.workOrderId
      ? await this.getWorkOrderDetail(scope, input.workOrderId)
      : filtered[0]
        ? await this.getWorkOrderDetail(scope, filtered[0].id as string)
        : null
    const start = Math.max(0, (page - 1) * pageSize)
    const latestServiceData = await this.findLatestServiceData(scope)

    return {
      items: filtered.slice(start, start + pageSize).map(toWorkOrderListItem),
      total: filtered.length,
      item: selected ? toWorkOrderDetailItem(selected.workOrder, selected.logs) : undefined,
      summary: {
        mode: selected ? 'detail' : 'empty',
        stats: buildStats(allItems),
        latestWorkOrder: allItems[0] ? toWorkOrderListItem(allItems[0]) : undefined
      },
      meta: {
        catalog: latestServiceData?.serviceData ? serviceDataToCatalog(latestServiceData.serviceData) : await this.getCurrentCatalog(scope),
        latestServiceData: latestServiceData
          ? {
              id: latestServiceData.id,
              fileName: latestServiceData.fileName,
              importMode: latestServiceData.importMode,
              importedAt: latestServiceData.importedAt,
              summary: latestServiceData.summary
            }
          : undefined
      }
    }
  }

  async searchWorkOrders(scope: SmartMaintenanceScope, input: SmartMaintenanceSearchInput = {}) {
    await this.ensureDemoWorkOrders(scope)
    const page = Math.max(1, input.page ?? 1)
    const pageSize = Math.min(50, Math.max(1, input.pageSize ?? 10))
    const allItems = await this.findScopedWorkOrders(scope)
    const filtered = filterWorkOrders(allItems, input)
    const start = Math.max(0, (page - 1) * pageSize)

    return {
      items: filtered.slice(start, start + pageSize).map(toWorkOrderListItem),
      total: filtered.length,
      page,
      pageSize,
      summary: {
        stats: buildStats(allItems),
        latestWorkOrder: allItems[0] ? toWorkOrderListItem(allItems[0]) : undefined
      }
    }
  }

  async getWorkOrderDetail(scope: SmartMaintenanceScope, workOrderId: string) {
    const workOrder = await this.getScopedWorkOrder(scope, workOrderId)
    const logs = await this.logRepository.find({
      where: {
        ...this.scopeWhere(scope),
        workOrderId
      },
      order: {
        createdAt: 'ASC'
      }
    })
    return { workOrder, logs }
  }

  async getWorkOrderDetailForAgent(scope: SmartMaintenanceScope, workOrderId: string) {
    const { workOrder, logs } = await this.getWorkOrderDetail(scope, workOrderId)
    return toWorkOrderDetailItem(workOrder, logs)
  }

  async updateWorkOrder(scope: SmartMaintenanceScope, workOrderId: string, input: SmartMaintenanceUpdateInput) {
    const workOrder = await this.getScopedWorkOrder(scope, workOrderId)
    this.assertEditable(workOrder)
    const before = toWorkOrderSnapshot(workOrder)
    const updated = await this.workOrderRepository.save({
      ...workOrder,
      ...pickUpdateFields(input),
      lastOperatorId: scope.userId ?? undefined,
      lastOperatedAt: new Date()
    })
    await this.writeLog(scope, updated, 'field_updated', {
      changedFields: diffSnapshots(before, toWorkOrderSnapshot(updated)),
      remark: 'Human updated smart maintenance work order fields.'
    })
    return updated
  }

  async markNeedsSupplement(scope: SmartMaintenanceScope, workOrderId: string, input: { reason?: string; remark?: string }) {
    const reason = trimToUndefined(input.reason) ?? trimToUndefined(input.remark)
    if (!reason) {
      throw new BadRequestException('supplement reason is required')
    }
    const workOrder = await this.getScopedWorkOrder(scope, workOrderId)
    if (workOrder.status !== 'pending_confirmation') {
      throw new BadRequestException('Only pending confirmation work orders can be marked as needs supplement')
    }
    const updated = await this.workOrderRepository.save({
      ...workOrder,
      status: 'needs_supplement',
      lastOperatorId: scope.userId ?? undefined,
      lastOperatedAt: new Date()
    })
    await this.writeLog(scope, updated, 'mark_needs_supplement', { reason })
    return updated
  }

  async saveSupplement(scope: SmartMaintenanceScope, workOrderId: string, input: SmartMaintenanceUpdateInput & { remark?: string }) {
    const workOrder = await this.getScopedWorkOrder(scope, workOrderId)
    if (workOrder.status !== 'needs_supplement') {
      throw new BadRequestException('Only needs supplement work orders can save supplement')
    }
    const before = toWorkOrderSnapshot(workOrder)
    const updated = await this.workOrderRepository.save({
      ...workOrder,
      ...pickUpdateFields(input),
      status: 'pending_confirmation',
      aiSupplementDraft: null,
      aiSupplementDraftedAt: null,
      lastOperatorId: scope.userId ?? undefined,
      lastOperatedAt: new Date()
    })
    await this.writeLog(scope, updated, 'supplement_saved', {
      remark: trimToUndefined(input.remark),
      changedFields: diffSnapshots(before, toWorkOrderSnapshot(updated))
    })
    return updated
  }

  async prepareSupplementDraft(scope: SmartMaintenanceScope, workOrderId: string, input: SmartMaintenanceSupplementDraftInput) {
    const supplementContent = trimToUndefined(input.supplementContent)
    if (!supplementContent && !input.draft) {
      throw new BadRequestException('supplementContent or draft is required')
    }
    const workOrder = await this.getScopedWorkOrder(scope, workOrderId)
    if (workOrder.status !== 'needs_supplement') {
      throw new BadRequestException('Only needs supplement work orders can prepare supplement draft')
    }
    const now = new Date()
    const draft = buildSupplementDraft(input)
    const updated = await this.workOrderRepository.save({
      ...workOrder,
      aiSupplementDraft: draft,
      aiSupplementDraftedAt: now,
      lastOperatorId: scope.userId ?? undefined,
      lastOperatedAt: now
    })
    await this.writeLog(scope, updated, 'supplement_draft_prepared', {
      remark: supplementContent ?? draft.rationale ?? 'AI prepared smart maintenance supplement draft.',
      snapshot: draft
    })
    return updated
  }

  async confirmProcessing(scope: SmartMaintenanceScope, workOrderId: string, input: SmartMaintenanceUpdateInput) {
    const workOrder = await this.getScopedWorkOrder(scope, workOrderId)
    if (workOrder.status !== 'pending_confirmation') {
      throw new BadRequestException('Only pending confirmation work orders can be confirmed for processing')
    }
    const merged = {
      ...workOrder,
      ...pickUpdateFields(input),
      confirmedDepartment: trimToUndefined(input.confirmedDepartment) ?? workOrder.confirmedDepartment ?? workOrder.recommendedDepartment,
      confirmedRole: trimToUndefined(input.confirmedRole) ?? workOrder.confirmedRole ?? workOrder.recommendedRole,
      confirmedDispatchAdvice:
        trimToUndefined(input.confirmedDispatchAdvice) ?? workOrder.confirmedDispatchAdvice ?? workOrder.recommendedDispatchAdvice,
      confirmedParts: normalizeStringArray(input.confirmedParts) ?? workOrder.confirmedParts ?? workOrder.suggestedParts,
      processingRemark: trimToUndefined(input.processingRemark) ?? workOrder.processingRemark
    }
    assertConfirmProcessingRequiredFields(merged)
    const updated = await this.workOrderRepository.save({
      ...merged,
      status: 'processing',
      processingStartedAt: new Date(),
      lastOperatorId: scope.userId ?? undefined,
      lastOperatedAt: new Date()
    })
    await this.writeLog(scope, updated, 'confirm_processing', { remark: updated.processingRemark })
    return updated
  }

  async markProcessed(
    scope: SmartMaintenanceScope,
    workOrderId: string,
    input: { processingResult?: SmartMaintenanceProcessingResult; processingSummary?: string }
  ) {
    const processingResult = input.processingResult
    const processingSummary = trimToUndefined(input.processingSummary)
    if (!processingResult || !processingSummary) {
      throw new BadRequestException('processingResult and processingSummary are required')
    }
    const workOrder = await this.getScopedWorkOrder(scope, workOrderId)
    if (workOrder.status !== 'processing') {
      throw new BadRequestException('Only processing work orders can be marked processed')
    }
    const processedAt = new Date()
    const updated = await this.workOrderRepository.save({
      ...workOrder,
      status: 'processed',
      processingResult,
      processingSummary,
      processedAt,
      processingDurationMinutes: calculateDurationMinutes(workOrder.processingStartedAt, processedAt),
      lastOperatorId: scope.userId ?? undefined,
      lastOperatedAt: processedAt
    })
    await this.writeLog(scope, updated, 'mark_processed', { remark: processingSummary })
    return updated
  }

  async rejectAndClose(scope: SmartMaintenanceScope, workOrderId: string, input: { reason?: string }) {
    const reason = trimToUndefined(input.reason)
    if (!reason) {
      throw new BadRequestException('rejection reason is required')
    }
    const workOrder = await this.getScopedWorkOrder(scope, workOrderId)
    if (workOrder.status !== 'pending_confirmation' && workOrder.status !== 'needs_supplement') {
      throw new BadRequestException('Only pending confirmation or needs supplement work orders can be rejected')
    }
    const rejectedAt = new Date()
    const updated = await this.workOrderRepository.save({
      ...workOrder,
      status: 'rejected',
      rejectionReason: reason,
      rejectedAt,
      lastOperatorId: scope.userId ?? undefined,
      lastOperatedAt: rejectedAt
    })
    await this.writeLog(scope, updated, 'reject_closed', { reason })
    return updated
  }

  async getMockCatalog() {
    return this.catalogService.getCatalog()
  }

  private async normalizeGeneratedWorkOrderInput(
    scope: SmartMaintenanceScope,
    input: SmartMaintenanceGeneratedWorkOrderInput
  ): Promise<SmartMaintenanceGeneratedWorkOrderInput> {
    const latest = await this.findLatestServiceData(scope)
    const scopeFields = resolveServiceDataScopeFields(latest?.serviceData, input)
    if (!scopeFields) {
      return input
    }

    return {
      ...input,
      customerName: trimToUndefined(input.customerName) ?? scopeFields.customerName,
      projectName: trimToUndefined(input.projectName) ?? scopeFields.projectName,
      siteName: trimToUndefined(input.siteName) ?? scopeFields.siteName,
      location: trimToUndefined(input.location) ?? trimToUndefined(input.siteName) ?? scopeFields.location,
      deviceType: trimToUndefined(input.deviceType) ?? scopeFields.deviceType,
      deviceName: trimToUndefined(input.deviceName) ?? scopeFields.deviceName,
      deviceNo: trimToUndefined(input.deviceNo) ?? scopeFields.deviceNo
    }
  }

  async getCurrentCatalog(scope: SmartMaintenanceScope) {
    const latest = await this.findLatestServiceData(scope)
    if (!latest?.serviceData) {
      return this.catalogService.getCatalog()
    }
    return serviceDataToCatalog(latest.serviceData)
  }

  async importServiceData(scope: SmartMaintenanceScope, input: SmartMaintenanceServiceDataImportInput) {
    const draft = input.importDraftId ? this.consumeServiceDataImportDraft(scope, input.importDraftId) : undefined
    const serviceData = normalizeServiceDataPayload(draft?.serviceData ?? input.serviceData)
    const summary = buildServiceDataSummary(serviceData)
    if (!hasAnyServiceData(summary)) {
      throw new BadRequestException('serviceData is required')
    }
    const row = await this.serviceDataRepository.save(
      this.serviceDataRepository.create({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId ?? undefined,
        assistantId: scope.assistantId ?? undefined,
        conversationId: scope.conversationId ?? undefined,
        importedById: scope.userId ?? undefined,
        fileName: trimToUndefined(input.fileName) ?? draft?.fileName,
        importMode: input.importMode ?? draft?.importMode ?? 'replace',
        serviceData,
        summary,
        importedAt: new Date()
      })
    )
    return row
  }

  async prepareServiceDataImportDraft(scope: SmartMaintenanceScope, input: {
    fileName?: string
    mimeType?: string
    size?: number
    buffer: Buffer
  }): Promise<SmartMaintenanceServiceDataImportDraft> {
    if (!input.buffer?.length) {
      throw new BadRequestException('file is required')
    }
    const fileName = trimToUndefined(input.fileName) ?? 'service-data'
    const serviceData = normalizeServiceDataPayload(parseServiceDataFile(fileName, input.mimeType, input.buffer))
    const summary = buildServiceDataSummary(serviceData)
    if (!hasAnyServiceData(summary)) {
      throw new BadRequestException('No service data rows were found in the uploaded file')
    }
    const importDraftId = createServiceDataImportDraftId()
    const draft: SmartMaintenanceServiceDataImportDraft = {
      importDraftId,
      fileName,
      mimeType: trimToUndefined(input.mimeType),
      size: input.size,
      importMode: 'replace',
      summary,
      serviceData
    }
    serviceDataImportDrafts.set(importDraftId, {
      ...draft,
      scopeKey: serviceDataDraftScopeKey(scope),
      createdAt: Date.now()
    })
    this.pruneServiceDataImportDrafts()
    return draft
  }

  private async ensureDemoWorkOrders(scope: SmartMaintenanceScope) {
    const existing = await this.workOrderRepository.find({
      where: this.scopeWhere(scope)
    })
    const existingDemoNos = new Set(existing.map((item) => item.workOrderNo).filter(Boolean))
    const missingDemoWorkOrders = DESIGN_DEMO_WORK_ORDERS.filter((demo) => !existingDemoNos.has(demo.workOrderNo))
    if (!missingDemoWorkOrders.length) {
      return
    }

    await this.workOrderRepository.manager.transaction(async (manager) => {
      const workOrderRepository = manager.getRepository(SmartMaintenanceWorkOrder)
      const logRepository = manager.getRepository(SmartMaintenanceWorkOrderLog)

      for (const demo of missingDemoWorkOrders) {
        const { demoLogs, ...workOrderInput } = demo
        const workOrder = await workOrderRepository.save(
          workOrderRepository.create({
            ...workOrderInput,
            tenantId: scope.tenantId,
            organizationId: scope.organizationId ?? undefined,
            createdById: scope.userId ?? undefined,
            assistantId: scope.assistantId ?? undefined,
            conversationId: scope.conversationId ?? undefined,
            lastOperatorId: scope.userId ?? DEMO_OPERATOR_ID,
            lastOperatorName: '维保审核员',
            lastOperatedAt: workOrderInput.updatedAt
          })
        )

        for (const log of demoLogs) {
          await logRepository.save(
            logRepository.create({
              tenantId: scope.tenantId,
              organizationId: scope.organizationId ?? undefined,
              workOrderId: workOrder.id,
              action: log.action,
              operatorId: scope.userId ?? DEMO_OPERATOR_ID,
              operatorName: log.action === 'ai_generated' ? 'AI Agent' : '维保审核员',
              reason: log.reason,
              remark: log.remark,
              snapshot: toWorkOrderSnapshot(workOrder),
              createdAt: log.createdAt
            })
          )
        }
      }
    })
  }

  private async findSimilarWorkOrders(
    scope: SmartMaintenanceScope,
    input: SmartMaintenanceGeneratedWorkOrderInput
  ): Promise<SmartMaintenanceSimilarWorkOrderSummary[]> {
    const deviceType = trimToUndefined(input.deviceType)
    const location = trimToUndefined(input.location)
    if (!deviceType || !location) {
      return []
    }
    const since = new Date()
    since.setDate(since.getDate() - SIMILAR_LOOKBACK_DAYS)
    const candidates = await this.workOrderRepository.find({
      where: {
        ...this.scopeWhere(scope),
        deviceType,
        location,
        status: Not('processed'),
        createdAt: MoreThanOrEqual(since)
      },
      order: {
        createdAt: 'DESC'
      },
      take: 5
    })
    const faultText = [input.faultCategory, input.faultPhenomenon].filter(Boolean).join(' ')
    return candidates
      .filter((item) => item.status !== 'rejected')
      .filter((item) => !faultText || hasTextOverlap(faultText, [item.faultCategory, item.faultPhenomenon].filter(Boolean).join(' ')))
      .slice(0, 3)
      .map(toSimilarSummary)
  }

  private async findScopedWorkOrders(scope: SmartMaintenanceScope) {
    return this.workOrderRepository.find({
      where: this.scopeWhere(scope),
      order: {
        createdAt: 'DESC'
      }
    })
  }

  private async getScopedWorkOrder(scope: SmartMaintenanceScope, workOrderId: string) {
    const workOrder = await this.workOrderRepository.findOne({
      where: {
        ...this.scopeWhere(scope),
        id: workOrderId
      }
    })
    if (!workOrder) {
      throw new NotFoundException(`Smart maintenance work order '${workOrderId}' was not found`)
    }
    return workOrder
  }

  private scopeWhere(scope: SmartMaintenanceScope) {
    return {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId ?? undefined
    }
  }

  private async findLatestServiceData(scope: SmartMaintenanceScope) {
    const rows = await this.serviceDataRepository.find({
      where: this.scopeWhere(scope),
      order: {
        importedAt: 'DESC',
        createdAt: 'DESC'
      },
      take: 1
    })
    return rows[0] ?? null
  }

  private consumeServiceDataImportDraft(scope: SmartMaintenanceScope, importDraftId: string) {
    this.pruneServiceDataImportDrafts()
    const normalizedId = trimToUndefined(importDraftId)
    const draft = normalizedId ? serviceDataImportDrafts.get(normalizedId) : undefined
    if (!draft) {
      throw new BadRequestException('Service data import draft was not found or has expired')
    }
    if (draft.scopeKey !== serviceDataDraftScopeKey(scope)) {
      throw new BadRequestException('Service data import draft does not belong to the current scope')
    }
    serviceDataImportDrafts.delete(draft.importDraftId)
    return draft
  }

  private pruneServiceDataImportDrafts() {
    const now = Date.now()
    for (const [id, draft] of serviceDataImportDrafts) {
      if (now - draft.createdAt > SERVICE_DATA_IMPORT_DRAFT_TTL_MS) {
        serviceDataImportDrafts.delete(id)
      }
    }
  }

  private assertEditable(workOrder: SmartMaintenanceWorkOrder) {
    if (!workOrder.status || !EDITABLE_STATUSES.includes(workOrder.status)) {
      throw new BadRequestException('Only pending confirmation or needs supplement work orders can be edited')
    }
  }

  private async writeLog(
    scope: SmartMaintenanceScope,
    workOrder: SmartMaintenanceWorkOrder,
    action: SmartMaintenanceLogAction,
    input: {
      reason?: string
      remark?: string
      changedFields?: Array<{ field: string; before?: unknown; after?: unknown }>
      snapshot?: unknown
    } = {}
  ) {
    await this.writeLogWithRepository(this.logRepository, scope, workOrder, action, input)
  }

  private async writeLogWithRepository(
    repository: Repository<SmartMaintenanceWorkOrderLog>,
    scope: SmartMaintenanceScope,
    workOrder: SmartMaintenanceWorkOrder,
    action: SmartMaintenanceLogAction,
    input: {
      reason?: string
      remark?: string
      changedFields?: Array<{ field: string; before?: unknown; after?: unknown }>
      snapshot?: unknown
    } = {}
  ) {
    await repository.save(
      repository.create({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId ?? undefined,
        workOrderId: workOrder.id,
        action,
        operatorId: scope.userId ?? undefined,
        reason: input.reason,
        remark: input.remark,
        changedFields: input.changedFields,
        snapshot: input.snapshot
      })
    )
  }
}

function trimToUndefined(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function normalizeStringArray(value: string[] | null | undefined) {
  if (!value) {
    return undefined
  }
  const normalized = value.map((item) => item.trim()).filter(Boolean)
  return normalized.length ? normalized : undefined
}

function normalizeCompletenessTips(input: SmartMaintenanceGeneratedWorkOrderInput) {
  const tips = normalizeStringArray(input.completenessTips)
  if (!tips?.length) {
    return undefined
  }
  const hasResolvedScope = Boolean(
    trimToUndefined(input.customerName) && trimToUndefined(input.projectName) && trimToUndefined(input.siteName)
  )
  const normalized = hasResolvedScope ? tips.filter((tip) => !isResolvedServiceScopeTip(tip)) : tips
  return normalized.length ? normalized : undefined
}

function isResolvedServiceScopeTip(tip: string) {
  const normalized = normalizeServiceDataText(tip) ?? ''
  const mentionsScope = ['客户', '项目', '场所', '地点', '服务范围'].some((keyword) => normalized.includes(keyword))
  const asksForMissingScope = ['缺少', '补充', '不明确', '未识别', '选择', '确认'].some((keyword) => normalized.includes(keyword))
  return mentionsScope && asksForMissingScope
}

function generateWorkOrderNo(date: Date) {
  const yyyy = String(date.getFullYear())
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const random = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
  return `SM-${yyyy}${mm}${dd}-${random}`
}

function buildTitle(input: SmartMaintenanceGeneratedWorkOrderInput) {
  const title = [input.location, input.deviceType, input.faultCode, input.faultPhenomenon || input.faultCategory, '报修']
    .map((item) => trimToUndefined(item))
    .filter(Boolean)
    .join(' ')
  return title || '智能维保报修'
}

function resolveServiceDataScopeFields(
  serviceData: SmartMaintenanceServiceDataPayload | undefined,
  input: SmartMaintenanceGeneratedWorkOrderInput
) {
  if (!serviceData) {
    return null
  }

  const customers = serviceData.customers ?? []
  const projects = serviceData.projects ?? []
  const locations = serviceData.locations ?? []
  const devices = serviceData.devices ?? []
  const searchText = [
    input.originalContent,
    input.customerName,
    input.projectName,
    input.siteName,
    input.location,
    input.deviceType,
    input.deviceName,
    input.deviceNo
  ]
    .map((item) => trimToUndefined(item))
    .filter(Boolean)
    .join(' ')
  const device = findUniqueServiceDataRecord(devices, (record) =>
    serviceDataDeviceMatches(record, input, searchText)
  )
  const location =
    findLinkedLocation(locations, device) ??
    findUniqueServiceDataRecord(locations, (record) => serviceDataLocationMatches(record, input, searchText))

  if (!device && !location) {
    return null
  }

  const customerCode = stringValue(device?.['customerCode']) ?? stringValue(location?.['customerCode'])
  const projectCode = stringValue(device?.['projectCode']) ?? stringValue(location?.['projectCode'])
  const project = findRecordByCode(projects, projectCode)
  const customer = findRecordByCode(customers, customerCode ?? stringValue(project?.['customerCode']))
  const siteName = recordDisplayName(location) ?? stringValue(device?.['location']) ?? trimToUndefined(input.siteName)

  return {
    customerName: recordDisplayName(customer),
    projectName: recordDisplayName(project),
    siteName,
    location: siteName,
    deviceType: stringValue(device?.['deviceType']) ?? stringValue(device?.['deviceTypeLabel']),
    deviceName: recordDisplayName(device),
    deviceNo: stringValue(device?.['code']) ?? stringValue(device?.['deviceNo']) ?? stringValue(device?.['id'])
  }
}

function serviceDataDeviceMatches(
  record: SmartMaintenanceServiceDataRecord,
  input: SmartMaintenanceGeneratedWorkOrderInput,
  searchText: string
) {
  const candidates = [
    input.deviceNo,
    input.deviceName,
    input.originalContent,
    searchText
  ]
    .map((item) => trimToUndefined(item))
    .filter(Boolean) as string[]
  const recordValues = [
    record['code'],
    record['deviceNo'],
    record['id'],
    record['label'],
    record['name'],
    record['serialNo']
  ]
    .map(stringValue)
    .filter(Boolean) as string[]
  return recordValues.some((value) => candidates.some((candidate) => serviceDataTextMatches(candidate, value)))
}

function serviceDataLocationMatches(
  record: SmartMaintenanceServiceDataRecord,
  input: SmartMaintenanceGeneratedWorkOrderInput,
  searchText: string
) {
  const candidates = [
    input.siteName,
    input.location,
    input.originalContent,
    searchText
  ]
    .map((item) => trimToUndefined(item))
    .filter(Boolean) as string[]
  const recordValues = [record['code'], record['id'], record['label'], record['name'], record['address']]
    .map(stringValue)
    .filter(Boolean) as string[]
  return recordValues.some((value) => candidates.some((candidate) => serviceDataTextMatches(candidate, value)))
}

function findLinkedLocation(
  locations: SmartMaintenanceServiceDataRecord[],
  device: SmartMaintenanceServiceDataRecord | undefined
) {
  if (!device) {
    return undefined
  }
  const locationCode = stringValue(device['locationCode'])
  const locationName = stringValue(device['location'])
  return (
    findRecordByCode(locations, locationCode) ??
    findUniqueServiceDataRecord(locations, (record) => Boolean(locationName && serviceDataTextMatches(locationName, recordDisplayName(record))))
  )
}

function findRecordByCode(records: SmartMaintenanceServiceDataRecord[], code: string | undefined) {
  const normalizedCode = normalizeServiceDataText(code)
  return normalizedCode
    ? records.find((record) => normalizeServiceDataText(stringValue(record['code']) ?? stringValue(record['id'])) === normalizedCode)
    : undefined
}

function findUniqueServiceDataRecord(
  records: SmartMaintenanceServiceDataRecord[],
  predicate: (record: SmartMaintenanceServiceDataRecord) => boolean
) {
  const matches = records.filter(predicate)
  return matches.length === 1 ? matches[0] : undefined
}

function recordDisplayName(record: SmartMaintenanceServiceDataRecord | undefined) {
  if (!record) {
    return undefined
  }
  return stringValue(record['name']) ?? stringValue(record['label']) ?? stringValue(record['title']) ?? stringValue(record['code'])
}

function serviceDataTextMatches(left: string | undefined, right: string | undefined) {
  const normalizedLeft = normalizeServiceDataText(left)
  const normalizedRight = normalizeServiceDataText(right)
  return Boolean(
    normalizedLeft &&
      normalizedRight &&
      (normalizedLeft === normalizedRight || normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft))
  )
}

function normalizeServiceDataText(value: string | undefined) {
  return value?.toLowerCase().replace(/[\s,，、;；/\\-]+/g, '').trim()
}

function pickUpdateFields(input: SmartMaintenanceUpdateInput) {
  return omitUndefined({
    customerName: trimToUndefined(input.customerName),
    projectName: trimToUndefined(input.projectName),
    siteName: trimToUndefined(input.siteName),
    reporterName: trimToUndefined(input.reporterName),
    reporterDepartment: trimToUndefined(input.reporterDepartment),
    reporterContact: trimToUndefined(input.reporterContact),
    title: trimToUndefined(input.title),
    deviceType: trimToUndefined(input.deviceType),
    deviceName: trimToUndefined(input.deviceName),
    deviceNo: trimToUndefined(input.deviceNo),
    faultCategory: trimToUndefined(input.faultCategory),
    faultPhenomenon: trimToUndefined(input.faultPhenomenon),
    faultCode: trimToUndefined(input.faultCode),
    location: trimToUndefined(input.location),
    impactScope: trimToUndefined(input.impactScope),
    urgency: input.urgency,
    serviceType: input.serviceType,
    needOnsite: input.needOnsite,
    confirmedDepartment: trimToUndefined(input.confirmedDepartment),
    confirmedRole: trimToUndefined(input.confirmedRole),
    confirmedDispatchAdvice: trimToUndefined(input.confirmedDispatchAdvice),
    confirmedParts: normalizeStringArray(input.confirmedParts),
    processingRemark: trimToUndefined(input.processingRemark)
  })
}

function buildSupplementDraft(input: SmartMaintenanceSupplementDraftInput) {
  const merged = {
    ...(input.draft ?? {}),
    ...input
  }
  const updateFields = pickUpdateFields(merged)
  return omitUndefined({
    supplementContent: trimToUndefined(input.supplementContent ?? input.draft?.supplementContent),
    ...updateFields,
    confidence: input.confidence ?? input.draft?.confidence,
    rationale: trimToUndefined(input.rationale ?? input.draft?.rationale)
  })
}

function omitUndefined<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<T>
}

function parseServiceDataFile(fileName: string, mimeType: string | undefined, buffer: Buffer): SmartMaintenanceServiceDataPayload {
  const lowerName = fileName.toLowerCase()
  const lowerType = (mimeType || '').toLowerCase()
  if (lowerName.endsWith('.json') || lowerType.includes('json')) {
    return JSON.parse(buffer.toString('utf8')) as SmartMaintenanceServiceDataPayload
  }
  if (lowerName.endsWith('.csv') || lowerType.includes('csv')) {
    return { devices: parseCsv(buffer.toString('utf8')) }
  }
  if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || lowerType.includes('spreadsheet') || lowerType.includes('excel')) {
    return parseWorkbook(buffer)
  }
  throw new BadRequestException('Only JSON, CSV and Excel service data files are supported')
}

function parseWorkbook(buffer: Buffer): SmartMaintenanceServiceDataPayload {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const payload: SmartMaintenanceServiceDataPayload = {}
  for (const sheetName of workbook.SheetNames) {
    const key = resolveServiceDataKey(sheetName)
    if (!key) {
      continue
    }
    payload[key] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' }) as SmartMaintenanceServiceDataRecord[]
  }
  return payload
}

function parseCsv(content: string): SmartMaintenanceServiceDataRecord[] {
  const rows = content
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean)
  const [headerLine, ...body] = rows
  if (!headerLine) {
    return []
  }
  const headers = splitCsvLine(headerLine)
  return body.map((line) => {
    const values = splitCsvLine(line)
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']))
  })
}

function splitCsvLine(line: string) {
  return line.split(',').map((item) => item.trim().replace(/^"|"$/g, ''))
}

function createServiceDataImportDraftId() {
  return `sm-import-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function serviceDataDraftScopeKey(scope: SmartMaintenanceScope) {
  return [scope.tenantId, scope.organizationId ?? ''].join(':')
}

function normalizeServiceDataPayload(input: SmartMaintenanceServiceDataPayload | null | undefined): SmartMaintenanceServiceDataPayload {
  const source = input && typeof input === 'object' ? input : {}
  return Object.fromEntries(
    SERVICE_DATA_KEYS.map((key) => [key, normalizeRecordArray(source[key])]).filter(([, value]) => (value as unknown[]).length)
  ) as SmartMaintenanceServiceDataPayload
}

function normalizeRecordArray(value: unknown): SmartMaintenanceServiceDataRecord[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
    .map((item) => omitBlankValues(item))
    .filter((item) => Object.keys(item).length > 0)
}

function omitBlankValues(input: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(input)
      .map(([key, value]) => [key.trim(), typeof value === 'string' ? value.trim() : value])
      .filter(([key, value]) => Boolean(key) && value !== undefined && value !== null && value !== '')
  )
}

function buildServiceDataSummary(serviceData: SmartMaintenanceServiceDataPayload): SmartMaintenanceServiceDataSummary {
  return {
    customers: serviceData.customers?.length ?? 0,
    projects: serviceData.projects?.length ?? 0,
    locations: serviceData.locations?.length ?? 0,
    deviceTypes: serviceData.deviceTypes?.length ?? 0,
    devices: serviceData.devices?.length ?? 0,
    faultCategories: serviceData.faultCategories?.length ?? 0,
    departments: serviceData.departments?.length ?? 0,
    roles: serviceData.roles?.length ?? 0,
    personnel: serviceData.personnel?.length ?? 0,
    parts: serviceData.parts?.length ?? 0,
    serviceTypes: serviceData.serviceTypes?.length ?? 0,
    urgencies: serviceData.urgencies?.length ?? 0,
    similarCases: serviceData.similarCases?.length ?? 0,
    workOrderSeeds: serviceData.workOrderSeeds?.length ?? 0
  }
}

function hasAnyServiceData(summary: SmartMaintenanceServiceDataSummary) {
  return Object.values(summary).some((value) => value > 0)
}

function serviceDataToCatalog(serviceData: SmartMaintenanceServiceDataPayload) {
  const fallback = {
    deviceTypes: [],
    devices: [],
    faultCategories: [],
    urgencies: [],
    serviceTypes: [],
    locations: [],
    departments: [],
    roles: [],
    parts: [],
    businessContexts: []
  }
  return {
    ...fallback,
    customers: serviceData.customers ?? [],
    projects: serviceData.projects ?? [],
    deviceTypes: normalizeCatalogOptions(serviceData.deviceTypes),
    devices: normalizeCatalogOptions(serviceData.devices),
    faultCategories: normalizeCatalogOptions(serviceData.faultCategories),
    urgencies: normalizeCatalogOptions(serviceData.urgencies),
    serviceTypes: normalizeCatalogOptions(serviceData.serviceTypes),
    locations: normalizeCatalogOptions(serviceData.locations),
    departments: normalizeCatalogOptions(serviceData.departments),
    roles: normalizeCatalogOptions(serviceData.roles),
    personnel: serviceData.personnel ?? [],
    parts: normalizeCatalogOptions(serviceData.parts),
    businessContexts: normalizeCatalogOptions(serviceData.businessContexts)
  }
}

function normalizeCatalogOptions(records: SmartMaintenanceServiceDataRecord[] | undefined) {
  return (records ?? []).map((record) => {
    const code = stringValue(record['code']) ?? stringValue(record['id']) ?? stringValue(record['name']) ?? stringValue(record['label']) ?? ''
    const label = stringValue(record['label']) ?? stringValue(record['name']) ?? stringValue(record['title']) ?? code
    return {
      ...record,
      code,
      label
    }
  }).filter((item) => item.code || item.label)
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function resolveServiceDataKey(sheetName: string): keyof SmartMaintenanceServiceDataPayload | null {
  const normalized = sheetName.trim()
  return SERVICE_DATA_SHEET_KEYS[normalized] ?? SERVICE_DATA_SHEET_KEYS[normalized.toLowerCase()] ?? null
}

function assertConfirmProcessingRequiredFields(workOrder: SmartMaintenanceWorkOrder) {
  const missing = [
    ['deviceType', workOrder.deviceType],
    ['faultPhenomenon', workOrder.faultPhenomenon],
    ['location', workOrder.location],
    ['urgency', workOrder.urgency],
    ['confirmedDepartment', workOrder.confirmedDepartment],
    ['processingRemark', workOrder.processingRemark]
  ]
    .filter(([, value]) => !value)
    .map(([field]) => field)

  if (missing.length) {
    throw new BadRequestException(`Missing required fields before processing: ${missing.join(', ')}`)
  }
}

function calculateDurationMinutes(startedAt: Date | undefined, completedAt: Date) {
  if (!startedAt) {
    return 0
  }
  return Math.max(0, Math.round((completedAt.getTime() - startedAt.getTime()) / 60000))
}

function toWorkOrderSnapshot(workOrder: SmartMaintenanceWorkOrder) {
  return {
    id: workOrder.id,
    workOrderNo: workOrder.workOrderNo,
    status: workOrder.status,
    title: workOrder.title,
    deviceType: workOrder.deviceType,
    faultCategory: workOrder.faultCategory,
    faultPhenomenon: workOrder.faultPhenomenon,
    location: workOrder.location,
    urgency: workOrder.urgency,
    completenessTips: workOrder.completenessTips,
    confirmedDepartment: workOrder.confirmedDepartment,
    confirmedRole: workOrder.confirmedRole,
    processingRemark: workOrder.processingRemark
  }
}

function diffSnapshots(before: ReturnType<typeof toWorkOrderSnapshot>, after: ReturnType<typeof toWorkOrderSnapshot>) {
  return Object.keys(after)
    .filter((key) => before[key as keyof typeof before] !== after[key as keyof typeof after])
    .map((field) => ({
      field,
      before: before[field as keyof typeof before],
      after: after[field as keyof typeof after]
    }))
}

function hasTextOverlap(left: string, right: string) {
  const leftTokens = tokenize(left)
  const rightTokens = tokenize(right)
  return leftTokens.some((token) => rightTokens.includes(token))
}

function tokenize(value: string) {
  const normalized = value.toLowerCase().trim()
  const splitTokens = normalized
    .split(/[\s,，、;；/]+/)
    .map((item) => item.trim())
    .filter(Boolean)
  if (splitTokens.length > 1) {
    return splitTokens
  }
  return normalized ? [normalized, ...Array.from(normalized)] : []
}

function toSimilarSummary(workOrder: SmartMaintenanceWorkOrder): SmartMaintenanceSimilarWorkOrderSummary {
  return {
    id: workOrder.id as string,
    workOrderNo: workOrder.workOrderNo,
    title: workOrder.title,
    status: workOrder.status,
    deviceType: workOrder.deviceType,
    location: workOrder.location,
    faultCategory: workOrder.faultCategory,
    faultPhenomenon: workOrder.faultPhenomenon,
    createdAt: workOrder.createdAt?.toISOString()
  }
}

function filterWorkOrders(
  items: SmartMaintenanceWorkOrder[],
  input: {
    status?: SmartMaintenanceWorkOrderStatus
    deviceType?: string
    urgency?: string
    search?: string
  }
) {
  const search = input.search?.trim().toLowerCase()
  return items.filter((item) => {
    if (input.status && item.status !== input.status) {
      return false
    }
    if (input.deviceType && item.deviceType !== input.deviceType) {
      return false
    }
    if (input.urgency && item.urgency !== input.urgency) {
      return false
    }
    if (!search) {
      return true
    }
    return [item.workOrderNo, item.title, item.originalContent, item.customerName, item.projectName, item.siteName]
      .filter(Boolean)
      .some((value) => value?.toLowerCase().includes(search))
  })
}

function buildStats(items: SmartMaintenanceWorkOrder[]) {
  const pendingConfirmation = items.filter((item) => item.status === 'pending_confirmation').length
  const needsSupplement = items.filter((item) => item.status === 'needs_supplement').length
  const processing = items.filter((item) => item.status === 'processing').length
  const processed = items.filter((item) => item.status === 'processed').length
  const rejected = items.filter((item) => item.status === 'rejected').length
  return {
    total: items.length,
    pendingConfirmation,
    needsSupplement,
    pending_confirmation: pendingConfirmation,
    needs_supplement: needsSupplement,
    processing,
    processed,
    rejected
  }
}

function toWorkOrderListItem(workOrder: SmartMaintenanceWorkOrder) {
  return {
    id: workOrder.id,
    workOrderNo: workOrder.workOrderNo,
    title: workOrder.title,
    status: workOrder.status,
    sourceType: workOrder.sourceType,
    deviceType: workOrder.deviceType,
    faultCategory: workOrder.faultCategory,
    faultPhenomenon: workOrder.faultPhenomenon,
    location: workOrder.location,
    urgency: workOrder.urgency,
    customerName: workOrder.customerName,
    projectName: workOrder.projectName,
    siteName: workOrder.siteName,
    createdAt: workOrder.createdAt
  }
}

function toWorkOrderDetailItem(workOrder: SmartMaintenanceWorkOrder, logs: SmartMaintenanceWorkOrderLog[]) {
  return {
    ...workOrder,
    logs
  }
}

function dateInShanghai(value: string) {
  return new Date(`${value.replace(' ', 'T')}:00+08:00`)
}
