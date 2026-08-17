export type QuotaNormalizationValidationInput = {
  pageCount: number
  chunks: Array<{
    writeKey: string
    data: {
      quotaCode: string
      resources: Array<{ code: string; consumption: string }>
    }
  }>
}

export function validateQuotaNormalization(result: QuotaNormalizationValidationInput) {
  if (!result.pageCount || !result.chunks.length) throw validationError('quota_parser_empty', 'No quota items were extracted from the PDF.')
  const keys = result.chunks.map((chunk) => chunk.writeKey)
  if (new Set(keys).size !== keys.length) throw validationError('quota_duplicate_write_key', 'The normalized quota data contains duplicate write keys.')
  const gates = [
    ['13-47', '12330300', '12.900'],
    ['15-152', '11450342', '19.845'],
    ['15-161', '11010304', '2.884']
  ]
  for (const [quotaCode, resourceCode, consumption] of gates) {
    const chunk = result.chunks.find((item) => item.data.quotaCode === quotaCode)
    if (!chunk?.data.resources.some((resource) => resource.code === resourceCode && resource.consumption === consumption)) {
      throw validationError('quota_representative_gate_failed', `Representative quality gate failed for ${quotaCode}/${resourceCode}/${consumption}.`)
    }
  }
}

function validationError(code: string, message: string) {
  return Object.assign(new Error(message), { code })
}
