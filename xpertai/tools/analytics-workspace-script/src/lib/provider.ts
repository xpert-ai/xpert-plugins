import { BadRequestException, Inject } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { AnalyticsBinding, AnalyticsProviderDescriptor, AnalyticsValue, AnalyticsDiscoveryResult, JSONValue } from '@xpert-ai/contracts'
import { AnalyticsProvider, AnalyticsRuntimeCapability, ArtifactsRuntimeCapability, SandboxJobsRuntimeCapability,
  WorkspaceFilesRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN, normalizeAnalyticsResult, isSandboxJobRuntimeError,
  type AnalyticsQueryProvider, type AnalyticsProviderContext, type AnalyticsProviderResult, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { PLUGIN, PROVIDER, discoverySchema, payloadSchema, resultSchema, invocationSchema } from './schema'
import { ScriptDefinitions, digest } from './definitions'
import { scriptFailureHint } from './diagnostics'

@AnalyticsProvider(PROVIDER)
export class WorkspaceScriptProvider implements AnalyticsQueryProvider {
  readonly descriptor: AnalyticsProviderDescriptor = {
    id: PROVIDER, name: 'Workspace Python / JavaScript', dataSourceTypes: ['workspace-script'],
    sharing: { mode: 'owner_only', reasonCode: 'WORKSPACE_SCRIPT_PRIVATE_DEPENDENCIES' },
    operations: [{ name: 'query', contractVersion: 1, readOnly: true }],
    connectionType: { type: 'workspace-script', name: 'Workspace scripts', configuration: { type: 'object', properties: {}, additionalProperties: false } }
  }
  constructor(@Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry, private readonly definitions: ScriptDefinitions) {}
  async discover(request: JSONValue, context: AnalyticsProviderContext): Promise<AnalyticsDiscoveryResult> {
    const parsed = discoverySchema.parse(request)
    const items: AnalyticsDiscoveryResult['items'] = []
    let nextRequest: JSONValue | undefined
    if ('artifactId' in parsed) {
      const definition = await this.definitions.open(context.actor, parsed.artifactId, parsed.versionId)
      items.push({ id: parsed.artifactId, name: definition.title, kind: 'dataset', metadata: JSON.parse(JSON.stringify({
        binding: this.definitions.binding(context.dataSourceId, parsed.artifactId, parsed.versionId, definition) })) })
    } else {
      const records = await this.runtime.require(ArtifactsRuntimeCapability).listArtifacts({ pluginName: PLUGIN, resourceType: 'definition', status: 'active', page: parsed.page, pageSize: 50 })
      for (const item of records.items.filter(item => item.tenantId === context.actor.tenantId && item.userId === context.actor.userId && item.organizationId === context.actor.organizationId))
        if (item.currentVersionId) items.push({ id: item.id, name: item.title ?? 'Workspace dataset', kind: 'dataset',
          inspectRequest: { artifactId: item.id, versionId: item.currentVersionId }, metadata: {} })
      if (records.page * records.pageSize < records.total) nextRequest = { page: records.page + 1 }
    }
    return { schemaVersion: 1, items, ...(nextRequest ? { nextRequest } : {}), queryContract: { operation: 'query', contractVersion: 1,
      payloadSchema: { type: 'object', properties: { artifactId: { type: 'string' }, versionId: { type: 'string' } }, required: ['artifactId', 'versionId'], additionalProperties: false },
      instructions: 'Use workspace_dataset_register to create a script definition. Follow nextRequest even when a page has no visible definitions. Inspect its exact Artifact/version to get the binding. Copy parameters/output exactly. The payload contains only artifactId/versionId. Every query executes the Workspace script again with current inputs. Python/JavaScript scripts return columns/rows; platform validates Dataset fields/grain. Do not invent input data.' } }
  }
  async execute(binding: AnalyticsBinding, parameters: Record<string, AnalyticsValue>, context: AnalyticsProviderContext): Promise<AnalyticsProviderResult> {
    context.signal.throwIfAborted()
    const payload = payloadSchema.parse(binding.payload), definition = await this.definitions.open(context.actor, payload.artifactId, payload.versionId)
    if (JSON.stringify(definition.output) !== JSON.stringify(binding.output) || JSON.stringify(definition.parameters) !== JSON.stringify(binding.parameters))
      throw new BadRequestException('WORKSPACE_SCRIPT_BINDING_CHANGED: copy the registered output and parameters exactly')
    if (definition.sources.some(source => source.binding.providerId === PROVIDER)) throw new Error('WORKSPACE_SCRIPT_RECURSION_DENIED')
    const files = this.runtime.require(WorkspaceFilesRuntimeCapability), jobs = this.runtime.require(SandboxJobsRuntimeCapability)
    const code = (await files.readBuffer(definition.script)).buffer, codeHash = digest(code)
    if (!code.length || code.length > 64000 || (definition.mode === 'pinned' && codeHash !== definition.scriptSha256)) throw new Error('WORKSPACE_SCRIPT_CODE_CHANGED')
    // Snapshot current code once; its hash is checked again by Core at job materialization.
    const script = await this.definitions.store(context.actor, code, definition.language === 'python' ? 'script.py' : 'script.mjs')
    const fileCache = new Map<string, { text: string; sha256: string; fetchedAt: string }>()
    const lineage: Array<{ alias: string; executionId: string; sourceFetchedAt: string; truncated: boolean; upstreamExecutionId?: string }> = []
    let inputRows = 0
    const jobId = randomUUID(), startedAt = new Date().toISOString()
    context.signal.throwIfAborted()
    const timeoutMs = context.deadlineAt - Date.now() - 1500
    if (timeoutMs <= 0) throw new Error('WORKSPACE_SCRIPT_DEADLINE_EXCEEDED')
    const result = await jobs.run({ jobId, action: definition.runtime.action, actionVersion: definition.runtime.actionVersion,
      idempotencyKey: `workspace_script/${context.executionId}`, scope: { ...context.actor, pluginName: PLUGIN, businessResourceType: 'script', businessResourceId: payload.artifactId },
      payload: { language: definition.language, parameters, outputKeys: definition.output.fields.map(field => field.sourceField) }, files: [{ reference: script, targetPath: 'script', size: code.length, sha256: codeHash }],
      timeoutMs, outputs: [{ path: 'dataset.json', originalName: 'dataset.json', mimeType: 'application/json',
        destination: { tenantId: context.actor.tenantId, userId: context.actor.userId, catalog: 'users', folder: `workspace-script/executions/${jobId}` } }] },
      { signal: context.signal, invocation: { operations: ['source.query', 'file.read'], maxCalls: 16, maxBytes: 8_000_000,
        handle: async (operation, input, invocation) => {
          invocation.signal.throwIfAborted()
          if (operation !== 'file.read' && operation !== 'source.query') throw new Error('WORKSPACE_SCRIPT_OPERATION_DENIED')
          const parsedRequest = invocationSchema.safeParse(input)
          if (!parsedRequest.success) throw new Error('WORKSPACE_SCRIPT_CONTROLS_INVALID')
          const request = parsedRequest.data
          // Revalidate the owning Assistant and Artifact on every invocation.
          await this.definitions.open(context.actor, payload.artifactId, payload.versionId)
          if (operation === 'file.read') {
            if (Object.keys(request.controls).length) throw new Error('WORKSPACE_SCRIPT_FILE_PARAMETERS_DENIED')
            const file = definition.files.find(file => file.alias === request.alias)
            if (!file) throw new Error('WORKSPACE_SCRIPT_ALIAS_DENIED')
            await files.resolveFile(file.reference)
            let value = fileCache.get(request.alias)
            if (!value) {
              const read = await files.readBuffer(file.reference)
              if (read.buffer.length > 1_000_000) throw new Error('WORKSPACE_SCRIPT_FILE_LIMIT')
              value = { text: new TextDecoder('utf-8', { fatal: true }).decode(read.buffer), sha256: digest(read.buffer), fetchedAt: new Date().toISOString() }
              fileCache.set(request.alias, value)
            }
            return value
          }
          const source = definition.sources.find(source => source.alias === request.alias)
          if (!source) throw new Error('WORKSPACE_SCRIPT_ALIAS_DENIED')
          const dataset = await this.runtime.require(AnalyticsRuntimeCapability).query(context.actor,
            { binding: source.binding, controls: request.controls }, { signal: invocation.signal, deadlineAt: context.deadlineAt, ancestry: context.ancestry })
          inputRows += dataset.rows.length
          if (inputRows > 4000) throw new Error('WORKSPACE_SCRIPT_INPUT_LIMIT')
          lineage.push({ alias: request.alias, executionId: dataset.provenance.executionId, sourceFetchedAt: dataset.freshness.sourceFetchedAt,
            truncated: dataset.completeness.scope !== 'full_query_result' || dataset.completeness.truncated, upstreamExecutionId: dataset.provenance.upstreamExecutionId })
          return JSON.parse(JSON.stringify(dataset))
        } } }).catch((error: unknown) => {
          if (!isSandboxJobRuntimeError(error)) throw error
          const hint = scriptFailureHint(error.message)
          const contracts = definition.sources.map(source => ({ alias: source.alias,
            controls: source.binding.parameters.map(parameter => parameter.controlId),
            rowKeys: source.binding.output.fields.map(field => field.id) }))
          throw new BadRequestException({ code: 'WORKSPACE_SCRIPT_EXECUTION_FAILED',
            message: `${error.code}: ${hint} Declared source contracts: ${JSON.stringify(contracts)}`, jobId })
        })
    const output = result.outputs[0]
    if (!output) throw new Error('WORKSPACE_SCRIPT_OUTPUT_UNAVAILABLE')
    let outputBytes: Buffer
    try { outputBytes = (await files.readBuffer(output.reference)).buffer }
    finally { await files.deleteFile(output.reference) }
    if (outputBytes.length > 2_000_000 || digest(outputBytes) !== output.sha256) throw new Error('WORKSPACE_SCRIPT_OUTPUT_CHANGED')
    const parsed = resultSchema.parse(JSON.parse(outputBytes.toString('utf8')))
    const truncated = lineage.some(item => item.truncated)
    const sourceFetchedAt = [...lineage.map(item => item.sourceFetchedAt), ...[...fileCache.values()].map(item => item.fetchedAt)].sort()[0] ?? startedAt
    const providerResult: AnalyticsProviderResult = { ...parsed, completeness: { returnedRows: parsed.rows.length,
      totalAccuracy: truncated ? 'unknown' : 'exact', scope: truncated ? 'page' : 'full_query_result', truncated,
      ...(!truncated ? { totalRows: parsed.rows.length } : {}) }, sourceFetchedAt, sourceVersion: `${payload.versionId}:${codeHash}`, upstreamExecutionId: jobId }
    normalizeAnalyticsResult(binding, providerResult, context.executionId, context.maxRows)
    const evidence = Buffer.from(JSON.stringify({ schema: 'workspace-script.execution/v1', executionId: context.executionId, jobId, definition: payload,
      scriptSha256: codeHash, parametersSha256: digest(JSON.stringify(parameters)), inputs: lineage,
      files: [...fileCache.entries()].map(([alias, value]) => ({ alias, sha256: value.sha256, fetchedAt: value.fetchedAt })), outputSha256: output.sha256, sourceFetchedAt }))
    const audit = await this.runtime.require(ArtifactsRuntimeCapability).createArtifact({ source: { pluginName: PLUGIN, resourceType: 'execution', resourceId: context.executionId },
      title: definition.title, kind: 'file', scope: context.actor })
    await this.runtime.require(ArtifactsRuntimeCapability).ensureArtifactVersion({ artifactId: audit.id, idempotencyKey: context.executionId,
      sha256: digest(evidence), mimeType: 'application/json', fileName: 'execution.json', workspaceFileRef: await this.definitions.store(context.actor, evidence, 'execution.json') })
    return { ...providerResult, auditRef: audit.id }
  }
}
