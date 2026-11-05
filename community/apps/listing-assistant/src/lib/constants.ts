export const LISTING_ASSISTANT_PLUGIN_NAME = '@xpert-ai/plugin-listing-assistant'

export const LISTING_ASSISTANT_PROVIDER_KEY = 'listing_assistant_workbench'
export const LISTING_ASSISTANT_FEATURE = 'listing_assistant'
export const LISTING_ASSISTANT_VIEW_KEY = 'workbench'
export const LISTING_ASSISTANT_REMOTE_ENTRY_KEY = 'listing_assistant__remote'
export const LISTING_ASSISTANT_MIDDLEWARE_NAME = 'ListingAssistantMiddleware'
export const LISTING_ASSISTANT_TEMPLATE_PROVIDER_KEY = 'listingAssistantTemplates'
export const LISTING_ASSISTANT_TEMPLATE_KEY = 'listing-assistant-assistant'
export const LISTING_ASSISTANT_TEMPLATE_FILE = 'xpert-listing-assistant-assistant.yaml'

export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'

export const LISTING_TASK_TABLE = 'plugin_listing_assistant_task'
export const LISTING_DRAFT_TABLE = 'plugin_listing_assistant_draft'
export const LISTING_SPEC_TABLE = 'plugin_listing_assistant_spec'
export const LISTING_AI_RUN_TABLE = 'plugin_listing_assistant_ai_run'

/**
 * Demo/test switch: a task whose source copy contains this marker fails the next
 * extraction with a simulated provider error. It exists so the failure + retry
 * path can be exercised without touching shared model credentials or network.
 */
export const LISTING_SIMULATED_FAILURE_MARKER = '[SIMULATE_MODEL_FAILURE]'

export const LISTING_ICON = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z" stroke="currentColor" stroke-width="1.6"/><path d="M8 5v14M12 9h4M12 13h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`
