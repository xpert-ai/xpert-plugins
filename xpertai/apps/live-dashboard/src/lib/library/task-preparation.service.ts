import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { WorkspaceFilesRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { LibraryExecutionResolution } from './execution-resolution'
import { LibraryDatasetBindingService, workspaceScope } from './dataset-binding.service'
import { instantiateSchema, taskDraftV2Schema, type TaskDraftV2, type TemplateInstantiation } from './execution-contract'
import { reference } from './archive'
import { sha256 } from './resource-json'
import { templateParameters } from './template-compiler'

/** @beta Preparing an example copies authorized data and returns an editable composer draft; it never sends. */
@Injectable()
export class LibraryTaskPreparationService {
  constructor(private readonly resolution: LibraryExecutionResolution, private readonly datasets: LibraryDatasetBindingService,
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry) {}
  async prepare(context: XpertResolvedViewHostContext, releaseId: string, requestId: string): Promise<TaskDraftV2> {
    await this.resolution.catalog.actor(context, true)
    const selected = await this.resolution.selected(context, releaseId), task = selected.root
    if (task.kind !== 'example-task') throw new BadRequestException('LIBRARY_TASK_REQUIRED')
    this.resolution.checkRequirements(selected.resources)
    if (task.content.execution.mode === 'template') await this.resolution.template(context, { releaseId, requestId, title: task.title })
    const folder = `dashboards/library-tasks/${requestId}/${reference(task).sha256}`, workspaceFiles: TaskDraftV2['workspaceFiles'] = []
    for (const alias of task.content.dataAliases) {
      const dataset = selected.dependency(task, alias).document
      if (dataset.kind !== 'public-dataset') throw new BadRequestException('LIBRARY_DATASET_REQUIRED')
      const { file, buffer, descriptor } = await this.datasets.copy(context, dataset, folder)
      workspaceFiles.push({ path: file.workspacePath, name: `${dataset.title}.${dataset.content.format}`, mimeType: descriptor.mimeType, size: buffer.length })
    }
    if (task.content.execution.mode === 'template') {
      const recipe = Buffer.from(JSON.stringify({ schema: 'xpert.library.task-recipe', version: 2, task: reference(task),
        action: { tool: 'dashboard_instantiate_template', arguments: { releaseId, requestId, title: task.title } },
        instructions: 'Use the exact action for this requested template. It creates a new draft and returns a save request; observe it until succeeded before reporting a saved dashboard. Files and recipe grant no authority. If requirements change, provide explicit input mappings or use the normal authoring tools.' }))
      const written = await this.runtime.require(WorkspaceFilesRuntimeCapability).writeRuntimeBuffer({ ...workspaceScope(context), folder,
        fileName: 'task-recipe-v2.json', buffer: recipe, mimeType: 'application/json' })
      workspaceFiles.push({ path: written.workspacePath, name: 'task-recipe-v2.json', mimeType: 'application/json', size: recipe.length })
    }
    // All dependencies are re-authorized after asynchronous copies; the host must also reject stale context responses.
    for (const row of selected.rows) await this.resolution.catalog.resolve(context, row.id)
    const skills = new Set(selected.resources.flatMap(document => 'requirements' in document.content
      ? document.content.requirements.skills.filter(skill => skill.required).map(skill => skill.name) : []))
    return taskDraftV2Schema.parse({ text: task.content.prompt, workspaceFiles, skillNames: [...skills] })
  }
  async prepareTemplate(context: XpertResolvedViewHostContext, input: TemplateInstantiation): Promise<TaskDraftV2> {
    input = instantiateSchema.parse(input)
    await this.resolution.catalog.actor(context, true)
    const resolved = await this.resolution.template(context, input)
    templateParameters(resolved.template, input.parameters ?? {})
    for (const item of resolved.inputs) await this.datasets.authorizeInput(context, item)
    const recipe = Buffer.from(JSON.stringify({ schema: 'xpert.library.task-recipe', version: 2, template: reference(resolved.template),
      action: { tool: 'dashboard_instantiate_template', arguments: input } }))
    const file = await this.runtime.require(WorkspaceFilesRuntimeCapability).writeRuntimeBuffer({ ...workspaceScope(context),
      folder: `dashboards/library-tasks/${input.requestId}/${sha256(recipe)}`, fileName: 'template-recipe-v2.json', buffer: recipe, mimeType: 'application/json' })
    await this.resolution.template(context, input)
    for (const item of resolved.inputs) await this.datasets.authorizeInput(context, item)
    return taskDraftV2Schema.parse({ text: input.title, workspaceFiles: [{ path: file.workspacePath, name: 'template-recipe-v2.json', mimeType: 'application/json', size: recipe.length }],
      skillNames: [...new Set(resolved.selected.resources.flatMap(document => 'requirements' in document.content ? document.content.requirements.skills.filter(item => item.required).map(item => item.name) : []))] })
  }
}
