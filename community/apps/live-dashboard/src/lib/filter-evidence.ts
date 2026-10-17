import { tool } from '@langchain/core/tools'
import { z } from 'zod/v3'
import { jsonEncodedSchema } from '@xpert-ai/plugin-sdk'
import type { AnalyticsBinding, XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import type { DashboardService } from './dashboard.service'

const scalar = z.union([z.string().max(4000), z.number().finite(), z.boolean(), z.null()])
const schema = z.object({ previewId: z.string().min(1),
  controls: jsonEncodedSchema(z.record(scalar)),
  expectations: jsonEncodedSchema(z.array(z.object({ fieldId: z.string().min(1), oneOf: z.array(scalar).min(1).max(100) }).strict()).min(1).max(24))
}).strict()

/** Model quality evidence, not authorization: every query still goes through Analytics. */
export function createFilterEvidence(service: DashboardService, scope: XpertResolvedViewHostContext,
  previews: Map<string, AnalyticsBinding>) {
  const checked = new Map<string, Set<string>>()
  return {
    assert(binding: AnalyticsBinding, previewId: string) {
      // Nullable dimension selectors would otherwise only be tested with their "all" default.
      // Other semantics (ranges, search, etc.) remain provider-owned.
      for (const parameter of binding.parameters) if (parameter.defaultValue == null &&
        binding.output.fields.some(field => field.id === parameter.controlId && field.role === 'dimension') &&
        !checked.get(previewId)?.has(parameter.controlId))
        throw new Error(`DASHBOARD_FILTER_TEST_REQUIRED: test ${parameter.controlId} with a real non-null value using dashboard_test_filter before saving`)
    },
    tool: tool(async (input: z.infer<typeof schema>) => {
      const binding = previews.get(input.previewId)
      if (!binding) throw new Error('DASHBOARD_PREVIEW_REQUIRED')
      if (Object.keys(input.controls).some(id => !binding.parameters.some(parameter => parameter.controlId === id)))
        throw new Error('DASHBOARD_UNKNOWN_CONTROL')
      if (input.expectations.some(expected => !binding.output.fields.some(field => field.id === expected.fieldId)))
        throw new Error('DASHBOARD_UNKNOWN_FIELD')
      const dataset = await service.preview(scope, { binding, controls: {
        ...Object.fromEntries(binding.parameters.map(parameter => [parameter.controlId, parameter.defaultValue ?? null])), ...input.controls
      } })
      if (dataset.completeness.truncated || !dataset.rows.length)
        throw new Error('DASHBOARD_FILTER_TEST_INCONCLUSIVE: choose an existing value with a complete, nonempty result')
      for (const expected of input.expectations) if (dataset.rows.some(row => !expected.oneOf.includes(row[expected.fieldId])))
        throw new Error(`DASHBOARD_FILTER_TEST_FAILED: ${expected.fieldId} contains rows outside the expected values; repair the native query or script and preview again`)
      const controls = checked.get(input.previewId) ?? new Set<string>()
      for (const [controlId, value] of Object.entries(input.controls)) if (value !== null &&
        input.expectations.some(expected => expected.fieldId === controlId && expected.oneOf.length === 1 && expected.oneOf[0] === value)) controls.add(controlId)
      checked.set(input.previewId, controls)
      return JSON.stringify({ previewId: input.previewId, passed: true, checkedControls: [...controls], rows: dataset.rows.slice(0, 20), completeness: dataset.completeness })
    }, { name: 'dashboard_test_filter', description: 'Verify a previewed Binding with concrete filter values and expected field values. For a nullable dimension selector, test a real non-null value and expect every row of the matching field to equal it before saving. Does not change defaults. A failed check must be repaired before create/update.',
      schema, verboseParsingErrors: true, metadata: { toolName: { en_US: 'Verify filter results', zh_Hans: '验证筛选结果' } } })
  }
}
