export type TranslationKey =
  | 'title'
  | 'new'
  | 'upload'
  | 'save'
  | 'sync'
  | 'ask'
  | 'delete'
  | 'restore'
  | 'documents'
  | 'versions'
  | 'review'
  | 'noDocument'
  | 'uploadHint'
  | 'saving'
  | 'synced'
  | 'dirty'
  | 'current'
  | 'comments'
  | 'changes'
  | 'operations'
  | 'mode'
  | 'editing'
  | 'suggesting'
  | 'viewing'
  | 'expandDocuments'
  | 'collapseDocuments'
  | 'expandReview'
  | 'collapseReview'
  | 'assistantPlaceholder'
  | 'requestTimeout'
  | 'remoteRequestFailed'
  | 'unknownError'

const zh: Record<TranslationKey, string> = {
  title: 'DOCX 文档编辑器',
  new: '新建',
  upload: '上传',
  save: '保存',
  sync: '同步',
  ask: '询问',
  delete: '删除',
  restore: '恢复',
  documents: '文档',
  versions: '版本',
  review: '审阅',
  noDocument: '未选择文档',
  uploadHint: '上传 .docx 后开始编辑',
  saving: '保存中',
  synced: '已同步',
  dirty: '未保存',
  current: '当前',
  comments: '批注',
  changes: '修订',
  operations: '操作',
  mode: '编辑模式',
  editing: '编辑',
  suggesting: '建议',
  viewing: '查看',
  expandDocuments: '展开文档列表',
  collapseDocuments: '收起文档列表',
  expandReview: '展开审阅面板',
  collapseReview: '收起审阅面板',
  assistantPlaceholder: '请审阅当前文档，并指出风险条款',
  requestTimeout: '请求超时',
  remoteRequestFailed: '远程请求失败',
  unknownError: '未知错误'
}

const en: Record<TranslationKey, string> = {
  title: 'DOCX Editor',
  new: 'New',
  upload: 'Upload',
  save: 'Save',
  sync: 'Sync',
  ask: 'Ask',
  delete: 'Delete',
  restore: 'Restore',
  documents: 'Documents',
  versions: 'Versions',
  review: 'Review',
  noDocument: 'No document selected',
  uploadHint: 'Upload a .docx file to start editing',
  saving: 'Saving',
  synced: 'Synced',
  dirty: 'Unsaved',
  current: 'Current',
  comments: 'Comments',
  changes: 'Changes',
  operations: 'Operations',
  mode: 'Editing mode',
  editing: 'Editing',
  suggesting: 'Suggesting',
  viewing: 'Viewing',
  expandDocuments: 'Expand documents',
  collapseDocuments: 'Collapse documents',
  expandReview: 'Expand review',
  collapseReview: 'Collapse review',
  assistantPlaceholder: 'Review this document and identify risky clauses',
  requestTimeout: 'Request timed out',
  remoteRequestFailed: 'Remote request failed',
  unknownError: 'Unknown error'
}

export function createTranslator(locale: unknown) {
  const dictionary = String(locale || '').toLowerCase().startsWith('en') ? en : zh
  return (key: TranslationKey) => dictionary[key] || key
}
