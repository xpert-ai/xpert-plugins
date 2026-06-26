export type TranslationKey =
  | 'newCanvas'
  | 'save'
  | 'newVersion'
  | 'import'
  | 'reviewed'
  | 'draft'
  | 'archive'
  | 'delete'
  | 'documents'
  | 'versions'
  | 'logs'
  | 'details'
  | 'ask'
  | 'askAssistant'
  | 'askPlaceholder'
  | 'snapshot'
  | 'noSnapshot'
  | 'restore'
  | 'search'
  | 'untitled'
  | 'aiHolder'
  | 'annotation'
  | 'aspect'
  | 'requestTimeout'
  | 'remoteRequestFailed'
  | 'unknownError'
  | 'saved'
  | 'created'
  | 'imported'
  | 'selectCanvas'
  | 'current'
  | 'saving'
  | 'dirty'
  | 'synced'

const dictionary: Record<string, Record<TranslationKey, string>> = {
  en: {
    newCanvas: 'New',
    save: 'Save',
    newVersion: 'Version',
    import: 'Import',
    reviewed: 'Reviewed',
    draft: 'Draft',
    archive: 'Archive',
    delete: 'Delete',
    documents: 'Canvases',
    versions: 'Versions',
    logs: 'Logs',
    details: 'Details',
    ask: 'Ask',
    askAssistant: 'Ask Assistant',
    askPlaceholder: 'Ask about the current canvas',
    snapshot: 'Snapshot',
    noSnapshot: 'No snapshot image yet',
    restore: 'Restore',
    search: 'Search',
    untitled: 'Untitled Canvas',
    aiHolder: 'AI image',
    annotation: 'Annotation',
    aspect: 'Aspect',
    requestTimeout: 'Request timed out',
    remoteRequestFailed: 'Remote request failed',
    unknownError: 'Unknown error',
    saved: 'Saved',
    created: 'Created',
    imported: 'Imported',
    selectCanvas: 'Select or create a canvas',
    current: 'Current',
    saving: 'Saving',
    dirty: 'Dirty',
    synced: 'Synced'
  },
  zh: {
    newCanvas: '新建',
    save: '保存',
    newVersion: '版本',
    import: '导入',
    reviewed: '已审核',
    draft: '草稿',
    archive: '归档',
    delete: '删除',
    documents: '画布',
    versions: '版本',
    logs: '日志',
    details: '详情',
    ask: '询问',
    askAssistant: '询问 Assistant',
    askPlaceholder: '询问当前画布',
    snapshot: '快照',
    noSnapshot: '暂无快照图片',
    restore: '恢复',
    search: '搜索',
    untitled: '未命名画布',
    aiHolder: 'AI 图片',
    annotation: '标注',
    aspect: '比例',
    requestTimeout: '请求超时',
    remoteRequestFailed: '远程请求失败',
    unknownError: '未知错误',
    saved: '已保存',
    created: '已创建',
    imported: '已导入',
    selectCanvas: '选择或新建画布',
    current: '当前',
    saving: '保存中',
    dirty: '有改动',
    synced: '已同步'
  }
}

export function createTranslator(locale: string | null | undefined) {
  const lang = String(locale || '').toLowerCase().startsWith('zh') ? 'zh' : 'en'
  return (key: TranslationKey) => dictionary[lang][key] ?? dictionary.en[key] ?? key
}
