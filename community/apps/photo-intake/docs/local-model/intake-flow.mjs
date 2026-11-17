// Drives the plugin's real IntakeService, IntakeAnalyzer, EvaluationService and EvaluationRunner
// (SQL.js in memory, as in the unit tests) against a vision model served by a local Ollama through
// its OpenAI-compatible endpoint. No Xpert host is involved: the host runtime is replaced by a small
// adapter that hands the plugin an Ollama client. Build first, then run from the plugin directory:
//   node --import tsx docs/local-model/intake-flow.mjs [outDir]
// The three images next to this file are drawn by code; they are not photographs.
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const plugin = process.cwd()
const imageDir = path.dirname(fileURLToPath(import.meta.url))
const outDir = process.argv[2] ?? path.join(os.tmpdir(), 'photo-intake-local-model')
const MODEL = process.env.OLLAMA_MODEL ?? 'qwen3.8:latest'
const BASE = process.env.OLLAMA_BASE ?? 'http://127.0.0.1:11434/v1'
const load = file => import(pathToFileURL(path.join(plugin, file)).href)
const { createService, scope } = await load('tests/fixtures.ts')
const { evaluationMetrics } = await load('dist/lib/domain/evaluation.js')
const openai = await import(pathToFileURL(createRequire(path.join(plugin, '../../package.json')).resolve('@langchain/openai')).href)
const ChatOpenAI = openai.ChatOpenAI ?? openai.default.ChatOpenAI
const PROMPT_B = '先观察可见物体与损坏，再选择类别。区分水相关问题与表面破损，不推测照片中看不到的故障；证据不足时选择 unclear。'
const SAMPLES = [
  { file: 'leak.png', title: '示意图：管道接头滴水到地面', person: 'plumbing' },
  { file: 'shapes.png', title: '示意图：几何图形，没有设施问题', person: 'unclear' },
  { file: 'crack.png', title: '示意图：墙面一条裂缝', person: 'surfaces' }
]
let modelCalls = 0
const runtimeFor = baseURL => ({
  getDefaultChatModel: async () => ({ model: MODEL, copilotId: 'local-ollama' }),
  createModelClient: async request => {
    modelCalls++
    const { max_tokens, ...rest } = request.options ?? {}
    return new ChatOpenAI({ model: request.model, apiKey: 'ollama', configuration: { baseURL }, maxTokens: max_tokens, ...rest })
  },
  wrapWorkflowNodeExecution: async () => { throw new Error('unused') }
})
const real = runtimeFor(BASE)
const dataUrl = async file => `data:image/png;base64,${(await readFile(path.join(imageDir, file))).toString('base64')}`
const brief = d => ({ title: d.title, status: d.status, suggestion: d.suggestion, confirmedCategoryId: d.confirmedCategoryId, failureCode: d.failureCode })
const timed = async work => { const begin = Date.now(); const value = await work(); return { value, ms: Date.now() - begin } }

