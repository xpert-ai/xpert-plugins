import { BadRequestException, ConflictException, Injectable } from '@nestjs/common'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { DashboardService } from './dashboard.service'
import { DashboardDatasetService } from './dataset.service'
import { type DatasetDefinition } from './dataset.schema'
import { templateCreateSchema, type TemplateCreate } from './template.schema'
import { dashboardSchema, type DashboardManifest } from './dashboard.schema'

/** @beta Dataset-to-dashboard generation APIs and preset semantics may change incompatibly during beta. */
@Injectable()
export class DashboardTemplateService {
  constructor(private readonly dashboards: DashboardService, private readonly datasets: DashboardDatasetService) {}
  async create(context: XpertResolvedViewHostContext, input: TemplateCreate) {
    input = templateCreateSchema.parse(input)
    const dataset = await this.datasets.open(context, input.datasetId)
    if (dataset.revision !== input.datasetRevision) throw new ConflictException('DASHBOARD_DATASET_CONFLICT')
    return this.dashboards.save(context, templateManifest(dataset.definition, input), null, 0)
  }
}

export function templateManifest(dataset: DatasetDefinition, input: TemplateCreate): DashboardManifest {
  // A reusable dataset may override parameter defaults. Copy them into both the
  // new binding and controls so the dashboard's canonical default contract agrees.
  const binding = { ...dataset.binding, parameters: dataset.binding.parameters.map(parameter => ({ ...parameter,
    defaultValue: Object.prototype.hasOwnProperty.call(dataset.controls, parameter.controlId)
      ? dataset.controls[parameter.controlId] : parameter.defaultValue ?? null })) }
  const chart = input.template !== 'details'
  const x = binding.output.fields.find(field => field.id === input.x)
  const y = binding.output.fields.find(field => field.id === input.y)
  if (chart && (!x || !y || !['float64','int64','decimal'].includes(y.logicalType))) throw new BadRequestException('DASHBOARD_TEMPLATE_FIELDS_REQUIRED')
  const chartType = input.template === 'comparison' ? 'bar' : input.template === 'trend' ? 'line' : input.template
  return dashboardSchema.parse({ schema: 'xpert.live-dashboard', id: input.id, title: input.title, visualTheme: input.theme,
    bindings: [binding], controls: binding.parameters.map(parameter => ({ controlId: parameter.controlId, label: parameter.controlId,
      type: parameter.type, defaultValue: parameter.defaultValue,
      ...(parameter.allowedValues ? { allowedValues: parameter.allowedValues } : {}) })).filter((item, index, all) => all.findIndex(other => other.controlId === item.controlId) === index),
    charts: chart ? [{ id: 'main', title: input.title, type: chartType, datasetId: binding.output.datasetId, x: input.x, y: input.y }] : [],
    tables: [{ id: 'detail', title: dataset.name, datasetId: binding.output.datasetId, fields: binding.output.fields.slice(0, 30).map(field => field.id) }] })
}
