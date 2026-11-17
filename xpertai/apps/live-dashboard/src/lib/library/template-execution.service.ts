import { randomUUID } from 'node:crypto'
import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { DashboardService, projectId } from '../dashboard.service'
import { DashboardSaveRequests } from '../save-requests'
import { LibraryExecutionRecord } from './entities'
import { LibraryExecutionResolution } from './execution-resolution'
import { LibraryDatasetBindingService } from './dataset-binding.service'
import { compileTemplate, type BoundTemplateInput } from './template-compiler'
import { instantiateSchema, type TemplateInstantiation } from './execution-contract'
import { reference } from './archive'
import { canonicalJson, sha256 } from './resource-json'

const scopeHash = (context: XpertResolvedViewHostContext) => sha256(Buffer.from(JSON.stringify({ hostType: context.hostType,
  hostId: context.hostId, projectId: projectId(context) ?? null })))

/** @beta One creation request produces one draft; the existing save queue owns validation and CAS. */
@Injectable()
export class LibraryTemplateExecutionService {
  constructor(@InjectRepository(LibraryExecutionRecord) private readonly executions: Repository<LibraryExecutionRecord>,
    private readonly resolution: LibraryExecutionResolution, private readonly datasets: LibraryDatasetBindingService,
    private readonly saves: DashboardSaveRequests, private readonly dashboards: DashboardService) {}

  availability(context: XpertResolvedViewHostContext, id: string) { return this.resolution.availability(context, id) }

  async instantiate(context: XpertResolvedViewHostContext, input: TemplateInstantiation, allowedProviders?: string[]) {
    input = instantiateSchema.parse(input)
    const actor = await this.resolution.catalog.actor(context, true)
    const fingerprint = sha256(Buffer.from(canonicalJson({ input, allowedProviders: allowedProviders ? [...allowedProviders].sort() : null })))
    const executionId = await this.executions.manager.transaction(async manager => {
      const repository = manager.getRepository(LibraryExecutionRecord)
      // Roll back a new reservation when input validation fails. A corrected request
      // may reuse its intent ID; a successfully prepared execution remains immutable.
      await repository.createQueryBuilder().insert().values({ ...actor, requestId: input.requestId, inputHash: fingerprint,
        scopeHash: scopeHash(context), manifestId: randomUUID() }).orIgnore().execute()
      const execution = await repository.findOne({ where: { ...actor, requestId: input.requestId }, lock: { mode: 'pessimistic_write' } })
      if (!execution || execution.scopeHash !== scopeHash(context)) throw new ForbiddenException('LIBRARY_EXECUTION_DENIED')
      if (execution.inputHash !== fingerprint) throw new ConflictException('LIBRARY_EXECUTION_CONFLICT')
      // Recheck the selected resource closure even on a duplicate request.
      const resolved = await this.resolution.template(context, input)
      if (execution.saveRequestId) return execution.id
      if (!execution.manifest) {
        const inputs: BoundTemplateInput[] = []
        for (const item of resolved.inputs) {
          const slot = resolved.template.content.inputSlots.find(slot => slot.key === item.slot)!
          inputs.push({ input: item, ...await this.datasets.bind(context, item, slot, execution.id, allowedProviders) })
        }
        let html: string | undefined
        const presentation = resolved.template.content.presentation
        if (presentation.type === 'html') {
          const asset = resolved.template.assets.find(item => item.id === presentation.documentAssetId)!
          html = (await this.resolution.catalog.files.read(actor, asset)).toString('utf8')
        }
        execution.manifest = compileTemplate(resolved.template, inputs, { id: execution.manifestId, title: input.title,
          theme: resolved.theme?.content.theme ?? 'system', parameters: input.parameters ?? {}, html,
          origin: { schema: 'xpert.library.instance', version: 1, template: reference(resolved.template),
            ...(resolved.task ? { task: reference(resolved.task) } : {}), ...(resolved.theme ? { theme: reference(resolved.theme) } : {}),
            inputs: inputs.map(item => ({ slot: item.input.slot, mapping: item.input.mapping, source: item.origin })), parameters: {} } })
        await repository.save(execution)
      }
      return execution.id
    })
    await this.executions.manager.transaction(async manager => {
      const repository = manager.getRepository(LibraryExecutionRecord)
      const execution = await repository.findOne({ where: { id: executionId, ...actor }, lock: { mode: 'pessimistic_write' } })
      if (!execution?.manifest) throw new BadRequestException('LIBRARY_EXECUTION_NOT_PREPARED')
      if (execution.saveRequestId) return
      const resolved = await this.resolution.template(context, input)
      for (const item of resolved.inputs) await this.datasets.authorizeInput(context, item)
      // Reusing the same dedupe key recovers a queue submission interrupted before this transaction committed.
      const result = await this.saves.submit(context, execution.manifest, null, 0, `library-v2/${execution.id}`)
      execution.saveRequestId = result.requestId; execution.result = result
      await repository.save(execution)
    })
    return this.status(context, executionId)
  }
  async status(context: XpertResolvedViewHostContext, id: string) {
    const actor = await this.resolution.catalog.actor(context)
    const execution = await this.executions.findOneBy({ id, ...actor })
    if (!execution || execution.scopeHash !== scopeHash(context)) throw new ForbiddenException('LIBRARY_EXECUTION_DENIED')
    if (!execution.saveRequestId) return { executionId: id, state: 'preparing' as const, nextAction: 'retry' as const }
    if (execution.result?.state === 'succeeded') {
      await this.dashboards.open(context, execution.result.dashboard!.artifactId)
      return { executionId: id, ...execution.result }
    }
    try {
      const result = await this.saves.get(context, execution.saveRequestId)
      await this.executions.update({ id, ...actor }, { result })
      return { executionId: id, ...result }
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('DASHBOARD_SAVE_REQUEST_UNAVAILABLE')) throw error
      const dashboard = await this.dashboards.savedRequestReceipt(context, execution.manifestId, execution.saveRequestId, 0)
      if (!dashboard) throw new BadRequestException('LIBRARY_EXECUTION_RECEIPT_EXPIRED')
      const result = { requestId: execution.saveRequestId, state: 'succeeded' as const, stage: 'saved', completed: 1, total: 1,
        terminal: true, dashboard, nextAction: 'report_result', cursor: sha256(Buffer.from(JSON.stringify(dashboard))) }
      await this.executions.update({ id, ...actor }, { result })
      return { executionId: id, ...result }
    }
  }
}
