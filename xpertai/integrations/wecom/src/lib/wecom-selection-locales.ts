const messages = {
  en: {
    tenant: 'Tenant shared integration',
    organization: 'Organization integration',
    occupied: 'Already bound to an Assistant'
  },
  zh: { tenant: '租户授权集成', organization: '本组织集成', occupied: '已绑定 Assistant' }
}
export function weComSelectionLabels(language: string) {
  return language.toLowerCase().startsWith('zh') ? messages.zh : messages.en
}
