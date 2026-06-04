jest.mock('@xpert-ai/plugin-sdk', () => ({
  __esModule: true,
  AgentMiddlewareStrategy: () => (target: unknown) => target,
  RequestContext: {
    currentTenantId: jest.fn(() => 'tenant-1'),
    currentUserId: jest.fn(() => 'user-1'),
    getOrganizationId: jest.fn(() => 'org-1')
  }
}))

import {
  SALES_ONTOLOGY_ACTION_GOVERNANCE_MIDDLEWARE_NAME,
  SALES_ONTOLOGY_CONTEXT_MIDDLEWARE_NAME,
  SALES_ONTOLOGY_DECISION_MIDDLEWARE_NAME,
  SALES_ONTOLOGY_FEATURE,
  SALES_ONTOLOGY_MIDDLEWARE_NAME,
  SALES_ONTOLOGY_SCENARIO_LEARNING_MIDDLEWARE_NAME
} from './constants.js'
import {
  SalesOntologyActionGovernanceMiddleware,
  SalesOntologyContextMiddleware,
  SalesOntologyDecisionMiddleware,
  SalesOntologyMiddleware,
  SalesOntologyScenarioLearningMiddleware
} from './sales-ontology.middleware.js'

describe('Sales Ontology middleware providers', () => {
  const context = {
    tenantId: 'tenant-1',
    userId: 'user-1',
    organizationId: 'org-1',
    xpertId: 'assistant-1',
    conversationId: 'conversation-1'
  } as any

  function toolNames(middleware: { createMiddleware: SalesOntologyMiddleware['createMiddleware'] }) {
    const agentMiddleware = middleware.createMiddleware({}, context) as any
    return agentMiddleware.tools?.map((item) => item.name) ?? []
  }

  it('exposes a compact default core toolset', () => {
    const middleware = new SalesOntologyMiddleware({} as any)

    expect(middleware.meta.name).toBe(SALES_ONTOLOGY_MIDDLEWARE_NAME)
    expect(middleware.meta.features).toContain(SALES_ONTOLOGY_FEATURE)
    expect(toolNames(middleware)).toEqual([
      'sales_ontology_publish_business_snapshot',
      'sales_ontology_get_customer_context',
      'sales_ontology_run_perception',
      'sales_ontology_run_reasoning',
      'sales_ontology_generate_suggestions',
      'sales_ontology_propose_action',
      'sales_ontology_simulate_scenario',
      'sales_ontology_record_decision_effect'
    ])
  })

  it('exposes specialized context tools', () => {
    const middleware = new SalesOntologyContextMiddleware({} as any)

    expect(middleware.meta.name).toBe(SALES_ONTOLOGY_CONTEXT_MIDDLEWARE_NAME)
    expect(toolNames(middleware)).toEqual([
      'sales_ontology_publish_business_snapshot',
      'sales_ontology_get_domain_ontology',
      'sales_ontology_get_customer_context',
      'sales_ontology_get_compliance_risks',
      'sales_ontology_get_sales_target_status'
    ])
  })

  it('exposes specialized decision intelligence tools', () => {
    const middleware = new SalesOntologyDecisionMiddleware({} as any)

    expect(middleware.meta.name).toBe(SALES_ONTOLOGY_DECISION_MIDDLEWARE_NAME)
    expect(toolNames(middleware)).toEqual([
      'sales_ontology_run_perception',
      'sales_ontology_run_reasoning',
      'sales_ontology_generate_insights',
      'sales_ontology_generate_suggestions'
    ])
  })

  it('exposes specialized action governance tools', () => {
    const middleware = new SalesOntologyActionGovernanceMiddleware({} as any)

    expect(middleware.meta.name).toBe(SALES_ONTOLOGY_ACTION_GOVERNANCE_MIDDLEWARE_NAME)
    expect(toolNames(middleware)).toEqual([
      'sales_ontology_propose_action',
      'sales_ontology_execute_object_action',
      'sales_ontology_create_visit_record',
      'sales_ontology_update_doctor_sentiment',
      'sales_ontology_flag_compliance_risk',
      'sales_ontology_send_notification',
      'sales_ontology_create_reminder',
      'sales_ontology_record_action_result'
    ])
  })

  it('exposes specialized scenario and learning tools', () => {
    const middleware = new SalesOntologyScenarioLearningMiddleware({} as any)

    expect(middleware.meta.name).toBe(SALES_ONTOLOGY_SCENARIO_LEARNING_MIDDLEWARE_NAME)
    expect(toolNames(middleware)).toEqual([
      'sales_ontology_record_decision_effect',
      'sales_ontology_get_decision_effects',
      'sales_ontology_simulate_scenario',
      'sales_ontology_record_memory',
      'sales_ontology_get_learning_summary'
    ])
  })
})
