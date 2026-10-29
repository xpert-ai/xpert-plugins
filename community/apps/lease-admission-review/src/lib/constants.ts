export const NAMESPACE = 'lease_admission_review'
export const key = (name: string) => `${NAMESPACE}.${name}`
export const PLUGIN_NAME = '@xpert-ai/plugin-lease-admission-review'
export const MIDDLEWARE = key('extraction')
export const PROVIDER = key('views')
export const FEATURE = key('review')
export const VIEW = key('workbench')
export const TOOLS = {
  read: `${NAMESPACE}_read`,
  save: `${NAMESPACE}_save`,
  fail: `${NAMESPACE}_fail`
} as const
export const ICON = {
  type: 'svg',
  value:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect x="24" y="24" width="208" height="208" rx="40" fill="#dbeafe"/><path d="M76 60h76l28 28v108H76z" fill="#fff" stroke="#1e40af" stroke-width="12" stroke-linejoin="round"/><path d="m99 135 20 20 40-45M99 177h55" fill="none" stroke="#0f766e" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/></svg>'
} as const
