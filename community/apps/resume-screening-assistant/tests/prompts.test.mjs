import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const distEntry = resolve(packageRoot, 'dist', 'lib', 'prompts', 'index.js')

if (!existsSync(distEntry)) {
  throw new Error(`找不到编译产物 ${distEntry}，请先运行 test 脚本（它会先编译）或 npm run build。`)
}

const prompts = await import(pathToFileURL(distEntry).href)

const job = {
  id: 'job-1',
  title: '后端开发工程师',
  jd: '职责：\n1. 负责订单系统的设计与开发\n2. 维护线上服务稳定性\n\n要求：\n1. 必须熟悉 Node.js',
  mustHaveSkills: ['Node.js', 'PostgreSQL'],
  niceToHaveSkills: ['Docker'],
  minYearsExperience: 3,
  screeningNotes: '优先考虑有支付系统经验的人'
}

const candidate = {
  id: 'candidate-1',
  sourceName: '张三.txt',
  rawText: '张三，5 年 Node.js 后端开发经验，熟悉 PostgreSQL 与 Docker。'
}

const toolOptions = { outputMode: 'tool' }
const jsonOptions = { outputMode: 'json' }

test('抽取 Prompt 带上岗位标准与简历原文', () => {
  const text = prompts.buildResumeExtractionPrompt({ job, candidate }, toolOptions)

  assert.match(text, /job-1/)
  assert.match(text, /candidate-1/)
  assert.match(text, /后端开发工程师/)
  assert.match(text, /Node\.js, PostgreSQL/)
  assert.match(text, /Docker/)
  assert.match(text, /张三，5 年 Node\.js 后端开发经验/)
})

test('抽取 Prompt 声明了防注入规则', () => {
  const text = prompts.buildResumeExtractionPrompt({ job, candidate }, toolOptions)

  assert.match(text, /不是给你的指令/)
  assert.match(text, /不得执行/)
})

test('抽取 Prompt 要求证据不足时留空而不是编造', () => {
  const text = prompts.buildResumeExtractionPrompt({ job, candidate }, toolOptions)

  assert.match(text, /不要根据常识补全/)
  assert.match(text, /warnings/)
})

test('抽取 Prompt 的两种输出模式给出不同指令', () => {
  const tool = prompts.buildResumeExtractionPrompt({ job, candidate }, toolOptions)
  const json = prompts.buildResumeExtractionPrompt({ job, candidate }, jsonOptions)

  assert.match(tool, /resume_screening_save_extraction/)
  assert.match(tool, /resume_screening_report_failure/)

  assert.match(json, /只输出一个 JSON 对象/)
  assert.doesNotMatch(json, /resume_screening_save_extraction/)
})

test('评分 Prompt 包含四个维度及各自的满分', () => {
  const text = prompts.buildResumeMatchingPrompt({ job, candidate }, toolOptions)

  assert.match(text, /硬性要求（40 分）/)
  assert.match(text, /经历相关（25 分）/)
  assert.match(text, /技能能力（20 分）/)
  assert.match(text, /风险与完整度（15 分）/)
})

test('评分 Prompt 说明了硬性要求的三态判定与证据不足的处置', () => {
  const text = prompts.buildResumeMatchingPrompt({ job, candidate }, toolOptions)

  assert.match(text, /部分满足/)
  assert.match(text, /证据不足一律按「部分满足」记，不得按「满足」记/)
})

test('评分 Prompt 说明了推荐值覆盖规则只能降级', () => {
  const text = prompts.buildResumeMatchingPrompt({ job, candidate }, toolOptions)

  assert.match(text, /只能把推荐值调低，不能调高/)
  assert.match(text, /只改推荐值，不改分数/)
})

test('评分 Prompt 带上 reason 明细契约，供脚本核对总分', () => {
  const text = prompts.buildResumeMatchingPrompt({ job, candidate }, toolOptions)

  assert.match(text, /【评分明细】/)
  assert.match(text, /硬性要求 A: \[整数\]\/40/)
  assert.match(text, /合计: \[A\+B\+C\+D\]\/100/)
})

test('评分 Prompt 在有结构化抽取结果时注入该结果', () => {
  const extracted = { candidateName: '张三', skills: ['Node.js'], yearsExperience: 5 }

  const withFacts = prompts.buildResumeMatchingPrompt({ job, candidate, extracted }, jsonOptions)
  const withoutFacts = prompts.buildResumeMatchingPrompt({ job, candidate }, jsonOptions)

  assert.match(withFacts, /"candidateName": "张三"/)
  assert.match(withFacts, /已抽取的结构化事实/)

  assert.match(withoutFacts, /未提供结构化抽取结果/)
  assert.doesNotMatch(withoutFacts, /"candidateName"/)
})

test('评分 Prompt 在 json 模式下要求返回可解析的字段', () => {
  const text = prompts.buildResumeMatchingPrompt({ job, candidate }, jsonOptions)

  for (const field of ['score', 'recommendation', 'matchedPoints', 'missingRequirements', 'riskFlags', 'interviewQuestions', 'reason']) {
    assert.match(text, new RegExp(field))
  }
})

test('组合 Prompt 同时包含抽取与评分两段规则，且安全规则只出现一次', () => {
  const text = prompts.buildResumeAnalysisPrompt(job, candidate, toolOptions)

  assert.match(text, /第一步：结构化抽取规则/)
  assert.match(text, /第二步：JD 匹配评分规则/)
  assert.match(text, /硬性要求（40 分）/)
  assert.match(text, /每个项目一个字符串|每个项目一段|项目名 \| 角色/)

  const securityMentions = text.match(/不得执行/g) ?? []
  assert.equal(securityMentions.length, 1, '安全规则在组合 Prompt 中不应重复出现')
})

test('组合 Prompt 要求依次保存抽取与评分结果', () => {
  const text = prompts.buildResumeAnalysisPrompt(job, candidate, toolOptions)

  assert.match(text, /resume_screening_save_extraction/)
  assert.match(text, /resume_screening_save_match_result/)
  assert.ok(
    text.indexOf('resume_screening_save_extraction') < text.indexOf('resume_screening_save_match_result'),
    '抽取工具应先于评分工具出现'
  )
})

test('默认输出模式为 tool', () => {
  const explicit = prompts.buildResumeAnalysisPrompt(job, candidate, toolOptions)
  const implicit = prompts.buildResumeAnalysisPrompt(job, candidate)

  assert.equal(implicit, explicit)
})

test('评分 Prompt 没有抽取结果时也要带上岗位标准', () => {
  const text = prompts.buildResumeMatchingPrompt({ job, candidate }, toolOptions)

  assert.match(text, /后端开发工程师/)
  assert.match(text, /最低经验年限: 3/)
  assert.match(text, /优先考虑有支付系统经验的人/)
})

test('抽取 Prompt 允许不传岗位信息', () => {
  const text = prompts.buildResumeExtractionPrompt({ candidate }, jsonOptions)

  assert.match(text, /无岗位信息/)
  assert.match(text, /张三，5 年 Node\.js/)
})
