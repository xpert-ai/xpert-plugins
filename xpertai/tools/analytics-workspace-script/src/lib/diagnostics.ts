/** Return actionable language hints without exposing arbitrary script stdout, input rows or host paths. */
export function scriptFailureHint(message: string): string {
  if (message.includes('WORKSPACE_SCRIPT_CONTROLS_INVALID'))
    return 'sources.query(alias, controls) accepts only declared control IDs mapped to scalar values, for example {"region": null}. Do not pass a native query, params, target or Binding; those are already stored in the definition.'
  if (message.includes("AttributeError: 'dict' object has no attribute"))
    return 'Python sources.query and files.read return dictionaries. Use source["rows"] and file["text"], not source.rows or file.text. Dataset row keys are the upstream Binding field IDs.'
  if (message.includes('KeyError:'))
    return 'Python dictionary key missing. Inspect the upstream Binding output.fields[].id and preview rows; use those IDs, not native sourceField names. Do not guess alternative keys.'
  if (message.includes('ERR_UNKNOWN_BUILTIN_MODULE') || message.includes('ModuleNotFoundError'))
    return 'Only standard libraries are installed. For CSV use ctx.csv.parse(text); Node has no node:csv module.'
  if (message.includes('SyntaxError'))
    return 'Fix the syntax in the Workspace script before registering another version.'
  return 'Check the query(ctx) entrypoint, declared aliases, source controls and Dataset output contract.'
}
