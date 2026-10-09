// Local test/preview host only. Uses the real plugin layers with an in-memory repository.
// Assistant output below is explicitly a fixture, never evidence of a real model invocation.
import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { IsNull } from 'typeorm'
import { readFile } from 'node:fs/promises'
import { RfidExperimentInsightService } from '../dist/lib/rfid-experiment-insight.service.js'
import { RfidExperimentInsightViewProvider } from '../dist/lib/rfid-experiment-insight-view.provider.js'
import { RfidExperimentInsightMiddleware } from '../dist/lib/rfid-experiment-insight.middleware.js'

export const scope = { tenantId: 'mock-tenant', organizationId: 'mock-org', workspaceId: 'mock-workspace', userId: 'mock-user' }
export const context = { ...scope, hostType: 'agent', hostId: 'mock-assistant' }
export const fixtureSummary = {
  overallTrend: '本地测试解释：不同部署条件下的准确率存在差异。以下内容为 mock，不代表真实模型输出。',
  mostDegradedCondition: '应重点复核统计中标记的最差部署条件，并与最佳条件进行对照。',
  signalQualityObservation: '较大的信号离散指标与退化可能同时出现，仅凭这些实验结果不能确定因果关系。',
  suggestedFollowUp: '建议重复最差条件的实验，并保持角度与环境不变，检查结果是否稳定。'
}
export function mockRepository() {
  const rows = new Map()
  const matches = (row, where) => Object.entries(where).every(([key, value]) => value instanceof IsNull().constructor ? row[key] == null : row[key] === value)
  return {
    rows,
    async find({ where, take, select, order } = {}) {
      let result = [...rows.values()].filter((row) => matches(row, where ?? {}))
      if (order?.createdAt === 'DESC') result.sort((a, b) => b.createdAt - a.createdAt)
      return result.slice(0, take).map((row) => structuredClone(select ? Object.fromEntries(select.map((key) => [key, row[key]])) : row))
    },
    async findOne({ where }) { const row = [...rows.values()].find((row) => matches(row, where)); return row ? structuredClone(row) : null },
    async update(where, patch) { let affected = 0; for (const row of rows.values()) if (matches(row, where)) { Object.assign(row, structuredClone(patch)); affected++ } return { affected } },
    createQueryBuilder() {
      let value
      const builder = { insert: () => builder, into: () => builder, values: (input) => { value = input; return builder }, orIgnore: () => builder,
        execute: async () => { if (![...rows.values()].some((row) => row.importKey === value.importKey)) { const id = randomUUID(); rows.set(id, { id, ...structuredClone(value), createdAt: new Date(), updatedAt: new Date() }) } } }
      return builder
    }
  }
}
export class MockHost {
  constructor(repo = mockRepository()) {
    this.repo = repo
    this.service = new RfidExperimentInsightService(repo)
    this.view = new RfidExperimentInsightViewProvider(this.service)
    this.messages = []
    this.toolCalls = []
    this.emit = () => {}
    this.dispatchFails = false
    this.mode = 'defer'
    this.attempt = null
    this.middleware = new RfidExperimentInsightMiddleware(this.service).createMiddleware({}, scope)
    this.tools = Object.fromEntries(this.middleware.tools.map((tool) => [tool.name, tool]))
  }
  async html() { return (await this.view.getRemoteComponentEntry(context, 'workbench', { entry: 'rfid_experiment_insight__remote' })).html }
  async seed(name = '距离变化实验 · Env-1') {
    return this.service.importCsv(scope, { requestId: randomUUID(), name, fileName: 'experiment-results.csv', csv: await readFile(new URL('../examples/experiment-results.csv', import.meta.url), 'utf8') })
  }
  async handle(message) {
    this.messages.push(message)
    switch (message.type) {
      case 'requestData': return { type: 'data', data: await this.view.getViewData(context, 'workbench', message.query) }
      case 'executeFileAction': {
        const file = { buffer: Buffer.from(message.file.buffer), originalname: message.file.name, mimetype: message.file.type, size: message.file.size }
        return { type: 'fileActionResult', result: await this.view.executeViewFileAction(context, 'workbench', message.actionKey, message, file) }
      }
      case 'executeAction': {
        const result = await this.view.executeViewAction(context, 'workbench', message.actionKey, message)
        if (message.actionKey === 'analyze_experiment' && result.success) this.attempt = { analysisId: result.data.analysisId, attemptId: result.data.attemptId }
        return { type: 'actionResult', result }
      }
      case 'invokeClientCommand': {
        if (message.commandKey !== 'assistant.chat.send_message') throw new Error('Unexpected client command')
        if (this.dispatchFails) return { type: 'clientCommandResult', result: { success: false, message: 'Mock Assistant dispatch failed' } }
        if (this.mode !== 'defer') setTimeout(() => { void this.finish(this.mode).catch(() => {}) }, 100)
        return { type: 'clientCommandResult', result: { success: true } }
      }
      default: throw new Error('Unsupported mock host request')
    }
  }
  async finish(mode = 'success') {
    const attempt = { ...this.attempt }
    this.toolCalls.push({ name: 'analyze_experiment', input: attempt })
    await this.tools.analyze_experiment.invoke(attempt)
    if (mode === 'fail') {
      try { await this.middleware.wrapModelCall({}, async () => { throw new Error('Mock provider failure') }) } catch { /* expected simulated model error */ }
    } else {
      this.toolCalls.push({ name: 'save_analysis', input: attempt })
      await this.tools.save_analysis.invoke({ ...attempt, aiSummary: fixtureSummary })
      await this.middleware.afterAgent()
    }
    this.emit({ type: 'hostEvent', event: { type: 'assistant.tool.completed', source: 'chatkit', toolName: mode === 'fail' ? 'analyze_experiment' : 'save_analysis' } })
  }
}
