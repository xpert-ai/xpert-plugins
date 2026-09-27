/**
 * 链路 B 模型直调的 prompt 与抽取结果归一模块（spec v2.2 §7.7）
 *
 * 与 resume-screen-parse.processor.ts 拆分：processor 只负责编排（认领/调用/回填/兜底），
 * 本文件承载纯函数契约——prompt 构造、zod 结构化 schema、结果归一与文本 JSON 容错抽取，
 * 便于单测直接断言提示词红线（人工修正保护、阈值仅提示、不虚构）。
 */
import { z } from 'zod/v3'

/** 抽取/评分结果契约（与 middleware save 工具同 schema 语义，字段裁剪对齐 ResumeScreenAgentCandidateInput） */
export interface ExtractedCandidate {
  name?: string
  yearsOfExperience?: string
  education?: string
  currentCompany?: string
  skills?: string[]
  summary?: string
  matchScore?: number
  matchReason?: string
  hitPoints?: string[]
  riskPoints?: string[]
}

/** prompt 构造所需的最小行视图（getCandidateForParse 返回值结构上满足） */
export interface ResumeScreenParsePromptRow {
  jobTitle?: string
  jobJdText?: string
  sourceText?: string
  humanEditedFields?: string[]
}

// 结构化输出 schema（zod v3，langchain withStructuredOutput 直接接受）：
// 全部字段 optional——模型对扫描件/信息残缺简历也应能返回对象，缺失语义由 prompt 约束 riskPoints 承接
export const extractJsonSchema = z.object({
  name: z.string().optional(),
  yearsOfExperience: z.string().optional(),
  education: z.string().optional(),
  currentCompany: z.string().optional(),
  skills: z.array(z.string()).optional(),
  summary: z.string().optional(),
  matchScore: z.number().optional(),
  matchReason: z.string().optional(),
  hitPoints: z.array(z.string()).optional(),
  riskPoints: z.array(z.string()).optional()
})

/**
 * 构造「JD+单份简历」解析评分提示词
 *
 * 红线（spec §7.7 工具描述原文迁移）：只输出 JSON、不虚构缺失置空进 riskPoints、
 * humanEditedFields 非空时要求不覆盖人工已修正字段；scoreThreshold 仅作界面提示同源
 * 参考，严禁出现自动推进/接受语义（推进决策永远归人）。
 *
 * @param row 解析行视图（岗位/简历原文/人工修正字段名）
 * @param options.scoreThreshold 工作台评分阈值（来自插件配置），未配置则不写入提示
 * @returns 单条 user message 文本
 */
export function buildParsePrompt(row: ResumeScreenParsePromptRow, options?: { scoreThreshold?: number }): string {
  const lines: string[] = [
    '你是简历解析与评分引擎。请阅读【简历原文】，对照【当前岗位 JD】抽取信息并给出匹配评分。',
    '只输出 JSON（单个对象，不要 markdown 代码块围栏，不要任何解释文字）。',
    '',
    '【输出字段】',
    'name: 候选人姓名',
    'yearsOfExperience: 工作年限（字符串，如 "5" 或 "5-8"）',
    'education: 最高学历',
    'currentCompany: 当前/最近任职公司',
    'skills: 技能关键词数组',
    'summary: 3 句以内的画像总结',
    'matchScore: 与 JD 的匹配分，0-100 整数',
    'matchReason: 评分理由（一段话）',
    'hitPoints: 命中 JD 要求的关键点数组',
    'riskPoints: 风险项与信息缺口数组',
    '',
    '【硬性约束】',
    '- 不虚构、不推测：原文没有的信息一律留空，并把缺口写进 riskPoints；',
    '- matchScore 必须逐条比对 JD 要求后给出，不给无依据的高分；',
    '- 输出必须是合法 JSON：字符串使用双引号，数组不得含空元素。'
  ]
  const edited = (row.humanEditedFields ?? []).filter((field) => typeof field === 'string' && field.trim())
  if (edited.length > 0) {
    lines.push(`- 该候选人的以下字段已被评审修正过：${edited.join('、')}；重新解析时不要覆盖人工已修正字段，拿不准的保持留空。`)
  }
  if (options?.scoreThreshold !== undefined) {
    lines.push(`- 参考阈值 ${options.scoreThreshold} 分只是工作台界面提示，是否进入下一轮完全由评审人决定，阈值不得影响你的评分与输出。`)
  }
  lines.push(
    '',
    `【当前岗位：${row.jobTitle || '未命名岗位'}】`,
    row.jobJdText || '（JD 缺失，谨慎评分并把缺口写进 riskPoints）',
    '',
    '【简历原文】',
    row.sourceText || ''
  )
  return lines.join('\n')
}

/** 字符串字段归一：trim 后为空视为缺省；模型偶发数字年限（5）转字符串保留 */
function optionalString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value.trim() || undefined
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }
  return undefined
}

/** 字符串数组归一：剔除非字符串与空白项；结果为空数组视为缺省（不落 [] 覆盖既有值） */
function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  const items = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
  return items.length > 0 ? items : undefined
}

/**
 * 模型返回值 → 服务层候选人输入形状
 *
 * matchScore 统一 Number 化并夹到 0-100 取整（saveCandidatesFromAgent 会拒绝越界整数，
 * 这里先归一避免整笔回填失败）；其余字段裁剪空值，防止 undefined 之外的脏值进库。
 */
export function normalizeExtracted(value: unknown): ExtractedCandidate {
  const source = (value ?? {}) as Record<string, unknown>
  const result: ExtractedCandidate = {}
  const name = optionalString(source.name)
  if (name) {
    result.name = name
  }
  const years = optionalString(source.yearsOfExperience)
  if (years) {
    result.yearsOfExperience = years
  }
  const education = optionalString(source.education)
  if (education) {
    result.education = education
  }
  const company = optionalString(source.currentCompany)
  if (company) {
    result.currentCompany = company
  }
  const summary = optionalString(source.summary)
  if (summary) {
    result.summary = summary
  }
  const reason = optionalString(source.matchReason)
  if (reason) {
    result.matchReason = reason
  }
  const skills = optionalStringArray(source.skills)
  if (skills) {
    result.skills = skills
  }
  const hitPoints = optionalStringArray(source.hitPoints)
  if (hitPoints) {
    result.hitPoints = hitPoints
  }
  const riskPoints = optionalStringArray(source.riskPoints)
  if (riskPoints) {
    result.riskPoints = riskPoints
  }
  const score = Number(source.matchScore)
  if (Number.isFinite(score)) {
    result.matchScore = Math.min(100, Math.max(0, Math.round(score)))
  }
  return result
}

/**
 * 纯文本响应中的 JSON 容错抽取（F6 风险 5 的降级路径）
 *
 * 依次尝试：剥 ```/```json 围栏取块内文本 → 截取首 { 到末 } 的宽松切片；
 * 全部失败返回 null 由调用方决定失败语义（不猜、不修补半截 JSON）。
 */
export function extractJsonLoose(text: string): Record<string, unknown> | null {
  if (!text) {
    return null
  }
  const candidates: string[] = []
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) {
    candidates.push(fenced[1])
  }
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) {
    candidates.push(text.slice(start, end + 1))
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate.trim())
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      // 单候选失败继续尝试下一切片，最终由返回值 null 表达整体失败
    }
  }
  return null
}
