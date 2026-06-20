import type { SalesOntologyPriority } from './types.js'

export const SALES_ONTOLOGY_DEMO_SEED_SOURCE = {
  source: 'github:gptplusplus/sales-ontology/backend/seed.py',
  title: 'Sales Ontology demo seed data',
  url: 'https://github.com/gptplusplus/sales-ontology/blob/main/backend/seed.py',
  confidence: 1
}

export interface SalesOntologyDemoObject {
  externalKey: string
  objectType: string
  label: string
  status?: string
  lifecycleStage?: string
  sentiment?: string
  complianceRiskLevel?: string
  ownerId?: string
  domain?: string
  properties?: Record<string, unknown>
}

export interface SalesOntologyDemoRelation {
  source: string
  relationType: string
  target: string
  targetLabel: string
  targetObjectType: string
  strength?: number
  frequency?: string
  volume?: number
}

export interface SalesOntologyDemoObjectAction {
  id: string
  objectId: string
  name: string
  description: string
  requiresApproval: boolean
  preconditions?: string[]
  sideEffects?: string[]
  writeBackTargets?: string[]
}

export interface SalesOntologyDemoProposal {
  key: string
  title: string
  description: string
  actionType: string
  entityExternalKey: string
  entityName: string
  entityObjectType: string
  priority: SalesOntologyPriority
  confidence: number
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed'
  proposedBy: string
  reasoningConclusion: string
  reasoningConfidence?: number
  evidence?: string[]
  alternativeHypotheses?: Array<{ hypothesis: string; confidence: number }>
  suggestedActions?: Array<{ actionName: string; priority: SalesOntologyPriority; reason: string }>
  actionDefinition: Record<string, unknown>
}

export interface SalesOntologyDemoNotification {
  key: string
  type: string
  title: string
  message: string
  priority: SalesOntologyPriority
  entityExternalKey?: string
}

export interface SalesOntologyDemoReminder {
  key: string
  reminderType: string
  title: string
  description: string
  priority: SalesOntologyPriority
  status: string
  entityExternalKey?: string
}

export interface SalesOntologyDemoScenario {
  key: string
  scenarioType: string
  name: string
  description: string
  category: string
  targetValue: number
  forecastValue: number
  achievementRate: number
  riskLevel: string
  baselineTargetValue: number
  baselineForecastValue: number
  baselineAchievementRate: number
  baselineRiskLevel: string
  delta: number
  impactAnalysis: string
  parameters?: Array<Record<string, unknown>>
}

export interface SalesOntologyDemoInferenceRule {
  id: string
  name: string
  description: string
  ruleType: string
  conditionPattern: string
  conclusionType: string
  confidenceBase: number
  tags: string[]
}

