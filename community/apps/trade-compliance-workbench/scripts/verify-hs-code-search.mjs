import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const provider = readFileSync(join(root, 'src/lib/trade-compliance-workbench-view.provider.ts'), 'utf8')
const remoteApp = readFileSync(join(root, 'src/lib/remote-components/trade-compliance-workbench/app.js'), 'utf8')
const enrichment = readFileSync(join(root, 'src/lib/trade-compliance.enrichment.ts'), 'utf8')
const middleware = readFileSync(join(root, 'src/lib/trade-compliance-workbench.middleware.ts'), 'utf8')

const expectations = [
  ['view action', provider, "actionKey === 'search_hs_code'"],
  ['manifest action', provider, "key: 'search_hs_code'"],
  ['search helper export', enrichment, 'searchHsBianmaCodes'],
  ['pagination parser', enrichment, 'pagination'],
  ['query nav item', remoteApp, "tab('hs-code-search-page', '工具'"],
  ['query page renderer', remoteApp, 'renderHsCodeSearchPage'],
  ['query submit action', remoteApp, "executeAction('search_hs_code'"],
  ['detail view action', provider, "actionKey === 'get_hs_code_detail'"],
  ['detail manifest action', provider, "key: 'get_hs_code_detail'"],
  ['detail helper export', enrichment, 'getHsBianmaCodeDetail'],
  ['detail modal state', remoteApp, 'hsCodeDetailDialog'],
  ['detail modal renderer', remoteApp, 'renderHsCodeDetailModal'],
  ['detail load action', remoteApp, "executeAction('get_hs_code_detail'"],
  ['supplier candidate panel', remoteApp, 'renderSupplierHsCandidatePanel'],
  ['supplier candidate select action', remoteApp, 'selectHsCandidate'],
  ['supplier candidate search action', remoteApp, 'searchSupplierHsCandidatesForForm'],
  ['supplier display HS resolver', remoteApp, 'resolveDisplayHsCode'],
  ['supplier candidate default data', middleware, 'hsCodeCandidates'],
  ['supplier candidate status', middleware, 'hsCodeLookupStatus'],
  ['supplier fast default candidate helper', middleware, 'searchSupplierHsCandidatesForDefault'],
  ['supplier candidate count', middleware, 'hsCodeCandidateCount'],
  ['supplier suggested code', middleware, 'suggestedHsCode'],
  ['supplier contract HS resolver', middleware, 'resolveSupplierHsSuggestion'],
  ['supplier contract HS validator', middleware, 'resolveSupplierContractHsCode'],
  ['supplier contract HS preserved', middleware, 'enrichedHsCode: contractHsCode ?? suggestion?.code'],
  ['supplier auto-linked tax refund rate', middleware, 'taxRefundRate: suggestion?.taxRefundRate'],
  ['supplier auto-linked English name', middleware, 'englishName: suggestion?.englishName'],
  ['supplier candidate enrichment helper', middleware, 'enrichSupplierReviewItemsWithHsCandidates'],
  ['supplier contract enrichment', middleware, 'enrichSupplierReviewItemsWithHsCandidates(input.items'],
  ['pagination controls', remoteApp, 'searchHsCodePage'],
  ['fixed filter flag', remoteApp, 'filterFailureCode: true'],
  ['fixed English name flag', remoteApp, 'displayEnName: true']
]

const missing = expectations.filter(([, source, token]) => !source.includes(token))
if (missing.length > 0) {
  console.error('HS code search feature is incomplete:')
  for (const [label, , token] of missing) {
    console.error(`- ${label}: ${token}`)
  }
  process.exit(1)
}

const forbidden = [
  ['expired code checkbox label', remoteApp, '过滤过期编码'],
  ['chapter checkbox label', remoteApp, '显示分类章节'],
  ['English checkbox label', remoteApp, '显示英文名称'],
  ['HS option checkbox container', remoteApp, 'tcw-hs-options'],
  ['copy code label', remoteApp, '复制编码'],
  ['copy code handler', remoteApp, 'copyHsCode'],
  ['open source label', remoteApp, '打开原站'],
  ['external detail opener', remoteApp, 'window.open(item.detailUrl'],
  ['supplier candidate ten-item truncation', middleware, 'hsCodeCandidates: result.results.slice(0, 10)'],
  ['form candidate ten-item truncation', remoteApp, 'result.results.slice(0, 10)'],
  ['supplier final HS fields hidden from review rows', remoteApp, 'omitAutoSupplierHsFinalFields'],
  ['old prompt blocking auto-linked HS code', provider, '不要把模糊查询得到的海关编码'],
  ['supplier default enrichment all-page crawl', middleware, 'searchAllSupplierHsCandidates'],
  ['controlled goods fixed batch size', provider, 'CONTROLLED_GOODS_BATCH_SIZE'],
  ['controlled goods candidate chunking', provider, 'chunkArray(parsed.candidates'],
  ['controlled goods candidate batch prompt', provider, 'buildControlledGoodsCandidateBatchPrompt'],
  ['supplier lookup panel old candidate title', remoteApp, '候选海关编码'],
  ['supplier lookup panel old auto-link copy', remoteApp, '已自动关联，保留']
].filter(([, source, token]) => source.includes(token))

if (forbidden.length > 0) {
  console.error('HS code search still exposes removed checkbox options:')
  for (const [label, , token] of forbidden) {
    console.error(`- ${label}: ${token}`)
  }
  process.exit(1)
}
