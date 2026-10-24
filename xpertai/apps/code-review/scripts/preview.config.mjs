import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defaultPolicy } from '../dist/automation-contract.js'
import { ReviewPipelineContribution } from '../dist/pipeline/configuration.js'
import { configureProjectPipelineFromForm } from '@xpert-ai/contracts'
import { reviewTemplateSource } from '../dist/pipeline/setup-contract.js'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const projectId = id(1), bindingId = id(2), repository = { id: id(3), owner: 'xpert-ai', repository: 'xpert', revision: 1, settings: defaultPolicy, lastEventAt: null, errorCode: null }
const contribution = new ReviewPipelineContribution()
const assistantId = id(9)
const savedConfigurations = process.env.PREVIEW_EMPTY_BINDINGS === 'true' ? [] : [{ id: bindingId, title: 'Code Review', sourceKind: 'github', version: '1.0.0', createdAt: '2026-10-22T00:00:00Z' }]
const titles = ['Verify Code Review webhook automation', 'feat(analytics): governed definitions through Agent authoring', 'fix: pipeline projection conflict', 'refactor: simplify review context builder', 'docs: update contributing guide', 'feat: support multi-repo analysis', 'chore: bump dependencies']
const entries = titles.map((title, i) => ({ id: id(20+i), key: `github:xpert-ai/xpert#${[1188,1203,1180,1178,1175,1172,1169][i]}`,
  ref: { provider: 'github', owner: 'xpert-ai', repository: 'xpert', number: [1188,1203,1180,1178,1175,1172,1169][i] }, title,
  source: 'automatic', trigger: 'opened', status: ['awaiting_confirmation','skipped','completed','running','queued','completed','skipped'][i],
  headSha: (i ? 'b' : '1cb5b52').padEnd(40,'a'), createdAt: `2026-10-${22-i}T08:20:00Z`, updatedAt: `2026-10-${22-i}T08:20:00Z`, pinned: false,
  reviewId: i === 1 || i === 6 ? null : id(40+i), runId: id(20+i), reason: i === 1 || i === 6 ? 'trigger_disabled' : null,
  projectId, instanceId: id(60+i), roundId: id(80+i), publicationUrl: null, count: i === 0 ? 3 : 1 }))
const patch = '@@ -0,0 +1,8 @@\n+# Code Review webhook test\n+\n+This pull request verifies the review pipeline.\n+\n+- Receive the GitHub webhook\n+- Review a fixed commit\n+- Wait for human confirmation\n+- Publish only after approval'
const reviews = entries.filter(entry => entry.reviewId).map(entry => ({ id: entry.reviewId, revision: 1, ref: entry.ref,
  snapshot: { title: entry.title, body: 'Synthetic fixture for the review workbench.', url: `https://github.com/xpert-ai/xpert/pull/${entry.ref.number}`, state: 'open', author: 'fixture-user',
    headSha: entry.headSha, baseSha: 'c'.repeat(40), files: [{ filename: 'CODE_REVIEW_WEBHOOK_TEST.md', status: 'added', additions: 8, deletions: 0, patch }],
    comments: [], checks: [{ id: 1, name: 'typecheck', status: 'completed', conclusion: 'success', url: null }], warnings: [], fetchedAt: entry.createdAt },
  status: 'reviewed', access: 'public', pinned: false, viewed: [], summary: '已完成本次变更的审查，未发现可验证的缺陷。', findings: [], errorCode: null, submissionUrl: null,
  automationRunId: entry.runId, pipelineProjectId: projectId, conversationId: id(100), executionId: id(101) }))
