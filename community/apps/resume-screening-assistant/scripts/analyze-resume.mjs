/**
 * 用真实模型跑一遍简历初筛：1 个 JD + N 份简历。
 *
 * 这个脚本存在的意义是证明插件里的抽取规则和评分规则真的能跑，
 * 而不是靠预览环境里的 fakeAiResult() 造数据。所以它不自己写 Prompt，
 * 而是 import 编译产物 dist/lib/prompts/，跑的就是 Agent 里用的那套规则。
 *
 * 用法：
 *   node scripts/analyze-resume.mjs                  # 跑 demo/ 下的数据
 *   node scripts/analyze-resume.mjs --print-prompt   # 只打印 Prompt，不调模型
 *   node scripts/analyze-resume.mjs --check          # 只检查 key 和网络能不能通
 *
 * 环境变量：
 *   DEEPSEEK_API_KEY    必填
 *   DEEPSEEK_BASE_URL   默认 https://api.deepseek.com/v1
 *   DEEPSEEK_MODEL      默认 deepseek-chat
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(scriptDir, '..')
const distEntry = join(packageRoot, 'dist', 'lib', 'prompts', 'index.js')

loadEnvFiles([
  join(packageRoot, '.env'),
  join(packageRoot, '.env.local'),
  resolve(packageRoot, '..', '..', '.env')
])

const options = parseArgs(process.argv.slice(2))
const jobPath = resolve(packageRoot, options.job)
const resumeDir = resolve(packageRoot, options.resumes)
const outputDir = resolve(packageRoot, options.out)
const model = options.model ?? process.env.DEEPSEEK_MODEL ?? 'deepseek-chat'
const baseUrl = (process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1').replace(/\/+$/, '')

if (options.check) {
  await checkApiKey()
  process.exit(0)
}

const prompts = await loadPrompts()

const job = loadJob(jobPath)
const resumes = loadResumes(resumeDir, { allowPlaceholder: options.printPrompt })

if (!resumes.length) {
  console.error(`没有在 ${resumeDir} 找到简历文件。`)
  console.error('请把简历放成 .txt 或 .md 文件，每份一个文件。')
  process.exit(1)
}

console.log(`岗位：${job.title}`)
console.log(`判定项：必备技能 ${job.mustHaveSkills.length} 条，加分技能 ${job.niceToHaveSkills.length} 条，最低经验 ${job.minYearsExperience ?? '未设置'}`)
console.log(`简历：${resumes.length} 份（${resumes.map((item) => item.sourceName).join('、')}）`)
console.log(`模型：${model} @ ${baseUrl}`)
console.log('')

if (options.printPrompt) {
  const first = resumes[0]
  const { extraction, matching } = prompts.buildResumeExtractionAndMatchingPrompts(
    { job, candidate: first },
    { outputMode: 'json' }
  )
  console.log('================ 结构化抽取 Prompt ================')
  console.log(extraction)
  console.log('')
  console.log('================ JD 匹配评分 Prompt ================')
  console.log(matching)
  process.exit(0)
}

const apiKey = process.env.DEEPSEEK_API_KEY
if (!apiKey) {
  console.error('缺少 DEEPSEEK_API_KEY。')
  console.error('可以在插件根目录建 .env 写入 DEEPSEEK_API_KEY=sk-xxx，或直接作为环境变量传入。')
  console.error('注意不要把真实 key 提交进仓库。')
  process.exit(1)
}

const results = []
for (const [index, resume] of resumes.entries()) {
  console.log(`[${index + 1}/${resumes.length}] 分析 ${resume.sourceName} ...`)

  const { extraction } = prompts.buildResumeExtractionAndMatchingPrompts(
    { job, candidate: resume },
    { outputMode: 'json' }
  )

  let extracted = null
  try {
    extracted = await callJson({ apiKey, baseUrl, model, prompt: extraction, label: 'extraction' })
    console.log(`  抽取完成：${extracted.candidateName ?? '未识别姓名'}，技能 ${(extracted.skills ?? []).length} 项`)
  } catch (error) {
    console.error(`  抽取失败：${error.message}`)
    results.push({ sourceName: resume.sourceName, stage: 'extraction', error: error.message })
    continue
  }

  let matchResult = null
  try {
    matchResult = await callJson({
      apiKey,
      baseUrl,
      model,
      prompt: matchingWithExtracted(job, resume, extracted),
      label: 'matching'
    })
    console.log(`  评分完成：${matchResult.score} 分 / ${matchResult.recommendation}`)
  } catch (error) {
    console.error(`  评分失败：${error.message}`)
    results.push({ sourceName: resume.sourceName, stage: 'matching', error: error.message, extracted })
    continue
  }

  const breakdown = parseBreakdown(matchResult.reason)
  const verification = verifyScore(matchResult, breakdown)
  if (!verification.ok) {
    console.warn(`  分数校验未通过：${verification.problems.join('；')}`)
  }

  results.push({
    sourceName: resume.sourceName,
    extracted,
    matchResult,
    breakdown,
    verification
  })
}

report(results)

function matchingWithExtracted(job, resume, extracted) {
  return prompts.buildResumeMatchingPrompt({ job, candidate: resume, extracted }, { outputMode: 'json' })
}

async function checkApiKey() {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    console.error('缺少 DEEPSEEK_API_KEY。')
    console.error(`请在 ${join(packageRoot, '.env')} 里填写，或作为环境变量传入。`)
    process.exit(1)
  }

  console.log(`检查对象：${model} @ ${baseUrl}`)
  console.log(`读取到的 key：${maskKey(apiKey)}`)
  console.log('正在发一次最小请求 ...')

  let response
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        max_tokens: 8,
        messages: [{ role: 'user', content: '回复两个字：正常' }]
      })
    })
  } catch (error) {
    console.error(`连不上 ${baseUrl}：${error.message}`)
    console.error('先确认网络能通，以及 DEEPSEEK_BASE_URL 是否写对。')
    process.exit(1)
  }

  const body = await response.text()
  if (!response.ok) {
    console.error(`请求失败 HTTP ${response.status}`)
    console.error(body.slice(0, 500))
    if (response.status === 401) {
      console.error('401：key 不对、已删除，或者复制时多了空格/引号。')
    } else if (response.status === 402) {
      console.error('402：账户余额不足，需要先去充值。')
    } else if (response.status === 404) {
      console.error('404：模型名或 base URL 不对。检查 DEEPSEEK_MODEL 和 DEEPSEEK_BASE_URL。')
    }
    process.exit(1)
  }

  const payload = JSON.parse(body)
  console.log('')
  console.log('连通正常，key 可用。')
  console.log(`模型回复：${payload?.choices?.[0]?.message?.content ?? '(空)'}`)
  console.log(`本次用量：${JSON.stringify(payload?.usage ?? {})}`)
}

function maskKey(apiKey) {
  if (apiKey.length <= 10) return `${apiKey.slice(0, 3)}***（长度 ${apiKey.length}）`
  return `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}（长度 ${apiKey.length}）`
}

async function loadPrompts() {
  if (!existsSync(distEntry)) {
    console.error(`找不到编译产物：${distEntry}`)
    console.error('请先运行 npm run build。')
    process.exit(1)
  }
  const loaded = await import(pathToFileURL(distEntry).href)
  const required = [
    'buildResumeExtractionPrompt',
    'buildResumeMatchingPrompt',
    'buildResumeAnalysisPrompt',
    'buildResumeExtractionAndMatchingPrompts'
  ]
  const missing = required.filter((name) => typeof loaded[name] !== 'function')
  if (missing.length) {
    console.error(`编译产物缺少导出：${missing.join('、')}`)
    console.error('dist 可能已经过期，请重新运行 npm run build。')
    process.exit(1)
  }
  return loaded
}

async function callJson({ apiKey, baseUrl, model, prompt, label }) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'user', content: prompt },
        { role: 'user', content: '请直接输出 JSON 对象。' }
      ]
    })
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`${label} 请求失败 HTTP ${response.status}：${body.slice(0, 400)}`)
  }

  const payload = await response.json()
  const content = payload?.choices?.[0]?.message?.content
  if (!content) {
    throw new Error(`${label} 返回内容为空：${JSON.stringify(payload).slice(0, 400)}`)
  }

  return parseJson(content, label)
}

function parseJson(content, label) {
  const cleaned = String(content)
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()

  try {
    return JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1))
      } catch (error) {
        throw new Error(`${label} 返回的不是合法 JSON：${String(error.message)}`)
      }
    }
    throw new Error(`${label} 返回的不是合法 JSON。原始内容前 200 字：${cleaned.slice(0, 200)}`)
  }
}

function parseBreakdown(reason) {
  const text = String(reason ?? '')
  const read = (label, max) => {
    const match = text.match(new RegExp(`${label}\\s*[A-D]?\\s*[:：]\\s*(\\d+)\\s*\\/\\s*${max}`))
    return match ? Number(match[1]) : null
  }
  return {
    hardRequirement: read('硬性要求', 40),
    experience: read('经历相关', 25),
    skill: read('技能能力', 20),
    risk: read('风险完整度', 15),
    total: (() => {
      const match = text.match(/合计\s*[:：]\s*(\d+)\s*\/\s*100/)
      return match ? Number(match[1]) : null
    })()
  }
}

function verifyScore(matchResult, breakdown) {
  const problems = []
  const parts = [breakdown.hardRequirement, breakdown.experience, breakdown.skill, breakdown.risk]

  if (parts.some((value) => value === null)) {
    problems.push('reason 里缺少评分明细，或格式不符合 docs/scoring.md 的契约')
    return { ok: false, problems, sum: null }
  }

  const sum = parts.reduce((total, value) => total + value, 0)
  if (sum !== matchResult.score) {
    problems.push(`四项之和 ${sum} 与 score ${matchResult.score} 不一致`)
  }
  if (breakdown.total !== null && breakdown.total !== sum) {
    problems.push(`明细里的合计 ${breakdown.total} 与四项之和 ${sum} 不一致`)
  }
  if (!['interview', 'hold', 'reject'].includes(matchResult.recommendation)) {
    problems.push(`推荐值 ${matchResult.recommendation} 不是 interview/hold/reject`)
  }

  return { ok: problems.length === 0, problems, sum }
}

function report(results) {
  const succeeded = results.filter((item) => item.matchResult)

  console.log('')
  console.log('================ 结果 ================')

  if (succeeded.length) {
    console.log('候选人 | 总分 | 推荐 | A硬性 | B经历 | C技能 | D风险 | 校验')
    console.log('-'.repeat(72))
    for (const item of succeeded) {
      const { breakdown, verification, matchResult, extracted } = item
      const name = extracted?.candidateName || item.sourceName
      console.log(
        [
          pad(name, 12),
          pad(matchResult.score, 5),
          pad(matchResult.recommendation, 8),
          pad(breakdown.hardRequirement ?? '-', 6),
          pad(breakdown.experience ?? '-', 6),
          pad(breakdown.skill ?? '-', 6),
          pad(breakdown.risk ?? '-', 6),
          verification.ok ? '通过' : '失败'
        ].join(' | ')
      )
    }

    const failed = succeeded.filter((item) => !item.verification.ok)
    if (failed.length) {
      console.log('')
      console.log('以下是分数校验失败的原因：')
      for (const item of failed) {
        console.log(`- ${item.sourceName}：${item.verification.problems.join('；')}`)
      }
    }
  }

  const errored = results.filter((item) => item.error)
  if (errored.length) {
    console.log('')
    console.log('调用失败的简历：')
    for (const item of errored) {
      console.log(`- ${item.sourceName}（${item.stage}）：${item.error}`)
    }
  }

  mkdirSync(outputDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outPath = join(outputDir, `result-${stamp}.json`)
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        model,
        baseUrl,
        job,
        results
      },
      null,
      2
    )
  )

  console.log('')
  console.log(`完整结果已写入 ${outPath}`)

  if (results.some((item) => item.error) || results.some((item) => item.matchResult && !item.verification.ok)) {
    process.exitCode = 1
  }
}

function pad(value, width) {
  const text = String(value ?? '')
  const cjk = (text.match(/[一-龥]/g) ?? []).length
  const visual = text.length + cjk
  return text + ' '.repeat(Math.max(0, width - visual))
}

function loadJob(filePath) {
  if (!existsSync(filePath)) {
    console.error(`找不到岗位文件：${filePath}`)
    console.error('请准备 demo/job.json（推荐，可以写必备技能）或 demo/jd.md。')
    process.exit(1)
  }

  if (filePath.endsWith('.json')) {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'))
    return {
      id: parsed.id ?? 'job-demo',
      title: parsed.title ?? '未命名岗位',
      jd: String(parsed.jd ?? ''),
      mustHaveSkills: toList(parsed.mustHaveSkills),
      niceToHaveSkills: toList(parsed.niceToHaveSkills),
      minYearsExperience: typeof parsed.minYearsExperience === 'number' ? parsed.minYearsExperience : null,
      screeningNotes: parsed.screeningNotes ?? null
    }
  }

  const text = readFileSync(filePath, 'utf8')
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) ?? ''
  return {
    id: 'job-demo',
    title: firstLine.replace(/^#+\s*/, '').trim() || '未命名岗位',
    jd: text,
    mustHaveSkills: [],
    niceToHaveSkills: [],
    minYearsExperience: null,
    screeningNotes: null
  }
}