export const SALES_ONTOLOGY_DEMO_OBJECTS: SalesOntologyDemoObject[] = [
  {
    externalKey: 'd1',
    objectType: 'Doctor',
    label: '张主任',
    status: 'warning',
    lifecycleStage: 'at_risk',
    sentiment: 'negative',
    complianceRiskLevel: 'medium',
    ownerId: 'r1',
    domain: 'CustomerManagement',
    properties: {
      title: '主任医师',
      department: '心内科',
      specialty: '冠心病,心力衰竭',
      prescription_power: 95,
      influence_score: 88,
      prescription_volume: 72,
      previous_prescription_volume: 95,
      last_visit_date: '2026-02-01',
      next_recommended_visit_date: '2026-03-15'
    }
  },
  {
    externalKey: 'd2',
    objectType: 'Doctor',
    label: '李教授',
    status: 'normal',
    lifecycleStage: 'loyal',
    sentiment: 'positive',
    complianceRiskLevel: 'low',
    ownerId: 'r1',
    domain: 'CustomerManagement',
    properties: {
      title: '副主任医师',
      department: '神经内科',
      specialty: '帕金森,阿尔茨海默症',
      prescription_power: 82,
      influence_score: 75,
      prescription_volume: 116,
      previous_prescription_volume: 110,
      last_visit_date: '2026-03-10',
      next_recommended_visit_date: '2026-04-10'
    }
  },
  {
    externalKey: 'd3',
    objectType: 'Doctor',
    label: '王主治',
    status: 'normal',
    lifecycleStage: 'active',
    sentiment: 'neutral',
    ownerId: 'r1',
    domain: 'CustomerManagement',
    properties: { title: '主治医师', department: '心内科', specialty: '高血压', prescription_power: 65, influence_score: 45 }
  },
  {
    externalKey: 'd4',
    objectType: 'Doctor',
    label: '陈副主任',
    status: 'normal',
    lifecycleStage: 'active',
    sentiment: 'positive',
    ownerId: 'r1',
    domain: 'CustomerManagement',
    properties: {
      title: '副主任医师',
      department: '心内科',
      specialty: '冠心病,心律失常',
      prescription_power: 78,
      influence_score: 65,
      prescription_volume: 68,
      previous_prescription_volume: 80,
      last_visit_date: '2026-04-01'
    }
  },
  {
    externalKey: 'd5',
    objectType: 'Doctor',
    label: '刘主任医师',
    status: 'warning',
    lifecycleStage: 'active',
    sentiment: 'neutral',
    ownerId: 'r1',
    domain: 'CustomerManagement',
    properties: {
      title: '主任医师',
      department: '内分泌科',
      specialty: '糖尿病,代谢综合征',
      prescription_power: 85,
      influence_score: 82,
      prescription_volume: 55,
      previous_prescription_volume: 70,
      last_visit_date: '2026-01-15'
    }
  },
  {
    externalKey: 'h1',
    objectType: 'Hospital',
    label: '上海瑞金医院',
    status: 'normal',
    ownerId: 'r1',
    domain: 'CustomerManagement',
    properties: { level: '三甲', location: '上海', beds: 2000, access_status: 'approved', procurement_mode: '集中采购', annual_revenue: 50000000 }
  },
  {
    externalKey: 'h2',
    objectType: 'Hospital',
    label: '上海中山医院',
    status: 'normal',
    ownerId: 'r1',
    domain: 'CustomerManagement',
    properties: { level: '三甲', location: '上海', beds: 2500, access_status: 'approved', procurement_mode: '招标采购' }
  },
  { externalKey: 'p1', objectType: 'Product', label: '诺欣妥', status: 'normal', ownerId: 'default_user', domain: 'RevenueManagement', properties: { category: '心血管', sales: 50000000, market_share: 35, price: 280 } },
  { externalKey: 'p2', objectType: 'Product', label: '可定', status: 'normal', ownerId: 'default_user', domain: 'RevenueManagement', properties: { category: '降脂', sales: 30000000, market_share: 25, price: 180 } },
  { externalKey: 'r1', objectType: 'SalesRep', label: '王代表', status: 'normal', ownerId: 'default_user', domain: 'CustomerManagement', properties: { region: '华东区', performance: 92, quota_achievement: 88, ytd_sales: 4500000 } },
  { externalKey: 'r2', objectType: 'SalesRep', label: '赵代表', status: 'normal', ownerId: 'default_user', domain: 'CustomerManagement', properties: { region: '华东区', performance: 78, quota_achievement: 82 } },
  { externalKey: 'r3', objectType: 'SalesRep', label: '孙代表', status: 'warning', complianceRiskLevel: 'high', ownerId: 'default_user', domain: 'CustomerManagement', properties: { region: '华东区', performance: 65, quota_achievement: 70, ytd_sales: 3200000 } },
  { externalKey: 'v1', objectType: 'VisitRecord', label: '学术拜访-0318', status: 'normal', ownerId: 'r1', domain: 'CustomerManagement', properties: { visit_type: 'face_to_face', visit_status: 'completed', objective: '跟进处方量下降原因', key_insights: '竞品渗透严重,需要提供更多学术支持,医生态度担忧副作用', compliance_score: 95, effectiveness_score: 88 } },
  { externalKey: 't1', objectType: 'SalesTarget', label: 'Q1 销售目标-诺欣妥', status: 'warning', ownerId: 'default_user', domain: 'RevenueManagement', properties: { target_type: 'quarterly', dimension: 'product', target: 15000000, actual: 12500000, forecastValue: 13800000, achievement_rate: 0.833, risk_level: 'at_risk' } },
  { externalKey: 'c1', objectType: 'ComplianceAlert', label: '招待费超限预警', status: 'critical', ownerId: 'default_user', domain: 'ComplianceManagement', properties: { severity: 'high', risk_type: 'expense_exceed_limit', alert_description: '王代表本月招待费已达上限的95%，建议审核', alert_status: 'pending', risk_score: 0.86 } },
  { externalKey: 'e1', objectType: 'AcademicEvent', label: '心血管学术沙龙', status: 'normal', ownerId: 'default_user', domain: 'MedicalAffairs', properties: { event_type: '学术会议', event_date: '2026-03-25', participants: 50, topic: '心衰治疗最新进展' } },
  { externalKey: 'ter1', objectType: 'Territory', label: '华东区', status: 'normal', ownerId: 'default_user', domain: 'RevenueManagement', properties: { region: '华东', hospital_count: 25, rep_count: 8, target_revenue: 80000000 } },
  { externalKey: 'rp1', objectType: 'RecoveryPlan', label: '张主任流失挽回计划', status: 'warning', ownerId: 'default_user', domain: 'CustomerManagement', properties: { doctor_name: '张主任', risk_reason: '处方量持续下降，竞品渗透', plan_status: 'pending_approval', validated_by: 'ComplianceAgent' } },
  { externalKey: 'sf1', objectType: 'SalesFlow', label: 'Q1 M1流向-诺欣妥', ownerId: 'default_user', domain: 'RevenueManagement', properties: { flow_type: 'M1', target: 5000000, actual: 4200000, achievement_rate: 0.84, yoy_growth: 15, mom_growth: 5, dimension: 'product', period: '2026-Q1' } },
  { externalKey: 'sf2', objectType: 'SalesFlow', label: 'Q1 M2流向-可定', ownerId: 'default_user', domain: 'RevenueManagement', properties: { flow_type: 'M2', target: 3000000, actual: 2800000, achievement_rate: 0.933, yoy_growth: 8, mom_growth: 3, dimension: 'product', period: '2026-Q1' } },
  { externalKey: 'mp1', objectType: 'MarketPotential', label: '华东区市场潜力', ownerId: 'default_user', domain: 'RevenueManagement', properties: { potential_value: 150000000, penetration_rate: 35, market_share: 28, competitor_share: 45, growth_opportunity: 108000000 } },
  { externalKey: 'hd1', objectType: 'HospitalDevelopment', label: '上海第六人民医院开发', ownerId: 'default_user', domain: 'RevenueManagement', properties: { development_stage: 'negotiation', success_rate: 75, resource_allocation: 150000, timeline: '2026-Q1-Q2' } },
  { externalKey: 'bc1', objectType: 'BudgetCategory', label: '销售费用预算', ownerId: 'default_user', domain: 'ExpenseManagement', properties: { category: 'sales', budget_amount: 2000000, used_amount: 1200000, remaining_amount: 800000, execution_rate: 60, budget_status: 'approved' } },
  { externalKey: 'bc2', objectType: 'BudgetCategory', label: '市场费用预算', ownerId: 'default_user', domain: 'ExpenseManagement', properties: { category: 'market', budget_amount: 1500000, used_amount: 900000, remaining_amount: 600000, execution_rate: 60, budget_status: 'approved' } },
  { externalKey: 'ec1', objectType: 'ExpenseClassification', label: 'C1费用-总部活动', ownerId: 'default_user', domain: 'ExpenseManagement', properties: { expense_type: 'C1', amount: 300000, cost_center: '总部市场部', approval_status: 'approved' } },
  { externalKey: 'ec2', objectType: 'ExpenseClassification', label: 'C2A费用-区域活动', ownerId: 'default_user', domain: 'ExpenseManagement', properties: { expense_type: 'C2A', amount: 450000, cost_center: '华东区', approval_status: 'approved' } },
  { externalKey: 'cc1', objectType: 'CustomerCategory', label: 'A类客户', ownerId: 'default_user', domain: 'CustomerManagement', properties: { category: 'A', category_name: '核心客户', prescription_potential: 95, influence_level: 90, cooperation_willingness: 85 } },
  { externalKey: 'cc2', objectType: 'CustomerCategory', label: 'B类客户', ownerId: 'default_user', domain: 'CustomerManagement', properties: { category: 'B', category_name: '重点客户', prescription_potential: 75, influence_level: 70, cooperation_willingness: 80 } },
  { externalKey: 'pdca1', objectType: 'PDCAPlan', label: '张主任挽回计划', ownerId: 'default_user', domain: 'CustomerManagement', properties: { plan_type: 'visit', plan_content: '通过增加拜访频次和学术支持挽回张主任', cycle_status: 'doing' } },
  { externalKey: 'hs1', objectType: 'HospitalStrategy', label: '瑞金医院策略', ownerId: 'default_user', domain: 'CustomerManagement', properties: { strategy_type: '学术引领', sales_ratio: 35, vacancy_rate: 15, consumption_progress: 68, overlapping_hospitals: 3, flow_direction: 'outbound', contract_ratio: 85 } },
  { externalKey: 'rws1', objectType: 'RWSProject', label: '心衰患者真实世界研究', ownerId: 'default_user', domain: 'MedicalAffairs', properties: { project_name: '心衰患者真实世界研究', project_type: 'registry', project_status: 'multicenter', centers: 15, enrolled_patients: 320, budget: 2000000, timeline: '2025-Q3至2027-Q2' } },
  { externalKey: 'pp1', objectType: 'PatientProgram', label: '诺欣妥患者援助项目', ownerId: 'default_user', domain: 'MedicalAffairs', properties: { program_type: '患者援助', enrolled_patients: 580, active_patients: 520, drug_switch_count: 45, commercial_insurance_count: 120, reimbursement_amount: 850000 } },
  { externalKey: 'cr1', objectType: 'ComplianceRule', label: '会议时长限制', ownerId: 'default_user', domain: 'ComplianceManagement', properties: { rule_name: '会议时长限制', rule_type: 'meeting', threshold: 4, severity: 'high', rule_description: '会议时长不能超过4小时' } },
  { externalKey: 'cr2', objectType: 'ComplianceRule', label: '单次费用限制', ownerId: 'default_user', domain: 'ComplianceManagement', properties: { rule_name: '单次费用限制', rule_type: 'expense', threshold: 500, severity: 'high', rule_description: '单次费用不能超过500元' } },
  { externalKey: 'mc1', objectType: 'MeetingCompliance', label: '心血管学术沙龙合规检查', ownerId: 'default_user', domain: 'ComplianceManagement', properties: { meeting_duration: 3.5, topic_alignment: 0.85, topic_repetition: 0.2, compliance_score: 90 } }
]

