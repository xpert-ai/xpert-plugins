import { boundedMap } from './bounded-map'
import { BadRequestException, ForbiddenException } from '@nestjs/common'
import type { AnalyticalDataset, AnalyticsValue } from '@xpert-ai/contracts'
import { AnalyticsRuntimeCapability, type DataSourceActor, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import type { DashboardManifest } from './dashboard.schema'

export function validateControls(manifest: DashboardManifest, input: Record<string, AnalyticsValue>) {
  if (Object.keys(input).some(id => !manifest.controls.some(control => control.controlId === id))) throw new BadRequestException('DASHBOARD_UNKNOWN_CONTROL')
  const values = { ...Object.fromEntries(manifest.controls.filter(control => control.defaultValue !== undefined).map(control => [control.controlId, control.defaultValue ?? null])), ...input }
  for (const control of manifest.controls) {
    const value = values[control.controlId]
    if (value === undefined) continue
    if (control.allowedValues && !control.allowedValues.includes(value)) throw new BadRequestException('DASHBOARD_CONTROL_VALUE_DENIED')
    if (value !== null && (control.type === 'number' ? typeof value !== 'number' || !Number.isFinite(value) : control.type === 'boolean' ? typeof value !== 'boolean' : typeof value !== 'string'))
      throw new BadRequestException('DASHBOARD_CONTROL_TYPE_INVALID')
  }
  return values
}

export async function queryDashboardBinding(runtime: RuntimeCapabilityRegistry, actor: DataSourceActor, manifest: DashboardManifest, bindingId: string, input: Record<string, AnalyticsValue>) {
  const binding = manifest.bindings.find(item => item.id === bindingId)
  if (!binding) throw new ForbiddenException('DASHBOARD_BINDING_DENIED')
  const controls = validateControls(manifest, input)
  const selected = Object.fromEntries(Object.entries(controls).filter(([id]) => binding.parameters.some(parameter => parameter.controlId === id)))
  return runtime.require(AnalyticsRuntimeCapability).query(actor, { binding, controls: selected })
}

export async function queryDashboard(runtime: RuntimeCapabilityRegistry, actor: DataSourceActor, manifest: DashboardManifest, input: Record<string, AnalyticsValue>, progress?: (completed: number) => Promise<void>) {
  validateControls(manifest, input)
  let completed = 0
  const datasets = await boundedMap(manifest.bindings, async binding => {
    await progress?.(completed)
    const result = await queryDashboardBinding(runtime, actor, manifest, binding.id, input)
    await progress?.(++completed)
    return result
  })
  if (Buffer.byteLength(JSON.stringify(datasets)) > 3_000_000) throw new BadRequestException('DASHBOARD_RESULT_TOO_LARGE')
  return datasets
}

/** Read-only rendering can show independent successful bindings. Saving/publishing still
 * uses queryDashboard and requires every binding to validate. Never return native error
 * details, which may contain private source configuration or query text. */
export async function queryDashboardPartial(runtime: RuntimeCapabilityRegistry, actor: DataSourceActor, manifest: DashboardManifest, input: Record<string, AnalyticsValue>) {
  validateControls(manifest, input)
  const datasets: AnalyticalDataset[] = []
  const failures: Array<{ bindingId: string; datasetId: string; reason: 'unavailable' }> = []
  await boundedMap(manifest.bindings, async binding => {
    try { datasets.push(await queryDashboardBinding(runtime, actor, manifest, binding.id, input)) }
    catch { failures.push({ bindingId: binding.id, datasetId: binding.output.datasetId, reason: 'unavailable' }) }
  })
  if (Buffer.byteLength(JSON.stringify(datasets)) > 3_000_000) throw new BadRequestException('DASHBOARD_RESULT_TOO_LARGE')
  return { datasets, failures }
}
