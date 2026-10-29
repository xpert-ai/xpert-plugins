import { SupplierDueDiligenceMiddleware } from './supplier-due-diligence.middleware.js'
import { SUPPLIER_DUE_DILIGENCE_FEATURE, SUPPLIER_DUE_DILIGENCE_MIDDLEWARE_NAME } from './constants.js'

describe('SupplierDueDiligenceMiddleware', () => {
  it('exposes procurement quote comparison tools and feature metadata', () => {
    const middleware = new SupplierDueDiligenceMiddleware({
      saveRequirementExtraction: jest.fn(),
      saveSupplierQuoteExtraction: jest.fn(),
      saveItemMatches: jest.fn(),
      saveRiskItems: jest.fn(),
      finalizeRecommendation: jest.fn(),
      reportParseFailure: jest.fn()
    })

    const runtime = middleware.createMiddleware({}, {
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      userId: 'user-1',
      xpertId: 'xpert-1',
      projectId: 'project-1'
    })

    expect(middleware.meta.name).toBe(SUPPLIER_DUE_DILIGENCE_MIDDLEWARE_NAME)
    expect(middleware.meta.features).toContain(SUPPLIER_DUE_DILIGENCE_FEATURE)
    expect(runtime.name).toBe(SUPPLIER_DUE_DILIGENCE_MIDDLEWARE_NAME)
    expect(runtime.tools?.map((tool) => tool.name)).toEqual([
      'procurement_save_requirement',
      'procurement_save_supplier_quote',
      'procurement_save_item_matches',
      'procurement_save_risk_items',
      'procurement_finalize_recommendation',
      'procurement_report_parse_failure'
    ])
  })
})
