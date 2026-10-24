export const target = { version: 1, kind: 'provider', generation: '11111111-1111-4111-a111-111111111111' }
export function supervisedReceipt(receipt) {
  return {
    invocationId: 'invocation',
    processId: 'owned-process',
    environment: { type: 'computer', environmentId: 'environment', instanceId: 'generation' },
    ...receipt,
    supervision: 1
  }
}
export function exitEvidence(receipt) {
  return {
    version: 1,
    coverage: 'descendants',
    invocationId: receipt.invocationId,
    processId: receipt.processId,
    environment: receipt.environment
  }
}