function loadResumes(dir, options = {}) {
  if (!existsSync(dir)) {
    if (options.allowPlaceholder) {
      return [placeholderResume()]
    }
    console.error(`找不到简历目录：${dir}`)
    console.error('请创建该目录并放入简历文件（.txt 或 .md）。')
    process.exit(1)
  }

  const resumes = readdirSync(dir)
    .filter((name) => /\.(txt|md|markdown)$/i.test(name) && !/^readme\.md$/i.test(name))
    .sort()
    .map((name) => ({
      id: `candidate-${name.replace(/\.[^.]+$/, '')}`,
      sourceName: name,
      rawText: readFileSync(join(dir, name), 'utf8')
    }))
  return resumes.length || !options.allowPlaceholder ? resumes : [placeholderResume()]
}

function placeholderResume() {
  return {
    id: 'candidate-demo',
    sourceName: 'demo-resume.txt',
    rawText: '姓名：候选人示例\\n工作经历：请在 demo/resumes 放入真实 txt 或 md 简历后运行真实分析。'
  }
}

function toList(value) {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : []
}

function parseArgs(argv) {
  const parsed = {
    job: 'demo/job.json',
    resumes: 'demo/resumes',
    out: 'demo/output',
    model: null,
    printPrompt: false,
    check: false
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--') {
      continue
    } else if (arg === '--print-prompt') {
      parsed.printPrompt = true
    } else if (arg === '--check') {
      parsed.check = true
    } else if (arg === '--job') {
      parsed.job = argv[++index]
    } else if (arg === '--resumes') {
      parsed.resumes = argv[++index]
    } else if (arg === '--out') {
      parsed.out = argv[++index]
    } else if (arg === '--model') {
      parsed.model = argv[++index]
    } else {
      console.error(`无法识别的参数：${arg}`)
      process.exit(1)
    }
  }

  return parsed
}

function loadEnvFiles(paths) {
  for (const file of paths) {
    if (!existsSync(file)) continue
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
      if (!match) continue
      const key = match[1]
      const value = match[2].trim().replace(/^["']|["']$/g, '').trim()
      if (process.env[key] === undefined) {
        process.env[key] = value
      }
    }
  }
}
