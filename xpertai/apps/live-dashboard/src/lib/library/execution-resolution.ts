import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { XPERT_RUNTIME_CAPABILITIES_TOKEN, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { LibraryCatalogService } from './catalog.service'
import { type ResourceDocumentV2, identity } from './resource-contract'
import type { TemplateInstantiation, TemplateInput } from './execution-contract'

export type AnalysisTemplate = Extract<ResourceDocumentV2, { kind: 'analysis-template' }>
export type LibraryDataset = Extract<ResourceDocumentV2, { kind: 'public-dataset' }>

/** Resolves typed dependency aliases, never titles, sample fields or an arbitrary first dependency. */
@Injectable()
export class LibraryExecutionResolution {
  constructor(readonly catalog: LibraryCatalogService, @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry) {}
  async selected(context: XpertResolvedViewHostContext, id: string) {
    const closure = await this.catalog.closure(context, [id])
    const root = closure.resources[closure.rows.findIndex(row => row.id === id)]
    const dependency = (document: ResourceDocumentV2, alias: string) => {
      const ref = document.dependencies.find(dep => dep.alias === alias)
      const index = ref ? closure.resources.findIndex(item => identity(item) === identity(ref)) : -1
      if (index < 0) throw new BadRequestException('LIBRARY_DEPENDENCY_MISSING')
      return { document: closure.resources[index], releaseId: closure.rows[index].id }
    }
    return { ...closure, root, dependency }
  }
  checkRequirements(documents: ResourceDocumentV2[]) {
    for (const document of documents) if ('requirements' in document.content) {
      // The host has no general installed-plugin/version catalog in this SDK. Never infer compatibility.
      if (document.content.requirements.plugins.length) throw new BadRequestException('LIBRARY_PLUGIN_REQUIREMENT_UNVERIFIED')
      for (const capability of document.content.requirements.capabilities) if (!this.runtime.has(capability)) throw new BadRequestException('LIBRARY_RUNTIME_CAPABILITY_REQUIRED')
    }
  }
  async template(context: XpertResolvedViewHostContext, input: TemplateInstantiation) {
    const selected = await this.selected(context, input.releaseId), task = selected.root.kind === 'example-task' ? selected.root : undefined
    let template = selected.root, inputs = input.inputs, theme: Extract<ResourceDocumentV2, { kind: 'visual-theme' }> | undefined
    if (task) {
      if (task.content.execution.mode !== 'template') throw new BadRequestException('LIBRARY_AGENT_TASK_HAS_NO_TEMPLATE')
      template = selected.dependency(task, task.content.execution.templateAlias).document
      inputs ??= (task.content.inputBindings ?? []).map(binding => ({ slot: binding.slot, mapping: binding.mapping,
        source: { type: 'library', releaseId: selected.dependency(task, binding.dataAlias).releaseId } } satisfies TemplateInput))
      if (task.content.themeAlias) {
        const dependency = selected.dependency(task, task.content.themeAlias).document
        if (dependency.kind !== 'visual-theme') throw new BadRequestException('LIBRARY_THEME_REQUIRED')
        theme = dependency
      }
    }
    if (template.kind !== 'analysis-template') throw new BadRequestException('LIBRARY_TEMPLATE_REQUIRED')
    if (input.themeReleaseId) {
      const resolved = await this.catalog.resolve(context, input.themeReleaseId)
      if (resolved.document.kind !== 'visual-theme') throw new BadRequestException('LIBRARY_THEME_REQUIRED')
      theme = resolved.document
    }
    if (!inputs || inputs.length !== template.content.inputSlots.length || new Set(inputs.map(i => i.slot)).size !== inputs.length ||
      inputs.some(i => !template.content.inputSlots.some(slot => slot.key === i.slot))) throw new BadRequestException('LIBRARY_TEMPLATE_INPUTS_REQUIRED')
    this.checkRequirements(selected.resources)
    return { template, task, theme, inputs, selected }
  }
  async availability(context: XpertResolvedViewHostContext, id: string) {
    try {
      await this.catalog.actor(context, true)
      const selected = await this.selected(context, id)
      this.checkRequirements(selected.resources)
      const task = selected.root.kind === 'example-task' ? selected.root : undefined
      if (task?.content.execution.mode === 'template') await this.template(context, { releaseId: id, requestId: id, title: task.title })
      return { supportsInstantiation: selected.root.kind === 'analysis-template' || task?.content.execution.mode === 'template',
        canPrepareTask: !!task, executionChecks: 'required-on-invocation' as const, reasons: [] as string[] }
    } catch (error) {
      const code = error instanceof Error && /^LIBRARY_[A-Z_]+$/.test(error.message) ? error.message : 'LIBRARY_EXECUTION_UNAVAILABLE'
      return { supportsInstantiation: false, canPrepareTask: false, executionChecks: 'required-on-invocation' as const, reasons: [code] }
    }
  }
}
