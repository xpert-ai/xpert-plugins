// Explicit opt-in: sends synthetic customer text only to the configured model.
import { writeFile, mkdir } from 'node:fs/promises'
import { analyzeWithModel } from '../src/model.js'
import { configSchema } from '../src/domain.js'
const config = configSchema.parse({ baseUrl: process.env.TRIAGE_BASE_URL ?? 'http://127.0.0.1:11434/v1', model: process.env.TRIAGE_MODEL ?? 'deepseek-r1:14b', timeoutMs: 120000 })
const input = { subject: '订阅被重复扣款', body: '今天早上续费订阅，同一笔订单被扣了两次款。请帮忙核查重复扣费。我下午要给客户做演示，现在账号还显示未续费，无法使用。' }
const started = Date.now()
const result = await analyzeWithModel(config, input)
await mkdir('test-results', { recursive: true })
await writeFile('test-results/live-model.json', JSON.stringify({ input, result, durationMs: Date.now() - started, model: config.model }, null, 2))
console.log(JSON.stringify({ passed: true, model: config.model, category: result.category, priority: result.priority, evidenceMatchesSource: input.body.includes(result.evidence), durationMs: Date.now() - started }))