export const SALES_ONTOLOGY_DEMO_RELATIONS: SalesOntologyDemoRelation[] = [
  ['d1', 'WORKS_AT', 'h1', '上海瑞金医院', 'Hospital'],
  ['d1', 'PRESCRIBES', 'p1', '诺欣妥', 'Product', undefined, 'high', 120],
  ['d1', 'PRESCRIBES', 'p2', '可定', 'Product', undefined, 'medium', 45],
  ['d1', 'MANAGED_BY', 'r1', '王代表', 'SalesRep'],
  ['d1', 'INFLUENCES', 'd2', '李教授', 'Doctor'],
  ['d2', 'WORKS_AT', 'h1', '上海瑞金医院', 'Hospital'],
  ['d2', 'PRESCRIBES', 'p1', '诺欣妥', 'Product'],
  ['d2', 'MANAGED_BY', 'r1', '王代表', 'SalesRep'],
  ['d3', 'WORKS_AT', 'h2', '上海中山医院', 'Hospital'],
  ['d3', 'PRESCRIBES', 'p2', '可定', 'Product'],
  ['d3', 'MANAGED_BY', 'r2', '赵代表', 'SalesRep'],
  ['h1', 'BELONGS_TO', 'ter1', '华东区', 'Territory'],
  ['h2', 'BELONGS_TO', 'ter1', '华东区', 'Territory'],
  ['r1', 'BELONGS_TO', 'ter1', '华东区', 'Territory'],
  ['v1', 'HAS_VISIT', 'd1', '张主任', 'Doctor'],
  ['v1', 'PARTICIPATES_IN', 'r1', '王代表', 'SalesRep'],
  ['t1', 'PARTICIPATES_IN', 'p1', '诺欣妥', 'Product'],
  ['c1', 'HAS_ALERT', 'r1', '王代表', 'SalesRep'],
  ['e1', 'ATTENDED', 'd1', '张主任', 'Doctor'],
  ['e1', 'ATTENDED', 'd3', '王主治', 'Doctor'],
  ['rp1', 'HAS_VISIT', 'd1', '张主任', 'Doctor'],
  ['sf1', 'FLOWS_TO', 'p1', '诺欣妥', 'Product'],
  ['sf1', 'ACHIEVES', 't1', 'Q1销售目标', 'SalesTarget'],
  ['sf2', 'FLOWS_TO', 'p2', '可定', 'Product'],
  ['mp1', 'POTENTIAL_OF', 'ter1', '华东区', 'Territory'],
  ['ec1', 'CLASSIFIED_AS', 'bc2', '市场费用预算', 'BudgetCategory'],
  ['ec2', 'CLASSIFIED_AS', 'bc2', '市场费用预算', 'BudgetCategory'],
  ['pdca1', 'FOLLOWS', 'd1', '张主任', 'Doctor'],
  ['hs1', 'STRATEGY_FOR', 'h1', '上海瑞金医院', 'Hospital'],
  ['mc1', 'COMPLIES_WITH', 'cr1', '会议时长限制', 'ComplianceRule'],
  ['t1', 'IMPACTED_BY', 'd1', '张主任', 'Doctor']
].map(([source, relationType, target, targetLabel, targetObjectType, strength, frequency, volume]) => ({
  source: source as string,
  relationType: relationType as string,
  target: target as string,
  targetLabel: targetLabel as string,
  targetObjectType: targetObjectType as string,
  strength: strength as number | undefined,
  frequency: frequency as string | undefined,
  volume: volume as number | undefined
}))

