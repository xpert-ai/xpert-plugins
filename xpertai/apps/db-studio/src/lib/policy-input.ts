import type { PolicyInput } from './types.js'

export type ConnectionPolicy = Omit<PolicyInput, 'dataSourceId'>

// Read responses may include persistence metadata; write requests contain only editable fields.
export function policyInput(dataSourceId: string, policy: ConnectionPolicy): PolicyInput {
  return {
    dataSourceId,
    revision: policy.revision,
    readOnly: policy.readOnly,
    autoActions: policy.autoActions,
    objects: policy.objects.map(({ name, kind, database, schema, engineCatalog }) => ({
      name, kind, database, schema, engineCatalog,
    })),
  }
}
