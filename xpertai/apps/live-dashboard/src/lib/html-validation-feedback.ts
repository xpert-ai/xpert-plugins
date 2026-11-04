import { BadRequestException } from '@nestjs/common'
import type { DashboardManifest } from './dashboard.schema'

/** Report only binding identities observed by validation, never query payloads or returned rows. */
export function htmlPreflightFailure(manifest: DashboardManifest, report: { errors: string[]; requestedBindings: string[] }) {
  const expectedBindingIds = manifest.bindings.map(binding => binding.id)
  const requestedBindingIds = [...new Set(report.requestedBindings)]
  const expected = new Set(expectedBindingIds), requested = new Set(requestedBindingIds)
  const bindingDiagnostics = {
    expectedBindingIds, requestedBindingIds,
    missingQueryBindingIds: expectedBindingIds.filter(id => !requested.has(id)),
    unexpectedQueryBindingIds: requestedBindingIds.filter(id => !expected.has(id))
  }
  const repair = 'Compare the candidate manifest Binding IDs with the HTML query/subscribe IDs. Requested IDs are observed calls, not a static list of every HTML reference. For an existing Binding, preserve dashboard_open.bindings[].id and preview its complete edited Binding with dashboard_preview_binding. Include all intended current-run previewIds, controls and htmlPath together in dashboard_update; omitted components remain saved. Add new Bindings only for new data needs; remove existing ones only for explicitly requested deletions. Repair other reported page errors before retrying. No dashboard was saved.'
  // Some tool hosts retain only Error.message, so keep the bounded identity diagnostics there too.
  return new BadRequestException({ code: 'DASHBOARD_HTML_PREFLIGHT_FAILED', errors: report.errors,
    bindingDiagnostics, message: `DASHBOARD_HTML_PREFLIGHT_FAILED: ${JSON.stringify(report.errors)}. Binding diagnostics: ${JSON.stringify(bindingDiagnostics)}. ${repair}` })
}