export const SALES_ONTOLOGY_DEMO_OBJECT_ACTIONS: SalesOntologyDemoObjectAction[] = [
  { id: 'act_schedule_visit', objectId: 'd1', name: 'scheduleVisit', description: '安排一次拜访', requiresApproval: false, preconditions: ["doctor.lifecycleStage != 'churned'", 'visitDate > now()'], sideEffects: ['create VisitRecord', 'update doctor.nextRecommendedVisitDate'], writeBackTargets: ['CRM'] },
  { id: 'act_update_sentiment', objectId: 'd1', name: 'updateSentiment', description: '更新医生态度', requiresApproval: false, preconditions: ['evidence.length > 10'], sideEffects: ['update doctor.sentiment', 'trigger InferenceEngine.recompute'], writeBackTargets: ['CRM'] },
  { id: 'act_flag_compliance', objectId: 'd1', name: 'flagComplianceRisk', description: '标记合规风险', requiresApproval: true, preconditions: ["caller.role in ['compliance', 'manager', 'agent']"], sideEffects: ['create ComplianceAlert', 'notify doctor.managedBy'], writeBackTargets: ['CRM', 'ComplianceSystem'] },
  { id: 'act_mark_at_risk', objectId: 'd1', name: 'markAsAtRisk', description: '标记为流失风险', requiresApproval: false, sideEffects: ["update lifecycleStage='at_risk'", 'trigger AtRiskAgent.handle'], writeBackTargets: ['CRM'] },
  { id: 'act_generate_brief', objectId: 'd1', name: 'generateVisitBrief', description: '生成拜访简报', requiresApproval: false, sideEffects: ['create VisitBrief'] },
  { id: 'act_update_access', objectId: 'h1', name: 'updateAccessStatus', description: '更新准入状态', requiresApproval: true, preconditions: ["caller.role in ['manager', 'director']"], sideEffects: ['update hospital.accessStatus'], writeBackTargets: ['ERP'] },
  { id: 'act_dismiss', objectId: 'c1', name: 'dismiss', description: '忽略预警', requiresApproval: true, sideEffects: ['update alert.status=dismissed'] },
  { id: 'act_escalate', objectId: 'c1', name: 'escalate', description: '升级处理', requiresApproval: false, sideEffects: ['notify compliance officer', 'update alert.status=escalated'], writeBackTargets: ['ComplianceSystem'] },
  { id: 'act_approve_plan', objectId: 'rp1', name: 'approve', description: '批准恢复计划', requiresApproval: true, sideEffects: ['update plan.status=approved', 'create ActionItems'], writeBackTargets: ['CRM'] },
  { id: 'act_reject_plan', objectId: 'rp1', name: 'reject', description: '拒绝恢复计划', requiresApproval: false, sideEffects: ['update plan.status=rejected'] }
]

