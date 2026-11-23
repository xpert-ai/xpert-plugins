import { fileAuthoring } from './authoring'
import { BadRequestException, ForbiddenException, HttpException, Inject } from '@nestjs/common'
import { createHash } from 'node:crypto'
import type { AnalyticsBinding, AnalyticsDiscoveryResult, AnalyticsProviderDescriptor, AnalyticsValue, JSONValue } from '@xpert-ai/contracts'
import { AnalyticsProvider, AnalyticsProviderError, ProjectAccessRuntimeCapability, WorkspaceFilesRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type AnalyticsQueryProvider, type AnalyticsProviderContext, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { MAX_BYTES, MAX_ROWS, PROVIDER, discoverySchema, jsonSchema, optionsSchema, payloadSchema, type FileDataset } from './schema'
import { outputColumns, validateOutput } from './query'
import { queryWorker } from './worker-client'

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
export const contractHash = (dataset: FileDataset) => hash(JSON.stringify(dataset))
const instructions = `Use an inspected dataset's bindingPayload and columns. Never supply paths, file references, scope, URLs, SQL, scripts or reader options in Binding.payload. select contains output keys. filters are AND conditions; value is {type:"parameter",name:"region"} or {type:"literal",value:"East"}. Every parameter must appear in filters; bind it through Binding.parameters and controls. For an optional all-values filter use skipWhenNull:true, required:false and defaultValue:null; empty string is a literal value. groupBy requires aggregates. Aggregates are {key:"total",operation:"sum",column:"net_sales"} or {key:"count",operation:"count"}; use a NEW key distinct from source columns. With aggregates select contains group keys and aggregate keys only. Sum of int64 outputs decimal; sum/min/max are nullable; count is non-null int64 and has no unit. Other aggregate types/units follow the source. Output sourceField uses output keys, and logicalType/nullable/unit must match the declared columns exactly. Use the authored business descriptions, never sum incompatible units or duplicate grains. decimal/int64 values and controls use exact strings. Preview every query before saving. Input beyond file/row limits fails instead of producing partial totals. Refresh rereads the current file. Artifact versions pin queries, not source data. XLSX formula caches are not recalculated or guaranteed current. Render with Dataset/Binding; never browser fetch.`
const queryContract: AnalyticsDiscoveryResult['queryContract'] = { operation: 'query', contractVersion: 1,
  payloadSchema: jsonSchema(payloadSchema), instructions: instructions + ' metadata.binding is a complete canonical Binding; bindingPayload alone is only its payload, not a Binding. Start from metadata.binding and preserve its envelope. Raw rows do not promise uniqueness; keep grain:[] unless verified, or group first and declare the grouping field IDs as grain.' }

const queryDiagnostics = new Map([
  ['FILE_DATASET_DISCOVERY_REQUEST_INVALID', 'For discovery use an empty object or the returned inspectRequest. Pass query payloads to preview.'],
  ['FILE_DATASET_CONTRACT_CHANGED', 'Read the current dataset binding from discovery and copy its revision and contractHash before previewing.'],
  ['FILE_DATASET_COLUMN_UNAVAILABLE', 'Use column keys from the current dataset binding. Aggregate inputs use source column keys and aggregate outputs use their aliases.'],
  ['FILE_DATASET_OUTPUT_CONTRACT_INVALID', 'Match each output sourceField, logical type and nullability to the selected column or aggregate alias.']
])

@AnalyticsProvider(PROVIDER)
export class FileAnalyticsProvider implements AnalyticsQueryProvider {
  readonly descriptor: AnalyticsProviderDescriptor = {
    id: PROVIDER, name: 'Workspace files (CSV / JSON / XLSX)', sourceKinds: ['definition'],
    operations: [{ name: 'query', contractVersion: 1, readOnly: true }]
  }
  readonly authoring = fileAuthoring
  readonly configuration = { kind: 'definition' as const, connection: 'workspace-files' as const, schema: jsonSchema(optionsSchema) }
  validateConfiguration(options: Record<string, JSONValue>) { return optionsSchema.parse(options) }
  constructor(@Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry) {}

  /** Reauthorize the exact file and hash its current bytes on every cache hit.
   * This saves parsing/aggregation, not the authorized source read; mtime is not a proof. */
  async authorizeResultReuse(binding: AnalyticsBinding, _parameters: Record<string, AnalyticsValue>, context: AnalyticsProviderContext) {
    return this.guarded(async () => {
      const query = payloadSchema.parse(binding.payload), { datasets } = optionsSchema.parse(context.options)
      const definition = datasets.find(dataset => dataset.id === query.datasetId)
      if (!definition || query.revision !== definition.revision || query.contractHash !== contractHash(definition))
        throw new Error('FILE_DATASET_CONTRACT_CHANGED')
      validateOutput(binding, outputColumns(definition, query))
      const { buffer } = await this.read(definition, context)
      await this.file(definition, context)
      return { sourceVersion: `${query.contractHash}:${hash(buffer)}` }
    })
  }

  /**
   * Only a manager of the exact source Project may delegate a current declared file dataset.
   * Validate the binding and authorized file metadata without reading rows; query access remains actor-scoped.
   */
  async authorizeGroupSharing(binding: AnalyticsBinding, context: AnalyticsProviderContext) {
    const query = payloadSchema.parse(binding.payload), { datasets } = optionsSchema.parse(context.options)
    const definition = datasets.find(dataset => dataset.id === query.datasetId)
    if (!definition || query.revision !== definition.revision || query.contractHash !== contractHash(definition) || definition.file.catalog !== 'projects')
      throw new ForbiddenException('FILE_DATASET_SHARING_UNAVAILABLE')
    await this.runtime.require(ProjectAccessRuntimeCapability).assertManage({ actor: context.actor, projectId: definition.file.projectId })
    await this.file(definition, context)
  }

  private check(context: AnalyticsProviderContext) {
    context.signal.throwIfAborted()
    if (Date.now() >= context.deadlineAt) throw new Error('FILE_DATASET_DEADLINE_EXCEEDED')
  }
  private async file(definition: FileDataset, context: AnalyticsProviderContext) {
    this.check(context)
    const file = definition.file
    if ('userId' in file && file.userId !== context.actor.userId) throw new ForbiddenException('FILE_DATASET_ACCESS_DENIED')
    if (file.catalog === 'projects') {
      const visible = await this.runtime.require(ProjectAccessRuntimeCapability).listReadable({ actor: context.actor, projectIds: [file.projectId] })
      if (!visible.some(p => p.projectId === file.projectId && !p.archived)) throw new ForbiddenException('FILE_DATASET_ACCESS_DENIED')
    }
    const reference = { ...file, ...context.actor }
    const files = this.runtime.require(WorkspaceFilesRuntimeCapability)
    const metadata = await files.resolveFile(reference)
    this.check(context)
    if (metadata.catalog !== file.catalog) throw new ForbiddenException('FILE_DATASET_SCOPE_CHANGED')
    if (metadata.size === undefined || metadata.size <= 0 || metadata.size > MAX_BYTES) throw new Error('FILE_DATASET_SIZE_LIMIT')
    return { files, reference }
  }
  private async read(definition: FileDataset, context: AnalyticsProviderContext) {
    const { files, reference } = await this.file(definition, context)
    const { buffer } = await files.readBuffer(reference)
    this.check(context)
    if (!buffer.length || buffer.length > MAX_BYTES) throw new Error('FILE_DATASET_SIZE_LIMIT')
    return { buffer, fetchedAt: new Date().toISOString() }
  }
  private async guarded<T>(run: () => Promise<T>): Promise<T> {
    try { return await run() } catch (error) {
      if (error instanceof HttpException) throw error
      const code = error instanceof Error && /^FILE_DATASET_[A-Z_]+(?:: [A-Za-z][A-Za-z0-9_]*)?$/.test(error.message) ? error.message : 'FILE_DATASET_INVALID'
      const guidance = queryDiagnostics.get(code)
      if (guidance) throw new AnalyticsProviderError({ schema: 'xpert.analytics.diagnostic', version: 1,
        stage: 'validation', retryable: false, code, message: guidance })
      throw new BadRequestException({ code: code.split(':')[0], message: code })
    }
  }
  async discover(request: JSONValue, context: AnalyticsProviderContext): Promise<AnalyticsDiscoveryResult> {
    return this.guarded(async () => {
      const parsed = discoverySchema.safeParse(request)
      if (!parsed.success) throw new Error('FILE_DATASET_DISCOVERY_REQUEST_INVALID')
      const input = parsed.data, { datasets } = optionsSchema.parse(context.options)
      const selected = input.datasetId ? datasets.filter(d => d.id === input.datasetId) : datasets.slice((input.page - 1) * 20, input.page * 20)
      if (input.datasetId && !selected.length) throw new Error('FILE_DATASET_UNAVAILABLE')
      const items: AnalyticsDiscoveryResult['items'] = []
      for (const definition of selected) {
        try { await this.file(definition, context) }
        catch (e) { if (!input.datasetId && e instanceof ForbiddenException) continue; throw e }
        const payload = payloadSchema.parse({ datasetId: definition.id, revision: definition.revision,
          contractHash: contractHash(definition), select: definition.columns.map(c => c.key) })
        let metadata: JSONValue = { revision: definition.revision, format: definition.reader.format }
        // A single-dataset definition can expose its usable contract on the first discovery,
        // without reading rows. Multi-dataset catalogs stay paginated and compact.
        if (input.datasetId || datasets.length === 1) {
          const binding: AnalyticsBinding = { source: context.source, id: definition.id,
            providerId: PROVIDER, operation: 'query', contractVersion: 1, payload: JSON.parse(JSON.stringify(payload)), parameters: [],
            output: { datasetId: definition.id, grain: [], fields: definition.columns.map(({ key, path, description, nullValues, ...field }) => ({ ...field, id: key, sourceField: key })) } }
          metadata = { ...metadata, contractHash: payload.contractHash, bindingPayload: JSON.parse(JSON.stringify(payload)),
            binding: JSON.parse(JSON.stringify(binding)), columns: definition.columns.map(({ path, nullValues, ...column }) => column) }
        }
        if (input.datasetId) {
          const read = await this.read(definition, context)
          const preview = await queryWorker(read.buffer, definition, payload, {}, 5, context.signal, context.deadlineAt)
          await this.file(definition, context)
          const previewFits = Buffer.byteLength(JSON.stringify(preview.rows)) <= 32000
          metadata = { ...metadata, preview: previewFits ? preview.rows : [], previewOmitted: !previewFits,
            ...(definition.reader.format === 'xlsx' ? { sheet: definition.reader.sheet, formulaPolicy: definition.reader.formulaPolicy } : {}),
            ...(previewFits ? { previewCompleteness: preview.completeness } : {}),
            limits: { inputBytes: MAX_BYTES, inputRows: MAX_ROWS }, sourceVersion: hash(read.buffer) }
        }
        items.push({ id: definition.id, name: definition.name, description: definition.description, kind: 'dataset', inspectRequest: { datasetId: definition.id }, metadata })
      }
      return { queryContract, items,
        ...(!input.datasetId && input.page * 20 < datasets.length ? { nextRequest: { page: input.page + 1 } } : {}) }
    })
  }
  async execute(binding: AnalyticsBinding, parameters: Record<string, AnalyticsValue>, context: AnalyticsProviderContext) {
    return this.guarded(async () => {
      this.check(context)
      const query = payloadSchema.parse(binding.payload), { datasets } = optionsSchema.parse(context.options)
      const definition = datasets.find(d => d.id === query.datasetId)
      if (!definition) throw new Error('FILE_DATASET_UNAVAILABLE')
      if (query.revision !== definition.revision || query.contractHash !== contractHash(definition)) throw new Error('FILE_DATASET_CONTRACT_CHANGED')
      validateOutput(binding, outputColumns(definition, query))
      const read = await this.read(definition, context)
      const result = await queryWorker(read.buffer, definition, query, parameters, context.maxRows, context.signal, context.deadlineAt)
      // No successful result is returned after current file/Assistant/Project access has been revoked.
      await this.file(definition, context)
      return { ...result, sourceFetchedAt: read.fetchedAt, sourceVersion: `${query.contractHash}:${hash(read.buffer)}` }
    })
  }
}
