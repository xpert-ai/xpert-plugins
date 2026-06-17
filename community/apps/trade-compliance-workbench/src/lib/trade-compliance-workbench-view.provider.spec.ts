import { TradeComplianceWorkbenchViewProvider } from './trade-compliance-workbench-view.provider.js'
import {
  TRADE_COMPLIANCE_PROVIDER_KEY,
  TRADE_COMPLIANCE_REMOTE_ENTRY_KEY,
  TRADE_COMPLIANCE_VIEW_KEY
} from './constants.js'

describe('TradeComplianceWorkbenchViewProvider', () => {
  it('returns one workbench manifest with three page actions', () => {
    const provider = new TradeComplianceWorkbenchViewProvider({} as never)
    const manifests = provider.getViewManifests(
      { tenantId: 'tenant-1', userId: 'user-1', hostType: 'agent', hostId: 'assistant-1', slots: [] } as never,
      'agent.workbench.main'
    )

    expect(manifests).toHaveLength(1)
    expect(manifests[0]?.key).toBe(TRADE_COMPLIANCE_VIEW_KEY)
    expect(manifests[0]?.source.provider).toBe(TRADE_COMPLIANCE_PROVIDER_KEY)
    expect(manifests[0]?.actions?.map((action) => action.key)).toEqual([
      'refresh',
      'upload_controlled_goods_file',
      'upload_supplier_contract',
      'upload_sales_contract',
      'confirm_review_item',
      'confirm_review_items',
      'generate_customs_workbook'
    ])
  })

  it('returns remote iframe html for the expected component entry', async () => {
    const provider = new TradeComplianceWorkbenchViewProvider({} as never)
    const entry = await provider.getRemoteComponentEntry(
      { tenantId: 'tenant-1', userId: 'user-1', hostType: 'agent', hostId: 'assistant-1', slots: [] } as never,
      TRADE_COMPLIANCE_VIEW_KEY,
      { isolation: 'iframe', entry: TRADE_COMPLIANCE_REMOTE_ENTRY_KEY } as never
    )

    expect(entry.contentType).toContain('text/html')
    expect(entry.html).toContain('Trade Compliance Workbench')
  })
})
