import { writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(scriptDir, '..')
const distEntry = join(packageRoot, 'dist', 'lib', 'prompts', 'index.js')
const outputPath = join(packageRoot, 'docs', 'prompt.md')

let prompts
try {
  prompts = await import(pathToFileURL(distEntry).href)
} catch (error) {
  console.error(`无法加载编译后的 Prompt 模块：${distEntry}`)
  console.error('请先运行 npm run build，再运行 npm run prompts:export。')
  console.error(String(error?.message ?? error))
  process.exit(1)
}

const sampleJob = {
  id: 'job-demo',
  title: '<岗位名称>',
  jd: '<岗位 JD 原文>',
  mustHaveSkills: ['<必备技能 1>', '<必备技能 2>'],
  niceToHaveSkills: ['<加分技能 1>'],
  minYearsExperience: 3,
  screeningNotes: '<筛选说明>'
}

const sampleCandidate = {
  id: 'candidate-demo',
  sourceName: '<简历文件名>',
  rawText: '<简历原文>'
}

const toolExtraction = prompts.buildResumeExtractionPrompt(
  { job: sampleJob, candidate: sampleCandidate },
  { outputMode: 'tool' }
)
const jsonExtraction = prompts.buildResumeExtractionPrompt(
  { job: sampleJob, candidate: sampleCandidate },
  { outputMode: 'json' }
)
const toolMatching = prompts.buildResumeMatchingPrompt(
  { job: sampleJob, candidate: sampleCandidate },
  { outputMode: 'tool' }
)
const jsonMatching = prompts.buildResumeMatchingPrompt(
  { job: sampleJob, candidate: sampleCandidate },
  { outputMode: 'json' }
)
const combined = prompts.buildResumeAnalysisPrompt(sampleJob, sampleCandidate, { outputMode: 'tool' })

const content = [
  '# Prompt 全文',
  '',
  '> 本文件由 `corepack pnpm prompts:export` 从 `src/lib/prompts/` 生成，请勿手工编辑。',
  '> 修改 Prompt 请改 TypeScript 源文件，然后重新运行导出与构建。',
  '',
  '## 关于两种输出模式',
  '',
  '同一套抽取规则和评分规则，有两种输出指令：',
  '',
  '- `tool` 模式：给 Agent 用，要求模型调用插件 middleware 工具保存结果。插件线上跑的是这一种。',
  '- `json` 模式：给 `scripts/analyze-resume.mjs` 用，要求模型直接返回 JSON。本地验证脚本跑的是这一种。',
  '',
  '两种模式共用同一段系统提示词，所以本地脚本验证到的规则就是线上生效的规则。',
  '只有末尾的输出指令不同，下面的"差异部分"单独列出。',
  '',
  '## 1. 结构化抽取 Prompt',
  '',
  '### 1.1 系统提示词',
  '',
  fence(prompts.RESUME_EXTRACTION_SYSTEM_PROMPT),
  '',
  '### 1.2 tool 模式下的输出指令',
  '',
  fence(prompts.RESUME_EXTRACTION_TOOL_INSTRUCTION),
  '',
  '### 1.3 json 模式下的输出指令',
  '',
  fence(prompts.RESUME_EXTRACTION_JSON_INSTRUCTION),
  '',
  '### 1.4 完整样例（tool 模式）',
  '',
  fence(toolExtraction),
  '',
  '### 1.5 完整样例（json 模式）',
  '',
  fence(jsonExtraction),
  '',
  '## 2. JD 匹配评分 Prompt',
  '',
  '### 2.1 系统提示词（含 40/25/20/15 评分规则全文）',
  '',
  fence(prompts.RESUME_MATCHING_SYSTEM_PROMPT),
  '',
  '### 2.2 字段写法规则',
  '',
  fence(prompts.RESUME_MATCHING_FIELD_RULES),
  '',
  '### 2.3 reason 明细格式契约',
  '',
  fence(prompts.RESUME_MATCHING_REASON_CONTRACT),
  '',
  '### 2.4 完整样例（tool 模式）',
  '',
  fence(toolMatching),
  '',
  '### 2.5 完整样例（json 模式）',
  '',
  fence(jsonMatching),
  '',
  '## 3. 组合 Prompt（插件在 Agent 中实际使用的入口）',
  '',
  '由 `buildResumeAnalysisPrompt` 生成，把上面两部分合并到一轮对话里。',
  '',
  fence(combined),
  '',
  '## 4. 与代码的对应关系',
  '',
  '| Prompt 片段 | 源文件 |',
  '| --- | --- |',
  '| 结构化抽取系统提示词 | `src/lib/prompts/resume-extraction.prompt.ts` |',
  '| JD 匹配评分系统提示词 | `src/lib/prompts/resume-matching.prompt.ts` |',
  '| 组合入口 | `src/lib/prompts/index.ts` |',
  '| 评分规则说明 | `docs/scoring.md` |',
  '| middleware 工具 schema | `src/lib/resume-screening-assistant.middleware.ts` |',
  '',
  '注意：Prompt 里的输出字段必须与 middleware 里的 zod schema 对得上。',
  '改字段时两边要一起改，否则模型返回的字段会被 schema 静默丢弃。',
  ''
].join('\n')

writeFileSync(outputPath, content)
console.log(`已生成 ${outputPath}`)

function fence(text) {
  return ['```text', String(text ?? '').trimEnd(), '```'].join('\n')
}
