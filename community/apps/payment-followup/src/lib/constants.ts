export const NAMESPACE = 'payment_followup'
export const PLUGIN_NAME = '@community/apps-payment-followup'
export const PROVIDER = `${NAMESPACE}.view`
// The platform composes the public key as provider + '__' + this local key.
export const VIEW = 'workbench'
export const ENTRY = `${NAMESPACE}.workbench`
export const FEATURE = `${NAMESPACE}.review`
export const MIDDLEWARE = `${NAMESPACE}.middleware`
export const TEMPLATE = 'payment-followup-assistant'
export const TOOLS = ['payment_followup_read', 'payment_followup_submit', 'payment_followup_fail'] as const
export const ICON = { type: 'emoji', value: '📅' } as const
export const text = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })
