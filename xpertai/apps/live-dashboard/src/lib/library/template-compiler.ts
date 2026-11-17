import { BadRequestException } from '@nestjs/common'
import { parse, parseFragment, serialize, type DefaultTreeAdapterMap } from 'parse5'
import { dashboardSchema, type DashboardManifest } from '../dashboard.schema'
import type { AnalysisTemplate } from './execution-resolution'
import type { LibraryDatasetBindingService } from './dataset-binding.service'
import type { TemplateInput } from './execution-contract'
import { templateOriginSchema } from './origin.schema'
import { z } from 'zod/v3'

export const TEMPLATE_CONTEXT_ID = 'xpert-template-context'
export type BoundTemplateInput = Awaited<ReturnType<LibraryDatasetBindingService['bind']>> & { input: TemplateInput }

/** Authored HTML consumes inert JSON, never text-replacement expressions or server-side code. */
function documentContext(html: string, context: { title: string; inputs: Record<string, { bindingId: string; datasetId: string; fields: Record<string, string>; synthetic: boolean }>;
  parameters: Record<string, string | number | boolean | null> }) {
  const document = parse(html)
  let head: DefaultTreeAdapterMap['element'] | undefined
  const visit = (node: DefaultTreeAdapterMap['node']) => {
    if ('attrs' in node && node.attrs.some(attr => attr.name === 'id' && attr.value === TEMPLATE_CONTEXT_ID)) throw new BadRequestException('LIBRARY_HTML_RESERVED_CONTEXT')
    if ('tagName' in node && node.tagName === 'head') head = node
    if ('childNodes' in node) node.childNodes.forEach(visit)
  }
  visit(document)
  if (!head) throw new BadRequestException('LIBRARY_HTML_INVALID')
  const data = JSON.stringify({ schema: 'xpert.library.template-context', version: 1, ...context }).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
  const script = parseFragment(`<script type="application/json" id="${TEMPLATE_CONTEXT_ID}">${data}</script>`).childNodes[0]
  script.parentNode = head; head.childNodes.unshift(script)
  return serialize(document)
}
export function templateParameters(template: AnalysisTemplate, supplied: Record<string, string | number | boolean | null>) {
  const parameters: typeof supplied = {}
  for (const key of Object.keys(supplied)) if (!template.content.parameters.some(parameter => parameter.key === key)) throw new BadRequestException('LIBRARY_PARAMETER_UNKNOWN')
  for (const parameter of template.content.parameters) {
    const value = Object.hasOwn(supplied, parameter.key) ? supplied[parameter.key] : parameter.defaultValue
    if (value !== null && (parameter.type === 'number' ? typeof value !== 'number' || !Number.isFinite(value)
      : parameter.type === 'boolean' ? typeof value !== 'boolean' : typeof value !== 'string') || parameter.allowedValues && !parameter.allowedValues.includes(value)) throw new BadRequestException('LIBRARY_PARAMETER_INVALID')
    if (parameter.type === 'date' && value !== null) {
      const date = typeof value === 'string' ? new Date(`${value}T00:00:00Z`) : new Date(NaN)
      if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new BadRequestException('LIBRARY_PARAMETER_INVALID')
    }
    parameters[parameter.key] = value
  }
  if (template.content.presentation.type === 'standard' && template.content.parameters.length) throw new BadRequestException('LIBRARY_STANDARD_PARAMETERS_UNSUPPORTED')
  return parameters
}
export function compileTemplate(template: AnalysisTemplate, inputs: BoundTemplateInput[], options: { id: string; title: string;
  theme: 'system' | 'slate' | 'contrast'; parameters: Record<string, string | number | boolean | null>;
  origin: z.infer<typeof templateOriginSchema>; html?: string }): DashboardManifest {
  const parameters = templateParameters(template, options.parameters)
  const field = (slot: string, role: string) => {
    const input = inputs.find(item => item.input.slot === slot), id = input?.input.mapping[role]
    if (!id) throw new BadRequestException('LIBRARY_FIELD_MAPPING_REQUIRED')
    return id
  }
  const presentation = template.content.presentation
  const manifest = { schema: 'xpert.live-dashboard', id: options.id, title: options.title, visualTheme: options.theme,
    templateOrigin: { ...options.origin, parameters }, bindings: inputs.map(item => item.binding),
    controls: inputs.flatMap(item => item.binding.parameters.map(parameter => ({ controlId: parameter.controlId, type: parameter.type,
      label: parameter.controlId, defaultValue: parameter.defaultValue ?? null, ...(parameter.allowedValues ? { allowedValues: parameter.allowedValues } : {}) }))),
    charts: presentation.type === 'standard' ? presentation.charts.map(chart => ({ id: chart.id, title: chart.title, type: chart.type,
      datasetId: chart.slot, x: field(chart.slot, chart.x), y: field(chart.slot, chart.y), ...(chart.color ? { color: field(chart.slot, chart.color) } : {}) })) : [],
    tables: presentation.type === 'standard' ? presentation.tables.map(table => ({ id: table.id, title: table.title,
      datasetId: table.slot, fields: table.fields.map(role => field(table.slot, role)) })) : [],
    ...(presentation.type === 'html' ? { presentation: { type: 'html', html: documentContext(options.html ?? '', { title: options.title,
      inputs: Object.fromEntries(inputs.map(item => [item.input.slot, { bindingId: item.binding.id, datasetId: item.binding.output.datasetId,
        fields: item.input.mapping, synthetic: item.synthetic }])), parameters }) } } : {}) }
  return dashboardSchema.parse(manifest)
}