export const SALES_ONTOLOGY_DEMO_PROPOSALS: SalesOntologyDemoProposal[] = [
  {
    key: 'ap1',
    title: '干预处方量下滑',
    description: '张主任近期诺欣妥处方量下降25%，建议立即安排拜访调查原因。',
    actionType: 'scheduleVisit',
    entityExternalKey: 'd1',
    entityName: '张主任',
    entityObjectType: 'Doctor',
    priority: 'high',
    confidence: 0.92,
    status: 'pending',
    proposedBy: 'InsightAgent',
    reasoningConclusion: '建议将张主任标记为流失风险',
    reasoningConfidence: 0.82,
    evidence: ['近3个月处方量：120→95→72，下降40%', '竞品X近期举办了2次科室会', '最近一次拜访距今45天，超出建议频次'],
    alternativeHypotheses: [{ hypothesis: '可能是季节性波动', confidence: 0.15 }, { hypothesis: '可能是医院采购政策变化', confidence: 0.03 }],
    suggestedActions: [{ actionName: 'scheduleVisit', priority: 'high', reason: '尽快恢复拜访频次' }, { actionName: 'prepareCompetitorResponse', priority: 'medium', reason: '准备针对竞品X的应对话术' }],
    actionDefinition: { id: 'act_schedule_visit', name: 'scheduleVisit', description: '安排一次拜访', requiresApproval: false, preconditions: ["doctor.lifecycleStage != 'churned'", 'visitDate > now()'], sideEffects: ['create VisitRecord', 'update doctor.nextRecommendedVisitDate', 'notify SalesRep'], writeBackTargets: ['CRM'] }
  },
  {
    key: 'ap2',
    title: '合规风险预警',
    description: '王代表本月招待费已接近红线，建议审核其最新的报销申请。',
    actionType: 'flagComplianceRisk',
    entityExternalKey: 'r1',
    entityName: '王代表',
    entityObjectType: 'SalesRep',
    priority: 'medium',
    confidence: 0.88,
    status: 'pending',
    proposedBy: 'ComplianceAgent',
    reasoningConclusion: '建议审核王代表的招待费报销',
    reasoningConfidence: 0.88,
    evidence: ['单次餐饮费用超过￥500', '本月招待频次高于平均水平30%'],
    actionDefinition: { id: 'act_flag_compliance', name: 'flagComplianceRisk', description: '标记合规风险', requiresApproval: true, preconditions: ["caller.role in ['compliance', 'manager', 'agent']"], sideEffects: ['create ComplianceAlert', 'notify doctor.managedBy'], writeBackTargets: ['CRM', 'ComplianceSystem'] }
  },
  {
    key: 'ap3',
    title: '邀请参加学术沙龙',
    description: '李教授最近发表了相关论文，建议邀请其作为讲者参加下周的区域沙龙。',
    actionType: 'inviteToEvent',
    entityExternalKey: 'd2',
    entityName: '李教授',
    entityObjectType: 'Doctor',
    priority: 'low',
    confidence: 0.75,
    status: 'approved',
    proposedBy: 'KnowledgeAgent',
    reasoningConclusion: '建议邀请李教授参加学术沙龙',
    reasoningConfidence: 0.75,
    evidence: ['近期发表了帕金森治疗论文', '与产品适应症高度匹配'],
    actionDefinition: { id: 'act_invite_event', name: 'inviteToEvent', description: '邀请参加学术活动', requiresApproval: false, sideEffects: ['create ActionItem', 'notify doctor'], writeBackTargets: ['CRM'] }
  }
]

