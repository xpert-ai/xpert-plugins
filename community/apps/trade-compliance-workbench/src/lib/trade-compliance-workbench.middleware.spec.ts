import { TradeComplianceWorkbenchMiddleware } from './trade-compliance-workbench.middleware.js'
import {
  TRADE_COMPLIANCE_MIDDLEWARE_NAME,
  TRADE_COMPLIANCE_TOOL_NAMES
} from './constants.js'

describe('TradeComplianceWorkbenchMiddleware', () => {
  it('exposes the trade compliance agent tools', async () => {
    const service = {} as never
    const middleware = new TradeComplianceWorkbenchMiddleware(service)
    const runtime = await middleware.createMiddleware({}, { tenantId: 'tenant-1', userId: 'user-1' } as never)

    expect(runtime.name).toBe(TRADE_COMPLIANCE_MIDDLEWARE_NAME)
    expect(runtime.tools.map((item) => item.name)).toEqual(TRADE_COMPLIANCE_TOOL_NAMES)
  })
})