await mkdir(outDir, { recursive: true })
const report = { model: MODEL, endpoint: BASE, startedAt: new Date().toISOString(), images: 'code-drawn illustrations, not photographs' }
const warmBegin = Date.now()
const warm = await fetch(BASE + '/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: 'Reply with OK.' }], max_tokens: 8 }) })
report.warmup = { httpStatus: warm.status, ms: Date.now() - warmBegin }

const f = await createService()
// 1. Intake: create, recognise once, a person confirms.
report.intake = []
const ids = []
for (const s of SAMPLES) {
  const created = await f.service.createCase(scope, { requestKey: randomUUID(), title: s.title, photo: { dataUrl: await dataUrl(s.file) } })
  const { value: suggested, ms } = await timed(() => f.analyzer.analyze(scope, created.id, real))
  const confirmed = await f.service.confirmCase(scope, { caseId: created.id, revision: suggested.revision, categoryId: s.person })
  report.intake.push({ file: s.file, recognitionMs: ms, afterRecognition: brief(suggested), personConfirmed: s.person, agreed: suggested.suggestion?.categoryId === s.person, finalStatus: confirmed.status })
  ids.push(created.id)
}
// 2. Acceptance: prompt in effect (A) against a candidate (B) on the confirmed cases.
const active = await f.evaluations.activePrompt(scope)
const run = await f.evaluations.create(scope, { requestKey: randomUUID(), title: '本地模型：候选提示词验收', sampleIds: ids, promptA: active.text, promptB: PROMPT_B })
let state = await f.evaluations.get(scope, run.id)
for (let i = 0; i < 20 && state.status === 'ready'; i++) state = await f.runner.next(scope, run.id, real)
const metrics = { a: evaluationMetrics(state, 'a'), b: evaluationMetrics(state, 'b') }
// The script stands in for the person with a fixed rule: adopt B only if it is clean and strictly better.
const verdict = metrics.b.failed === 0 && metrics.b.correct > metrics.a.correct ? 'b' : metrics.a.failed === 0 && metrics.a.correct > metrics.b.correct ? 'a' : 'tie'
const decided = await f.evaluations.decide(scope, { runId: run.id, revision: state.revision, verdict, note: '脚本按固定规则代人决定：无失败且一致数严格更高才采用。' })
report.acceptance = { status: decided.status, metrics, verdict, activePromptAfter: await f.evaluations.activePrompt(scope),
  cells: state.cells.map(c => ({ sample: state.snapshot.samples.find(s => s.id === c.sampleId)?.title, variant: c.variant, attempts: c.attempts.map(a => ({ status: a.status, failureCode: a.failureCode ?? null, latencyMs: a.latencyMs ?? null, output: a.output ?? null })) })) }
// 2b. Adoption path: a second run that the person decides in favour of B, to see the next recognition use it.
{
  const second = await f.evaluations.create(scope, { requestKey: randomUUID(), title: '本地模型：采用候选提示词', sampleIds: ids, promptA: active.text, promptB: PROMPT_B })
  let s2 = await f.evaluations.get(scope, second.id)
  for (let i = 0; i < 20 && s2.status === 'ready'; i++) s2 = await f.runner.next(scope, second.id, real)
  const m2 = { a: evaluationMetrics(s2, 'a'), b: evaluationMetrics(s2, 'b') }
  const d2 = await f.evaluations.decide(scope, { runId: second.id, revision: s2.revision, verdict: 'b', note: '为验证采用路径，按人的决定采用 B。' })
  report.adoption = { status: d2.status, metrics: m2, verdict: 'b', activePromptAfter: await f.evaluations.activePrompt(scope) }
  report.acceptance.activePromptAfterTie = report.acceptance.activePromptAfter
  report.acceptance.activePromptAfter = report.adoption.activePromptAfter
}
// 3. The next case is recognised with whatever prompt is now in effect.
{
  const created = await f.service.createCase(scope, { requestKey: randomUUID(), title: '验收之后的新受理单', photo: { dataUrl: await dataUrl('leak.png') } })
  const { value, ms } = await timed(() => f.analyzer.analyze(scope, created.id, real))
  report.nextCase = { recognitionMs: ms, ...brief(value) }
}
// 4. Failure and retry: provider unreachable, then the same case recognised again.
{
  const created = await f.service.createCase(scope, { requestKey: randomUUID(), title: '模型连不上时的受理单', photo: { dataUrl: await dataUrl('crack.png') } })
  const failed = await f.analyzer.analyze(scope, created.id, runtimeFor('http://127.0.0.1:9/v1'))
  const retried = await f.analyzer.analyze(scope, created.id, real)
  report.failureAndRetry = { afterFailure: brief(failed), canRetry: failed.canAnalyze, canConfirmAnyway: failed.canConfirm, afterRetry: brief(retried) }
}
// 5. Restore: serialise the database, reopen it, read everything back.
{
  const before = await f.service.listCases(scope)
  const reopened = await createService(f.db.driver.export())
  const after = await reopened.service.listCases(scope)
  report.restore = { cases: after.length, identical: JSON.stringify(before) === JSON.stringify(after),
    activePromptIdentical: JSON.stringify(await reopened.evaluations.activePrompt(scope)) === JSON.stringify(report.acceptance.activePromptAfter) }
  await reopened.db.destroy()
}
await f.db.destroy()
report.modelClientsCreated = modelCalls
report.finishedAt = new Date().toISOString()
await writeFile(path.join(outDir, 'result.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