const older = [1,2].map((n) => ({ ...entries[0], id: id(110+n), reviewId: id(120+n), runId: id(110+n), status: 'superseded', headSha: String(n).repeat(40), createdAt: `2026-10-20T0${n}:00:00Z` }))
for (const entry of older) {
  const review = structuredClone(reviews[0])
  review.id = entry.reviewId; review.snapshot.headSha = entry.headSha; review.automationRunId = entry.runId
  reviews.push(review)
}
export default {
  title: 'Code Review · Workbench preview', workspaceRoot: root, instanceId: 'code-review-fixture',
  component: { root: resolve(root, 'dist/remote-components/code-review'), runtime: 'react', viewportBound: true },
  hostContext: { manifest: { key: 'code_review.workspace' }, scopeRevision: 1, locale: process.env.PREVIEW_LOCALE ?? 'zh-Hans',
    initialQuery: { selectionId: reviews[0].id, parameters: { recordId: entries[0].id, tab: 'changes' } },
    runtimeScope: { projectId, conversationId: null }, theme: { mode: process.env.PREVIEW_THEME ?? 'light', tokens: { 'color-primary': '#2563eb', 'color-primary-foreground': '#ffffff',
      ...(process.env.PREVIEW_THEME === 'dark' ? { 'color-background': '#09090b', 'color-foreground': '#fafafa', 'color-card': '#18181b', 'color-card-foreground': '#fafafa', 'color-popover': '#18181b', 'color-popover-foreground': '#fafafa', 'color-muted': '#27272a', 'color-muted-foreground': '#a1a1aa', 'color-border': '#3f3f46', 'color-input': '#3f3f46', 'color-accent': '#27272a', 'color-accent-foreground': '#fafafa', 'color-warning': '#fbbf24', 'color-success': '#4ade80' } : {})
    } } },
  state: { repository, entries, reviews, older, savedConfigurations, configurations: {}, commands: [], mutations: [] },
  async handleRequest(message, { state }) {
    const envelope = { scopeRevision: message.scopeRevision }
    if (message.type === 'requestData') {
      const p = message.query?.parameters ?? {}, page = message.query?.page ?? 1
      let data
      if (p.githubConnection) data = { items: [], meta: { connection: { status: 'connected', login: 'fixture-user' } } }
      else if (p.workbench) {
        let items = p.history || p.recordId ? [...state.entries, ...state.older] : state.entries
        if (p.recordId) items = items.filter(e => e.id === p.recordId || e.reviewId === p.recordId)
        if (p.history) items = items.filter(e => e.key === p.history)
        if (p.status) items = items.filter(e => e.status === p.status)
        if (p.search) items = items.filter(e => `${e.title} ${e.key} ${e.headSha}`.toLowerCase().includes(p.search.toLowerCase()))
        if (p.pinned) items = items.filter(e => e.pinned)
        if (p.repository) items = items.filter(e => `${e.ref.owner}/${e.ref.repository}` === p.repository)
        data = { items: items.slice((page-1)*20,page*20), total: items.length, page, pageSize: 20, repositories: [{ value: 'xpert-ai/xpert', label: 'xpert-ai/xpert' }] }
      } else if (message.query?.selectionId) {
        const detail = state.reviews.find(r => r.id === message.query.selectionId)
        if (!detail) throw new Error('review_not_found')
        data = { items: [], meta: { detail } }
      } else if (p.automation) data = { items: [], meta: { repositories: [state.repository], runs: [], total: 0, app: { configured: true, installUrl: null, webhookUrl: 'https://example.invalid/api/code_review/github/webhook' } } }
      else if (p.inbox) data = { items: [{ number: 1205, title: 'Fixture: requested pull request', author: 'fixture-user', url: 'https://github.com/xpert-ai/xpert/pull/1205' }], total: 1 }
      else data = { items: [], total: 0, page: 1, pageSize: 20 }
      return { ...envelope, type: 'data', data }
    }
    if (message.type === 'invokeClientCommand') {
      state.commands.push({ commandKey: message.commandKey, payload: message.payload })
      return { ...envelope, type: 'clientCommandResult', result: { success: true } }
    }
    if (message.type === 'executeAction') {
      let data
      const input = message.input
      if (message.actionKey === 'mark') {
        const review = state.reviews.find(r => r.id === input.id)
        if (!review || input.revision !== review.revision) return { ...envelope, type: 'actionResult', result: { success: false, data: { code: 'revision_conflict' } } }
        if (input.viewed) review.viewed = input.viewed
        if (typeof input.pinned === 'boolean') { review.pinned = input.pinned; state.entries.find(e => e.reviewId === review.id).pinned = input.pinned }
        review.revision++; data = review
      } else if (message.actionKey === 'run.retry') { state.entries.find(e => e.id === input.id).status = 'queued'; data = { id: input.id } }
      else if (message.actionKey === 'open') {
        if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/.test(input.url)) return { ...envelope, type: 'actionResult', result: { success: false, data: { code: 'invalid_pull_request_url' } } }
        const number = Number(input.url.split('/').pop()), review = structuredClone(state.reviews[0]), entry = structuredClone(state.entries[0])
        review.id = id(200+state.reviews.length); review.revision = 1; review.status = 'ready'; review.ref.number = number; review.snapshot.url = input.url; review.snapshot.title = 'Manual PR review'; review.automationRunId = null; review.pipelineProjectId = null
        entry.id = review.id; entry.key = `github:xpert-ai/xpert#${number}`; entry.ref = review.ref; entry.reviewId = review.id; entry.title = review.snapshot.title; entry.source = 'manual'; entry.trigger = 'manual'; entry.status = 'ready'; entry.runId = null; entry.projectId = null; entry.instanceId = null; entry.roundId = null; entry.count = 1
        state.entries.unshift(entry); state.reviews.push(review); data = review
      } else if (message.actionKey === 'pipeline.catalog') data = {
        defaultAssistantId: assistantId, assistants: [{ id: assistantId, name: '代码审查', publishedVersion: '2' }],
        templates: contribution.configurations.filter(c => reviewTemplateSource(c.binding.templateRef) === input.sourceKind).map(c => {
          const form = contribution.forms.find(f => f.templateRef === c.binding.templateRef)
          return { contributionKey: contribution.key, templateRef: c.binding.templateRef, sourceKind: input.sourceKind, title: c.template.title, version: c.template.version,
            description: form.description, assistantSlots: form.assistantSlots, parameters: c.binding.parameters }
        })
      }
      else if (message.actionKey === 'pipeline.configure') {
        const source = contribution.configurations.find(c => c.binding.templateRef === input.templateRef)
        if (!source || reviewTemplateSource(input.templateRef) !== input.sourceKind) throw new Error('pipeline_template_unavailable')
        state.configurations[input.requestId] = configureProjectPipelineFromForm(source, contribution.forms.find(f => f.templateRef === input.templateRef), input)
        if (!state.savedConfigurations.some(c => c.id === input.requestId)) state.savedConfigurations.push({ id: input.requestId, title: source.template.title, sourceKind: input.sourceKind, version: source.template.version, createdAt: '2026-10-22T00:00:00Z' })
        data = { projectId, bindingId: input.requestId }
      }
      else if (message.actionKey === 'pipeline.configurations') data = { items: state.savedConfigurations, next: null }
      else if (message.actionKey === 'pipeline.start-saved') {
        const review = state.reviews.find(r => r.id === input.id)
        if (review.revision !== input.revision || !state.savedConfigurations.some(c => c.id === input.bindingId)) throw new Error('revision_conflict')
        review.pipelineProjectId = projectId; review.revision++
        const entry = state.entries.find(e => e.reviewId === review.id); entry.projectId = projectId; entry.instanceId = id(300); entry.roundId = id(301)
        data = { projectId, instanceId: entry.instanceId }
      } else if (message.actionKey === 'repository.save') { if (input.revision !== state.repository.revision) throw new Error('revision_conflict'); state.repository.settings = input.settings; state.repository.revision++; data = { id: state.repository.id } }
      else throw new Error(`Unexpected fixture action: ${message.actionKey}`)
      state.mutations.push({ key: message.actionKey, input })
      return { ...envelope, type: 'actionResult', result: { success: true, data } }
    }
    throw new Error('Unexpected fixture request')
  }
}
