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
  | 'openReview'
  | 'noDocument'
  | 'untitled'
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
  | 'expandVersions'
  | 'collapseVersions'
  | 'expandReview'
  | 'collapseReview'
  | 'confirmCurrentUploadTitle'
  | 'confirmCurrentUploadDescription'
  | 'confirmCurrentUploadDocument'
  | 'confirmCurrentUploadFile'
  | 'confirmCurrentUploadCancel'
  | 'confirmCurrentUploadCurrent'
  | 'confirmCurrentUploadNew'
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
  openReview: '打开审阅',
  noDocument: '未选择文档',
  untitled: '未命名文档',
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
  expandVersions: '展开版本列表',
  collapseVersions: '收起版本列表',
  expandReview: '展开审阅面板',
  collapseReview: '收起审阅面板',
  confirmCurrentUploadTitle: '上传 Word 文档',
  confirmCurrentUploadDescription: '当前已选中文档。可以将上传文件保存为当前文档的新版本，也可以新建一个文档。',
  confirmCurrentUploadDocument: '当前文档',
  confirmCurrentUploadFile: '待上传文件',
  confirmCurrentUploadCancel: '取消',
  confirmCurrentUploadCurrent: '更新当前文档',
  confirmCurrentUploadNew: '新建文档',
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
  openReview: 'Open review',
  noDocument: 'No document selected',
  untitled: 'Untitled document',
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
  expandVersions: 'Expand versions',
  collapseVersions: 'Collapse versions',
  expandReview: 'Expand review',
  collapseReview: 'Collapse review',
  confirmCurrentUploadTitle: 'Upload Word document',
  confirmCurrentUploadDescription: 'A document is already selected. Save the upload as a new version of the current document, or create a separate document.',
  confirmCurrentUploadDocument: 'Current document',
  confirmCurrentUploadFile: 'File to upload',
  confirmCurrentUploadCancel: 'Cancel',
  confirmCurrentUploadCurrent: 'Update current',
  confirmCurrentUploadNew: 'New document',
  assistantPlaceholder: 'Review this document and identify risky clauses',
  requestTimeout: 'Request timed out',
  remoteRequestFailed: 'Remote request failed',
  unknownError: 'Unknown error'
}

export function createTranslator(locale: unknown) {
  const dictionary = String(locale || '').toLowerCase().startsWith('en') ? en : zh
  return (key: TranslationKey) => dictionary[key] || key
}
