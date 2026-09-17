const en = {
  externalSaved: 'Saved file changes have been loaded.',
  loading: 'Loading your workspace…', loadFailed: 'Workspace could not be loaded. No saved data was overwritten.', reload: 'Reload',
  saved: 'Saved', saving: 'Saving…', dirty: 'Not saved', saveError: 'Save failed. Your edits are retained; click to retry.',
  conflict: 'Saved data changed elsewhere. Keep your edits and reload before retrying.',
  error: 'Save failed. Your edits are retained; retry when the service is available.',
  buffersSaved: 'Editor buffers saved.', saveWorkspace: 'Save workspace', workspaceScope: 'Private workspace · signed in through Xpert'
}
export type MessageKey = keyof typeof en
const zh: Record<MessageKey, string> = {
  externalSaved: '已同步最新保存的文件内容。',
  loading: '正在加载你的工作台…', loadFailed: '工作台加载失败，未覆盖已保存的数据。', reload: '重新加载',
  saved: '已保存', saving: '正在保存…', dirty: '尚未保存', saveError: '保存失败，编辑内容已保留；点击重试。',
  conflict: '其他窗口已更新保存的数据，请保留当前编辑，重新加载后重试。',
  error: '保存失败，编辑内容仍保留；服务恢复后请重试。', buffersSaved: '编辑器文件已保存。', saveWorkspace: '保存工作台', workspaceScope: '私人工作台 · 通过 Xpert 登录'
}
export const catalogs = { 'en-US': en, 'zh-Hans': zh }
type Locale = keyof typeof catalogs
export const currentLocale = () => locale
let locale: Locale = 'en-US'
export function configureLocale(value: string) {
  const aliases: Record<string, Locale> = { en: 'en-US', en_US: 'en-US', 'en-US': 'en-US', zh_Hans: 'zh-Hans', 'zh-Hans': 'zh-Hans', 'zh-CN': 'zh-Hans', zh_CN: 'zh-Hans' }
  locale = aliases[value] ?? 'en-US'
  document.documentElement.lang = locale
}
export function t(key: MessageKey, values: { count?: number; contentId?: string; targetId?: string; position?: string; size?: number; axis?: string } = {}) {
  const plural = values.count != null && new Intl.PluralRules(locale).select(values.count) !== 'one' && `${key}_other` in en
    ? `${key}_other` as MessageKey : key
  return catalogs[locale][plural].replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = Object.entries(values).find(([key]) => key === name)?.[1]
    return typeof value === 'number' ? new Intl.NumberFormat(locale).format(value) : value ?? ''
  })
}
