import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { AnalyticsDefinitionAuthoringCapability, WorkspaceFilesRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { analyticsBindingSchema } from '@xpert-ai/plugin-sdk/analytics'
import { z } from 'zod/v3'
import { DashboardService, projectId } from '../dashboard.service'
import { DashboardDatasetService } from '../dataset.service'
import { LibraryCatalogService } from './catalog.service'
import { reference } from './archive'
import type { TemplateInput } from './execution-contract'
import type { AnalysisTemplate, LibraryDataset } from './execution-resolution'

export function workspaceScope(context: XpertResolvedViewHostContext) {
  const project = projectId(context)
  return { ...(project ? { catalog: 'projects' as const, projectId: project } : { catalog: 'user-xperts' as const }),
    tenantId: context.tenantId, organizationId: context.organizationId, userId: context.userId, xpertId: context.hostId }
}

/** Registers exact authorized file copies through the existing file.table authoring protocol. */
@Injectable()
export class LibraryDatasetBindingService {
  constructor(private readonly catalog: LibraryCatalogService, private readonly dashboards: DashboardService,
    private readonly datasets: DashboardDatasetService, @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry) {}

  async copy(context: XpertResolvedViewHostContext, dataset: LibraryDataset, folder: string) {
    const descriptor = dataset.assets.find(asset => asset.id === dataset.content.dataAssetId)!
    const buffer = await this.catalog.files.read(await this.catalog.actor(context, true), descriptor)
    const file = await this.runtime.require(WorkspaceFilesRuntimeCapability).writeRuntimeBuffer({ ...workspaceScope(context), folder,
      fileName: `${dataset.logicalId}-${descriptor.sha256}.${dataset.content.format}`, buffer, mimeType: descriptor.mimeType })
    return { file, descriptor, buffer }
  }
  private async register(context: XpertResolvedViewHostContext, dataset: LibraryDataset, executionId: string, slot: string) {
    if (!context.workspaceId || !context.organizationId) throw new BadRequestException('ANALYTICS_ASSISTANT_SCOPE_REQUIRED')
    // Older V2 documents remain portable, but authoring needs an explicit Analytics field role.
    if (dataset.content.columns.some(column => !column.role)) throw new BadRequestException('LIBRARY_DATASET_FIELD_ROLE_REQUIRED')
    const files = this.runtime.require(WorkspaceFilesRuntimeCapability), authoring = this.runtime.require(AnalyticsDefinitionAuthoringCapability)
    const scope = { actor: { tenantId: context.tenantId, organizationId: context.organizationId, userId: context.userId },
      workspaceId: context.workspaceId, xpertId: context.assistant?.currentId ?? context.hostId, files }
    if (!(await authoring.catalog(scope)).some(item => item.providerId === 'file.table' && item.connectionKey === 'workspace')) throw new BadRequestException('LIBRARY_FILE_ANALYTICS_REQUIRED')
    const { file } = await this.copy(context, dataset, `dashboards/library-instances/${executionId}/${slot}`)
    const receipt = await authoring.register({ ...scope, files: {
      resolveRuntimeReference: async path => {
        if (path !== file.workspacePath) throw new BadRequestException('LIBRARY_DATASET_PATH_INVALID')
        return files.resolveRuntimeReference(file.reference)
      }, resolveFile: ref => files.resolveFile(ref), readBuffer: ref => files.readBuffer(ref)
    } }, { providerId: 'file.table', connectionKey: 'workspace', requestId: `library-v2/${executionId}/${slot}`, name: dataset.title,
      definition: { name: dataset.title, description: dataset.description || dataset.title, path: file.workspacePath,
        reader: dataset.content.format === 'json' ? { format: 'json', rowsPath: dataset.content.readerOptions.rowsPath ?? [] }
          : { format: 'csv', delimiter: dataset.content.readerOptions.delimiter ?? ',', headerRow: 1 },
        columns: dataset.content.columns.map(column => ({ ...column, path: [column.key], description: column.label,
          role: column.role!, nullValues: [] })) } })
    const discovery = await this.dashboards.discover(context, receipt.discoveryRequest)
    // An authoring receipt must identify a single authored definition, not a guessed first search hit.
    if (discovery.items.length !== 1 || !discovery.items[0].inspectRequest) throw new BadRequestException('LIBRARY_DATASET_INSPECTION_REQUIRED')
    const item = discovery.items[0], inspected = await this.dashboards.discover(context, { ...receipt.discoveryRequest, request: item.inspectRequest! })
    return z.object({ binding: analyticsBindingSchema }).parse(inspected.items.find(entry => entry.id === item.id)?.metadata).binding
  }
  async bind(context: XpertResolvedViewHostContext, input: TemplateInput, slot: AnalysisTemplate['content']['inputSlots'][number], executionId: string, allowedProviders?: string[]) {
    let binding: z.infer<typeof analyticsBindingSchema>, controls: Record<string, string | number | boolean | null> = {}, synthetic = false
    let origin: ({ type: 'library' } & ReturnType<typeof reference>) | { type: 'dataset'; artifactId: string; revision: number }
    if (input.source.type === 'dataset') {
      const record = await this.datasets.open(context, input.source.artifactId)
      if (record.revision !== input.source.revision) throw new ConflictException('DASHBOARD_DATASET_CONFLICT')
      binding = record.definition.binding; controls = record.definition.controls
      origin = { type: 'dataset', artifactId: record.artifactId, revision: record.revision }
    } else {
      if (allowedProviders && !allowedProviders.includes('file.table')) throw new BadRequestException('DASHBOARD_PROVIDER_REQUIRED')
      const { document } = await this.catalog.resolve(context, input.source.releaseId)
      if (document.kind !== 'public-dataset') throw new BadRequestException('LIBRARY_DATASET_REQUIRED')
      binding = await this.register(context, document, executionId, input.slot)
      origin = { type: 'library', ...reference(document) }; synthetic = document.provenance.kind === 'synthetic'
    }
    if (allowedProviders && !allowedProviders.includes(binding.providerId)) throw new BadRequestException('DASHBOARD_PROVIDER_REQUIRED')
    for (const role of Object.keys(input.mapping)) if (!slot.fields.some(field => field.role === role)) throw new BadRequestException('LIBRARY_FIELD_MAPPING_INVALID')
    for (const field of slot.fields) {
      const id = input.mapping[field.role], actual = binding.output.fields.find(item => item.id === id)
      if (!id && !field.required) continue
      if (!actual || actual.logicalType !== field.logicalType || !field.nullable && actual.nullable) throw new BadRequestException('LIBRARY_FIELD_TYPE_MISMATCH')
    }
    const grain = slot.grain.map(role => input.mapping[role])
    if (grain.some(id => !id) || new Set(grain).size !== grain.length || binding.output.grain.some(id => !grain.includes(id))) throw new BadRequestException('LIBRARY_GRAIN_MISMATCH')
    const normalized = analyticsBindingSchema.parse({ ...binding, id: input.slot, output: { ...binding.output, datasetId: input.slot, grain },
      parameters: binding.parameters.map(parameter => ({ ...parameter, controlId: `${input.slot}.${parameter.controlId}`,
        defaultValue: Object.hasOwn(controls, parameter.controlId) ? controls[parameter.controlId] : parameter.defaultValue ?? null })) })
    const result = await this.dashboards.preview(context, { binding: normalized,
      controls: Object.fromEntries(normalized.parameters.map(parameter => [parameter.controlId, parameter.defaultValue ?? null])) })
    if (result.completeness.truncated || result.completeness.scope !== 'full_query_result' || result.completeness.totalAccuracy !== 'exact') throw new BadRequestException('LIBRARY_COMPLETE_DATA_REQUIRED')
    if (grain.length) {
      const seen = new Set<string>()
      for (const row of result.rows) {
        const values = grain.map(id => row[id])
        if (values.some(value => value === null || value === undefined)) throw new BadRequestException('LIBRARY_GRAIN_MISMATCH')
        const key = JSON.stringify(values)
        if (seen.has(key)) throw new BadRequestException('LIBRARY_GRAIN_MISMATCH')
        seen.add(key)
      }
    }
    return { binding: normalized, origin, synthetic }
  }

  /** Retry authorization does not rewrite files or register definitions again. */
  async authorizeInput(context: XpertResolvedViewHostContext, input: TemplateInput) {
    if (input.source.type === 'library') {
      if ((await this.catalog.resolve(context, input.source.releaseId)).document.kind !== 'public-dataset') throw new BadRequestException('LIBRARY_DATASET_REQUIRED')
    } else {
      const record = await this.datasets.open(context, input.source.artifactId)
      if (record.revision !== input.source.revision) throw new ConflictException('DASHBOARD_DATASET_CONFLICT')
    }
  }
}
