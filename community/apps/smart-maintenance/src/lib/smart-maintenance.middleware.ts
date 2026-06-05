import { Injectable } from '@nestjs/common'
import { tool } from '@langchain/core/tools'
import { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import {
  SMART_MAINTENANCE_DETAIL_TOOL_NAME,
  SMART_MAINTENANCE_FEATURE,
  SMART_MAINTENANCE_GET_CATALOG_TOOL_NAME,
  SMART_MAINTENANCE_ICON,
  SMART_MAINTENANCE_IMPORT_SERVICE_DATA_TOOL_NAME,
  SMART_MAINTENANCE_MIDDLEWARE_NAME,
  SMART_MAINTENANCE_SAVE_TOOL_NAME,
  SMART_MAINTENANCE_SEARCH_TOOL_NAME,
  SMART_MAINTENANCE_SUPPLEMENT_DRAFT_TOOL_NAME
} from './constants'
import { SmartMaintenanceService } from './smart-maintenance.service'
import type { SmartMaintenanceGeneratedWorkOrderInput, SmartMaintenanceScope } from './types'

const saveGeneratedWorkOrderSchema = z.object({
  sourceType: z.enum(['agent_chat', 'workbench_form']).optional().describe('Source where the report was submitted.'),
  title: z.string().optional().describe('Generated work order title.'),
  originalContent: z.string().min(1).describe('Original natural-language maintenance report from the user.'),
  customerName: z.string().optional().describe('Customer name snapshot. Prefer user-provided value when available.'),
  projectName: z.string().optional().describe('Project name snapshot. Prefer user-provided value when available.'),
  siteName: z.string().optional().describe('Site, park, store or facility name snapshot.'),
  reporterName: z.string().optional().describe('Reporter name, when provided.'),
  reporterDepartment: z.string().optional().describe('Reporter department, when provided.'),
  reporterContact: z.string().optional().describe('Reporter contact, when provided.'),
  deviceType: z.string().optional().describe('Device type, such as 中央空调, 打印机, 门禁, 网络设备.'),
  deviceName: z.string().optional().describe('Device name, when recognized.'),
  deviceNo: z.string().optional().describe('Device number, when available.'),
  faultCategory: z.string().optional().describe('Normalized fault category, such as 制冷异常 or 无法开机.'),
  faultPhenomenon: z.string().optional().describe('Observed fault phenomenon.'),
  faultCode: z.string().optional().describe('Fault code such as E4.'),
  location: z.string().optional().describe('Fault location.'),
  impactScope: z.string().optional().describe('Business or physical impact scope.'),
  urgency: z.enum(['low', 'medium', 'high']).optional().describe('Urgency level.'),
  serviceType: z.enum(['repair', 'inspection', 'after_sales', 'other']).optional().describe('Service type.'),
  needOnsite: z.boolean().optional().describe('Whether onsite service is recommended.'),
  aiDiagnosis: z.string().optional().describe('Initial AI diagnosis, not a final maintenance conclusion.'),
  possibleCauses: z.array(z.string()).optional().describe('Possible causes.'),
  suggestedAction: z.string().optional().describe('Suggested handling action.'),
  completenessTips: z.array(z.string()).optional().describe('Missing or incomplete information tips.'),
  aiConfidence: z.number().min(0).max(1).optional().describe('AI confidence between 0 and 1.'),
  aiRawResult: z.unknown().optional().describe('Raw structured AI result for traceability.'),
  recommendedDepartment: z.string().optional().describe('AI recommended processing department.'),
  recommendedRole: z.string().optional().describe('AI recommended processing role.'),
  recommendedDispatchAdvice: z.string().optional().describe('AI dispatch advice.'),
  suggestedParts: z.array(z.string()).optional().describe('AI suggested parts to carry.'),
  hasMultipleIssues: z.boolean().optional().describe('Whether the report may contain multiple devices or multiple faults.'),
  multipleIssueTip: z.string().optional().describe('Human-readable multiple issue tip.')
})

const getCatalogSchema = z.object({
  deviceType: z.string().optional().describe('Optional device type used by the Agent to focus parts candidates.')
})

const serviceDataRecordSchema = z.record(z.unknown())
const serviceDataPayloadSchema = z.object({
  customers: z.array(serviceDataRecordSchema).optional(),
  projects: z.array(serviceDataRecordSchema).optional(),
  locations: z.array(serviceDataRecordSchema).optional(),
  deviceTypes: z.array(serviceDataRecordSchema).optional(),
  devices: z.array(serviceDataRecordSchema).optional(),
  faultCategories: z.array(serviceDataRecordSchema).optional(),
  departments: z.array(serviceDataRecordSchema).optional(),
  roles: z.array(serviceDataRecordSchema).optional(),
  personnel: z.array(serviceDataRecordSchema).optional(),
  parts: z.array(serviceDataRecordSchema).optional(),
  serviceTypes: z.array(serviceDataRecordSchema).optional(),
  urgencies: z.array(serviceDataRecordSchema).optional(),
  businessContexts: z.array(serviceDataRecordSchema).optional(),
  similarCases: z.array(serviceDataRecordSchema).optional(),
  workOrderSeeds: z.array(serviceDataRecordSchema).optional()
})
const importServiceDataSchema = z.object({
  importDraftId: z.string().optional().describe('Prepared import draft id returned by the workbench upload action. Prefer this over passing large serviceData JSON.'),
  fileName: z.string().optional().describe('Original uploaded service data file name.'),
  importMode: z.enum(['replace', 'merge']).optional().describe('Import mode. Use replace for first-version demo imports.'),
  serviceData: serviceDataPayloadSchema.optional().describe('Agent-approved structured service data to persist as the current smart-maintenance catalog. Use only when no importDraftId is available.')
})

const searchWorkOrdersSchema = z.object({
  status: z.enum(['pending_confirmation', 'needs_supplement', 'processing', 'processed', 'rejected']).optional(),
  deviceType: z.string().optional().describe('Device type filter, such as 中央空调.'),
  urgency: z.enum(['low', 'medium', 'high']).optional().describe('Urgency filter.'),
  search: z.string().optional().describe('Keyword used to search work order number, title, content, customer, project or site.'),
  page: z.number().int().min(1).optional().describe('Page number. Defaults to 1.'),
  pageSize: z.number().int().min(1).max(50).optional().describe('Page size. Defaults to 10.')
})

const workOrderDetailSchema = z.object({
  workOrderId: z.string().min(1).describe('Smart maintenance work order id.')
})

const supplementDraftSchema = z.object({
  workOrderId: z.string().min(1).describe('Needs-supplement work order id.'),
  supplementContent: z.string().optional().describe('User natural-language supplement content.'),
  customerName: z.string().optional(),
  projectName: z.string().optional(),
  siteName: z.string().optional(),
  reporterName: z.string().optional(),
  reporterDepartment: z.string().optional(),
  reporterContact: z.string().optional(),
  title: z.string().optional(),
  deviceType: z.string().optional(),
  deviceName: z.string().optional(),
  deviceNo: z.string().optional(),
  faultCategory: z.string().optional(),
  faultPhenomenon: z.string().optional(),
  faultCode: z.string().optional(),
  location: z.string().optional(),
  impactScope: z.string().optional(),
  urgency: z.enum(['low', 'medium', 'high']).optional(),
  serviceType: z.enum(['repair', 'inspection', 'after_sales', 'other']).optional(),
  needOnsite: z.boolean().optional(),
  confirmedDepartment: z.string().optional(),
  confirmedRole: z.string().optional(),
  confirmedDispatchAdvice: z.string().optional(),
  confirmedParts: z.array(z.string()).optional(),
  processingRemark: z.string().optional(),
  confidence: z.number().min(0).max(1).optional().describe('Draft confidence between 0 and 1.'),
  rationale: z.string().optional().describe('Short rationale for the supplement draft.')
})

@Injectable()
@AgentMiddlewareStrategy(SMART_MAINTENANCE_MIDDLEWARE_NAME)
export class SmartMaintenanceMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  meta: TAgentMiddlewareMeta = {
    name: SMART_MAINTENANCE_MIDDLEWARE_NAME,
    label: {
      en_US: 'Smart Maintenance',
      zh_Hans: '智能维保'
    },
    description: {
      en_US: 'Save AI-generated smart maintenance work orders for human review.',
      zh_Hans: '保存 AI 生成的智能维保工单，供人工审核处理。'
    },
    icon: {
      type: 'svg',
      value: SMART_MAINTENANCE_ICON,
      color: '#0f766e'
    },
    features: [SMART_MAINTENANCE_FEATURE],
    configSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }

  constructor(private readonly service: SmartMaintenanceService) {}

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    const scope = scopeFromContext(context)
    const saveGeneratedWorkOrderTool = tool(
      async (input: z.infer<typeof saveGeneratedWorkOrderSchema>) => {
        const payload: SmartMaintenanceGeneratedWorkOrderInput = {
          ...input,
          originalContent: input.originalContent
        }
        const workOrder = await this.service.saveGeneratedWorkOrder(payload, scope)
        return JSON.stringify({
          success: true,
          message: 'Smart maintenance work order was generated for human review.',
          data: {
            id: workOrder.id,
            workOrderNo: workOrder.workOrderNo,
            status: workOrder.status,
            title: workOrder.title,
            customerName: workOrder.customerName,
            projectName: workOrder.projectName,
            siteName: workOrder.siteName,
            deviceType: workOrder.deviceType,
            location: workOrder.location,
            urgency: workOrder.urgency,
            completenessTips: workOrder.completenessTips,
            similarWorkOrders: workOrder.similarWorkOrders
          }
        })
      },
      {
        name: SMART_MAINTENANCE_SAVE_TOOL_NAME,
        description:
          'Save one AI-generated smart maintenance work order after extracting structured fields from a natural-language repair report. Use exactly once per report. Do not split multiple issues into multiple work orders; set hasMultipleIssues and multipleIssueTip instead.',
        schema: saveGeneratedWorkOrderSchema
      }
    )

    const getCatalogTool = tool(
      async (_input: z.infer<typeof getCatalogSchema>) => {
        const catalog = await this.service.getCurrentCatalog(scope)
        return JSON.stringify({
          success: true,
          message: 'Smart maintenance catalog candidates were returned.',
          data: catalog
        })
      },
      {
        name: SMART_MAINTENANCE_GET_CATALOG_TOOL_NAME,
        description:
          'Get smart maintenance candidate values for normalizing device types, devices, fault categories, locations, departments, roles, parts, service types and urgency.',
        schema: getCatalogSchema
      }
    )

    const importServiceDataTool = tool(
      async (input: z.infer<typeof importServiceDataSchema>) => {
        const row = await this.service.importServiceData(scope, {
          importDraftId: input.importDraftId,
          fileName: input.fileName,
          importMode: input.importMode,
          serviceData: input.serviceData
        })
        return JSON.stringify({
          success: true,
          message: 'Smart maintenance service data was imported by the Agent.',
          data: {
            id: row.id,
            fileName: row.fileName,
            importMode: row.importMode,
            importedAt: row.importedAt,
            summary: row.summary
          }
        })
      },
      {
        name: SMART_MAINTENANCE_IMPORT_SERVICE_DATA_TOOL_NAME,
        description:
          'Persist Agent-approved smart maintenance service data after parsing an uploaded JSON, CSV or Excel file. The workbench upload action only prepares data; this tool is the required write path for customers, projects, locations, devices, departments, roles, personnel, parts and similar cases.',
        schema: importServiceDataSchema
      }
    )

    const searchWorkOrdersTool = tool(
      async (input: z.infer<typeof searchWorkOrdersSchema>) => {
        const result = await this.service.searchWorkOrders(scope, input)
        return JSON.stringify({
          success: true,
          message: 'Smart maintenance work orders were searched.',
          data: result
        })
      },
      {
        name: SMART_MAINTENANCE_SEARCH_TOOL_NAME,
        description:
          'Search smart maintenance work orders by status, keyword, device type and urgency. Use this when the user asks about existing maintenance work orders or history.',
        schema: searchWorkOrdersSchema
      }
    )

    const getWorkOrderDetailTool = tool(
      async (input: z.infer<typeof workOrderDetailSchema>) => {
        const detail = await this.service.getWorkOrderDetailForAgent(scope, input.workOrderId)
        return JSON.stringify({
          success: true,
          message: 'Smart maintenance work order detail was returned.',
          data: detail
        })
      },
      {
        name: SMART_MAINTENANCE_DETAIL_TOOL_NAME,
        description:
          'Get one smart maintenance work order detail including AI extraction, human confirmation fields, processing fields, supplement draft and operation logs.',
        schema: workOrderDetailSchema
      }
    )

    const prepareSupplementDraftTool = tool(
      async (input: z.infer<typeof supplementDraftSchema>) => {
        const { workOrderId, ...draftInput } = input
        const workOrder = await this.service.prepareSupplementDraft(scope, workOrderId, draftInput)
        return JSON.stringify({
          success: true,
          message:
            'Smart maintenance supplement draft was saved. Ask the user to open the review desk, one-click fill the draft, and save manually.',
          data: {
            id: workOrder.id,
            workOrderNo: workOrder.workOrderNo,
            status: workOrder.status,
            aiSupplementDraft: workOrder.aiSupplementDraft,
            aiSupplementDraftedAt: workOrder.aiSupplementDraftedAt
          }
        })
      },
      {
        name: SMART_MAINTENANCE_SUPPLEMENT_DRAFT_TOOL_NAME,
        description:
          'Prepare an AI supplement draft for a needs-supplement work order from user-provided supplement content. This does not confirm, reject, process, or close the work order.',
        schema: supplementDraftSchema
      }
    )

    return {
      name: SMART_MAINTENANCE_MIDDLEWARE_NAME,
      tools: [
        saveGeneratedWorkOrderTool,
        importServiceDataTool,
        getCatalogTool,
        searchWorkOrdersTool,
        getWorkOrderDetailTool,
        prepareSupplementDraftTool
      ]
    }
  }
}

function scopeFromContext(context: IAgentMiddlewareContext): SmartMaintenanceScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId,
    userId: context.userId,
    assistantId: context.xpertId,
    conversationId: context.conversationId
  }
}