export const SALES_ONTOLOGY_DEMO_NOTIFICATIONS: SalesOntologyDemoNotification[] = [
  { key: 'n1', type: 'risk_alert', title: '处方量异常下降', message: '张主任处方量连续3个月下降超过40%', priority: 'high', entityExternalKey: 'd1' },
  { key: 'n2', type: 'compliance_warning', title: '合规风险提示', message: '王代表本月招待费已接近上限', priority: 'medium', entityExternalKey: 'r1' }
]

export const SALES_ONTOLOGY_DEMO_REMINDERS: SalesOntologyDemoReminder[] = [
  { key: 'rem1', reminderType: 'urgent', title: '紧急客户拜访', description: '张主任处方量持续下降，需要紧急安排拜访', priority: 'high', status: 'active', entityExternalKey: 'd1' },
  { key: 'rem2', reminderType: 'important', title: '季度目标评审', description: 'Q1销售目标达成率83.3%，需要评审并制定Q2计划', priority: 'medium', status: 'active', entityExternalKey: 't1' },
  { key: 'rem3', reminderType: 'routine', title: '周报提交', description: '本周工作周报需在周五前提交', priority: 'low', status: 'active' },
  { key: 'rem4', reminderType: 'predictive', title: '预测性提醒：库存预警', description: '诺欣妥库存预计下月低于安全线', priority: 'medium', status: 'active', entityExternalKey: 'p1' },
  { key: 'rem5', reminderType: 'opportunity', title: '机会提醒：学术会议', description: '下周有心血管学术会议，建议邀请重点客户参加', priority: 'low', status: 'active', entityExternalKey: 'e1' }
]

