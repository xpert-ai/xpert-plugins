import { z } from 'zod/v3'

const shortText = (label: string, max = 120) =>
  z.string().trim().min(1, `${label}不能为空`).max(max, `${label}不能超过${max}个字`)

const longText = (label: string, min = 40, max = 20000) =>
  z
    .string()
    .trim()
    .min(min, `${label}至少需要${min}个字，便于进行可靠分析`)
    .max(max, `${label}不能超过${max}个字`)

export const analysisInputSchema = z.object({
  candidateName: shortText('候选人姓名', 40),
  candidateTitle: z.string().trim().max(80).optional(),
  candidateYears: z.coerce.number().int().min(0).max(60).optional(),
  candidateCity: z.string().trim().max(40).optional(),
  candidatePhone: z.string().trim().max(40).optional(),
  candidateEmail: z.string().trim().max(120).optional(),
  jobTitle: shortText('岗位名称', 80),
  company: z.string().trim().max(80).optional(),
  jobCity: z.string().trim().max(40).optional(),
  salary: z.string().trim().max(40).optional(),
  jobText: longText('岗位说明'),
  resumeText: longText('简历内容')
}).strict()

export const analysisIdSchema = z.object({
  analysisId: z.string().uuid('分析记录编号格式不正确')
}).strict()

export const retryAnalysisSchema = analysisIdSchema.extend({
  expectedRevision: z.number().int().min(0)
}).strict()

const scoreSchema = z.number().int().min(0).max(100)

export const saveMatchResultSchema = z.object({
  analysisId: z.string().uuid('分析记录编号格式不正确').describe('工作台创建的分析记录编号，必须原样传入。'),
  attempt: z.number().int().min(1).describe('本次分析轮次，必须使用读取结果中返回的 attempt，重试后旧轮次结果会被拒绝。'),
  skillsScore: scoreSchema.describe('专业技能维度得分，0 到 100 的整数。'),
  experienceScore: scoreSchema.describe('工作经验维度得分，0 到 100 的整数。'),
  domainScore: scoreSchema.describe('行业与领域维度得分，0 到 100 的整数。'),
  educationScore: scoreSchema.describe('教育背景维度得分，0 到 100 的整数。'),
  skillsSummary: z.string().trim().min(1).max(300).describe('专业技能维度的判断依据，必须引用简历或岗位中的具体信息，不得虚构。'),
  experienceSummary: z.string().trim().min(1).max(300).describe('工作经验维度的判断依据。'),
  domainSummary: z.string().trim().min(1).max(300).describe('行业与领域维度的判断依据。'),
  educationSummary: z.string().trim().min(1).max(300).describe('教育背景维度的判断依据。'),
  matchedSkills: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(40).describe('已覆盖的技能或能力名称，使用中文；必要的技术名词可以保留原名。'),
        score: scoreSchema.describe('该技能覆盖程度，0 到 100。')
      }).strict()
    )
    .max(10)
    .describe('零到十项有原文证据的已覆盖能力，按重要程度排序；没有匹配项时传空数组，不要编造。'),
  missingSkills: z
    .array(z.string().trim().min(1).max(80))
    .max(6)
    .describe('尚未覆盖或证据不足的能力，最多六项；没有则传空数组。'),
  highlights: z
    .array(z.string().trim().min(1).max(240))
    .max(6)
    .describe('零到六条最关键匹配理由，每条必须能追溯到简历证据；没有匹配依据时传空数组。'),
  risks: z
    .array(z.string().trim().min(1).max(240))
    .max(5)
    .describe('需要人工核实的差距或风险，最多五条；没有则传空数组。'),
  summary: z.string().trim().min(1).max(800).describe('面向招聘负责人的综合判断，说明匹配程度和主要依据。'),
  recommendation: z.string().trim().min(1).max(300).describe('下一步行动建议，例如“建议进入面试”或“建议补充项目细节后再评估”。')
}).strict()

export const markFailedSchema = z.object({
  analysisId: z.string().uuid().describe('工作台创建的分析记录编号。'),
  attempt: z.number().int().min(1).describe('本次分析轮次，必须使用读取结果中返回的 attempt。'),
  reason: z.string().trim().min(1).max(500).describe('无法完成分析的简短原因，不要包含简历全文或敏感信息。')
}).strict()

export const confirmAnalysisSchema = z.object({
  analysisId: z.string().uuid(),
  expectedRevision: z.number().int().min(0),
  humanDecision: z.enum(['进入面试', '进入人才库', '暂不匹配']),
  humanScore: z.number().int().min(0).max(100),
  humanConclusion: z.string().trim().min(1, '请填写人工结论').max(1000)
}).strict()

export type AnalysisInputDto = z.infer<typeof analysisInputSchema>
export type SaveMatchResultDto = z.infer<typeof saveMatchResultSchema>
export type MarkFailedDto = z.infer<typeof markFailedSchema>
export type ConfirmAnalysisDto = z.infer<typeof confirmAnalysisSchema>
