import type { ExtractedResume } from '../types.js'

/**
 * Prompt 层的入参类型与共用的文本拼装工具。
 *
 * 刻意不直接依赖 TypeORM 实体：本地验证脚本（scripts/analyze-resume.mjs）传进来的是
 * 普通 JSON，而不是实体实例。这里只声明 Prompt 真正读到的最小字段集。
 */
export type ResumePromptJob = {
  id?: string | null
  title: string
  jd: string
  mustHaveSkills?: string[] | null
  niceToHaveSkills?: string[] | null
  minYearsExperience?: number | null
  screeningNotes?: string | null
}

export type ResumePromptCandidate = {
  id?: string | null
  sourceName: string
  rawText: string
}

export type ResumePromptOutputMode = 'tool' | 'json'

export type ResumePromptOptions = {
  /**
   * 调用方期望的输出形式。
   *
   * - `tool`：交给 Agent 使用，要求模型调用插件 middleware 工具保存结果（插件内运行路径）。
   * - `json`：交给脚本使用，要求模型直接返回 JSON（scripts/analyze-resume.mjs 验证路径）。
   *
   * 两种模式共用同一套抽取规则与评分规则，只有最后一段输出指令不同。
   */
  outputMode?: ResumePromptOutputMode
}

export type ResumeMatchingPromptInput = {
  job: ResumePromptJob
  candidate: ResumePromptCandidate
  /** 已完成的结构化抽取结果。真实流程里由第一步产出，评分第二步直接基于它打分。 */
  extracted?: ExtractedResume | null
}

export type ResumeExtractionPromptInput = {
  job?: ResumePromptJob | null
  candidate: ResumePromptCandidate
}

export function formatList(value: string[] | null | undefined): string {
  const items = Array.isArray(value) ? value.filter(Boolean) : []
  return items.length ? items.join(', ') : '-'
}

export function describeCandidate(candidate: ResumePromptCandidate): string {
  return [
    `candidateId: ${candidate.id ?? ''}`,
    `简历来源: ${candidate.sourceName}`,
    '',
    '简历原文:',
    '<<<RESUME_TEXT',
    candidate.rawText,
    'RESUME_TEXT>>>'
  ].join('\n')
}

export function describeJobCriteria(job: ResumePromptJob): string {
  return [
    `jobId: ${job.id ?? ''}`,
    `岗位名称: ${job.title}`,
    `必备技能: ${formatList(job.mustHaveSkills)}`,
    `加分技能: ${formatList(job.niceToHaveSkills)}`,
    `最低经验年限: ${job.minYearsExperience ?? '-'}`,
    `筛选说明: ${job.screeningNotes ?? '-'}`,
    '',
    '岗位 JD:',
    job.jd
  ].join('\n')
}