export const SALES_ONTOLOGY_DEMO_SCENARIOS: SalesOntologyDemoScenario[] = [
  { key: 's1', scenarioType: 'resource_reallocation', name: 'Q2 资源重新分配 - 方案A', description: '模拟将20%预算从一级医院转移到二级核心医院的影响', category: 'sales_strategy', targetValue: 18000000, forecastValue: 16500000, achievementRate: 91.7, riskLevel: 'on_track', baselineTargetValue: 18000000, baselineForecastValue: 15000000, baselineAchievementRate: 83.3, baselineRiskLevel: 'at_risk', delta: 10, impactAnalysis: '资源重新分配后，预计业绩提升10%，风险等级从at_risk改善为on_track', parameters: [{ name: 'budgetShift', value: 20 }, { name: 'fromHospitalLevel', value: 'tier1' }, { name: 'toHospitalLevel', value: 'tier2' }, { name: 'productId', value: 'p1' }] },
  { key: 's2', scenarioType: 'product_mix_optimization', name: '产品组合优化', description: '调整新产品推广力度与老产品维持投入的平衡', category: 'sales_strategy', targetValue: 50000000, forecastValue: 53000000, achievementRate: 106, riskLevel: 'on_track', baselineTargetValue: 50000000, baselineForecastValue: 50000000, baselineAchievementRate: 100, baselineRiskLevel: 'on_track', delta: 6, impactAnalysis: '优化产品组合后，预计总销售额提升6%，新产品增长贡献显著', parameters: [{ name: 'newProductPromotion', value: 70 }, { name: 'oldProductMaintenance', value: 30 }] },
  { key: 's3', scenarioType: 'price_adjustment', name: '价格调整模拟', description: '模拟产品价格调整对销量和收入的影响', category: 'sales_strategy', targetValue: 50000000, forecastValue: 57500000, achievementRate: 115, riskLevel: 'on_track', baselineTargetValue: 50000000, baselineForecastValue: 50000000, baselineAchievementRate: 100, baselineRiskLevel: 'on_track', delta: 15, impactAnalysis: '降价5%后，销量增长15%，收入增长10%，市场份额可能提升', parameters: [{ name: 'priceChangePercent', value: -5 }, { name: 'competitorResponse', value: true }] },
  { key: 's4', scenarioType: 'channel_strategy', name: '渠道策略调整', description: '调整线上渠道、线下渠道和KOL投入的分配', category: 'sales_strategy', targetValue: 50000000, forecastValue: 52000000, achievementRate: 104, riskLevel: 'on_track', baselineTargetValue: 50000000, baselineForecastValue: 50000000, baselineAchievementRate: 100, baselineRiskLevel: 'on_track', delta: 4, impactAnalysis: '优化渠道组合后，预计业绩提升4%，KOL投入带来学术影响力提升', parameters: [{ name: 'onlineChannel', value: 40 }, { name: 'offlineChannel', value: 40 }, { name: 'kolInvestment', value: 20 }] },
  { key: 's5', scenarioType: 'kol_strategy', name: 'KOL策略调整', description: '调整KOL数量和单KOL投入，优化影响力传播', category: 'customer_management', targetValue: 50000000, forecastValue: 54000000, achievementRate: 108, riskLevel: 'on_track', baselineTargetValue: 50000000, baselineForecastValue: 50000000, baselineAchievementRate: 100, baselineRiskLevel: 'on_track', delta: 8, impactAnalysis: '增加KOL投入和学术活动后，预计影响力传播提升8%，处方量增长显著', parameters: [{ name: 'kolCount', value: 8 }, { name: 'perKolInvestment', value: 50000 }, { name: 'academicFrequency', value: 3 }] },
  { key: 's6', scenarioType: 'customer_churn_intervention', name: '客户流失干预', description: '对高风险客户进行干预，降低流失率', category: 'customer_management', targetValue: 50000000, forecastValue: 48500000, achievementRate: 97, riskLevel: 'at_risk', baselineTargetValue: 50000000, baselineForecastValue: 45000000, baselineAchievementRate: 90, baselineRiskLevel: 'critical', delta: 7.8, impactAnalysis: '干预后预计留存率提升7.8%，风险等级从critical改善为at_risk，需要持续跟进', parameters: [{ name: 'interventionType', value: 'visit' }, { name: 'interventionIntensity', value: 3 }, { name: 'targetCustomerId', value: 'd1' }] },
  { key: 's7', scenarioType: 'new_customer_development', name: '新客户开发优先级', description: '调整新医院开发策略，优化资源分配', category: 'customer_management', targetValue: 50000000, forecastValue: 51000000, achievementRate: 102, riskLevel: 'on_track', baselineTargetValue: 50000000, baselineForecastValue: 50000000, baselineAchievementRate: 100, baselineRiskLevel: 'on_track', delta: 2, impactAnalysis: '优化新客户开发策略后，预计新客户贡献提升2%，成功率提高', parameters: [{ name: 'hospitalCount', value: 5 }, { name: 'perHospitalInvestment', value: 80000 }, { name: 'timeCycle', value: 6 }] },
  { key: 's8', scenarioType: 'compliance_risk_response', name: '合规风险应对', description: '增加合规培训投入和监控力度，降低合规风险', category: 'risk_response', targetValue: 50000000, forecastValue: 49500000, achievementRate: 99, riskLevel: 'on_track', baselineTargetValue: 50000000, baselineForecastValue: 50000000, baselineAchievementRate: 100, baselineRiskLevel: 'on_track', delta: -1, impactAnalysis: '增加合规投入后，合规风险显著降低，但短期业绩略降1%，长期收益显著', parameters: [{ name: 'complianceTraining', value: 50000 }, { name: 'monitoringIntensity', value: 3 }, { name: 'penaltyAssumption', value: false }] },
  { key: 's9', scenarioType: 'competitor_response', name: '竞品应对策略', description: '针对竞品活动制定应对措施和投入预算', category: 'risk_response', targetValue: 50000000, forecastValue: 52500000, achievementRate: 105, riskLevel: 'on_track', baselineTargetValue: 50000000, baselineForecastValue: 50000000, baselineAchievementRate: 100, baselineRiskLevel: 'on_track', delta: 5, impactAnalysis: '积极应对竞品活动后，预计市场份额提升5%，客户忠诚度增强', parameters: [{ name: 'competitorActivity', value: 'academic' }, { name: 'responseMeasure', value: 'counter_academic' }, { name: 'responseBudget', value: 100000 }] },
  { key: 's10', scenarioType: 'emergency_response', name: '突发事件应对', description: '模拟产品断货、召回或负面新闻等突发事件的应对方案', category: 'risk_response', targetValue: 50000000, forecastValue: 45000000, achievementRate: 90, riskLevel: 'at_risk', baselineTargetValue: 50000000, baselineForecastValue: 50000000, baselineAchievementRate: 100, baselineRiskLevel: 'on_track', delta: -10, impactAnalysis: '突发事件预计造成10%业绩损失，快速响应可将损失降至最低，需密切监控客户满意度', parameters: [{ name: 'eventType', value: 'shortage' }, { name: 'responsePlan', value: 'expedited_shipping' }, { name: 'expectedDuration', value: 14 }] }
]

export const SALES_ONTOLOGY_DEMO_INFERENCE_RULES: SalesOntologyDemoInferenceRule[] = [
  { id: 'R001', name: '处方量持续下降检测', description: '检测医生处方量连续3个月下降超过20%', ruleType: 'deduction', conditionPattern: 'Doctor.prescriptionVolume', conclusionType: 'alert', confidenceBase: 0.8, tags: ['处方量', '风险检测'] },
  { id: 'R002', name: '拜访间隔过长检测', description: '检测医生拜访间隔超过建议频次', ruleType: 'deduction', conditionPattern: 'Doctor.lastVisitDate', conclusionType: 'alert', confidenceBase: 0.7, tags: ['拜访', '频率'] },
  { id: 'R003', name: '竞品渗透检测', description: '检测医院或科室出现竞品活动增加', ruleType: 'abduction', conditionPattern: 'Hospital.competitorActivity', conclusionType: 'new_link', confidenceBase: 0.6, tags: ['竞品', '渗透'] },
  { id: 'R004', name: '合规风险预测', description: '基于费用趋势预测合规风险', ruleType: 'induction', conditionPattern: 'SalesRep.expenseTrend', conclusionType: 'alert', confidenceBase: 0.75, tags: ['合规', '费用'] },
  { id: 'R005', name: '客户流失风险', description: '综合评估客户流失风险', ruleType: 'deduction', conditionPattern: 'Doctor.lifecycleStage', conclusionType: 'new_property', confidenceBase: 0.85, tags: ['流失', '风险'] },
  { id: 'R006', name: '学术影响力传播', description: '检测KOL学术影响力传播路径', ruleType: 'abduction', conditionPattern: 'Doctor.influenceScore', conclusionType: 'new_link', confidenceBase: 0.65, tags: ['KOL', '影响力'] },
  { id: 'R007', name: '预算超支预警', description: '检测预算类别执行率超过阈值', ruleType: 'deduction', conditionPattern: 'BudgetCategory.executionRate', conclusionType: 'alert', confidenceBase: 0.9, tags: ['预算', '预警'] }
]
