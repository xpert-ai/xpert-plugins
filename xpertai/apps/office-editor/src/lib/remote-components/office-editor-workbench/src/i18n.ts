export type TranslationKey =
  | 'title'
  | 'new'
  | 'import'
  | 'importFormat'
  | 'imported'
  | 'importedWithWarnings'
  | 'save'
  | 'sync'
  | 'ask'
  | 'delete'
  | 'documents'
  | 'operations'
  | 'snapshots'
  | 'spreadsheet'
  | 'document'
  | 'presentation'
  | 'xlsx'
  | 'docx'
  | 'pptx'
  | 'allTypes'
  | 'newDocumentType'
  | 'collapseSidebar'
  | 'expandSidebar'
  | 'noDocument'
  | 'untitled'
  | 'synced'
  | 'dirty'
  | 'queued'
  | 'applied'
  | 'failed'
  | 'openReview'
  | 'assistantPlaceholder'
  | 'requestTimeout'
  | 'remoteRequestFailed'
  | 'unknownError'
  | 'emptyHint'
  | 'collab'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'operationImportDocument'
  | 'operationReviewNote'
  | 'operationFailureReport'
  | 'operationSheetSetRangeValues'
  | 'operationDocAppendText'
  | 'operationDocReplaceText'
  | 'operationSlideCreateOutline'
  | 'operationSlideUpdateText'
  | 'operationFile'
  | 'operationFormat'
  | 'operationType'

const zh: Record<TranslationKey, string> = {
  title: 'Office 协作编辑器',
  new: '新建',
  import: '导入',
  importFormat: '导入格式',
  imported: '已导入',
  importedWithWarnings: '已导入，存在限制',
  save: '保存',
  sync: '同步',
  ask: '询问',
  delete: '删除',
  documents: '文档',
  operations: '操作',
  snapshots: '快照',
  spreadsheet: '电子表格',
  document: '文档',
  presentation: '演示稿',
  xlsx: 'XLSX',
  docx: 'DOCX',
  pptx: 'PPTX',
  allTypes: '全部类型',
  newDocumentType: '新建文档类型',
  collapseSidebar: '折叠侧边栏',
  expandSidebar: '展开侧边栏',
  noDocument: '未选择文档',
  untitled: '未命名',
  synced: '已同步',
  dirty: '未保存',
  queued: '排队',
  applied: '已应用',
  failed: '失败',
  openReview: '打开审阅',
  assistantPlaceholder: '请审阅当前 Office 文档，并排队需要我确认的修改',
  requestTimeout: '请求超时',
  remoteRequestFailed: '远程请求失败',
  unknownError: '未知错误',
  emptyHint: '新建或选择一个 Office 文档开始协作',
  collab: '协作',
  connecting: '连接中',
  connected: '已连接',
  disconnected: '未连接',
  operationImportDocument: '导入文档',
  operationReviewNote: '审阅备注',
  operationFailureReport: '失败报告',
  operationSheetSetRangeValues: '更新表格区域',
  operationDocAppendText: '追加文档文本',
  operationDocReplaceText: '替换文档文本',
  operationSlideCreateOutline: '生成演示大纲',
  operationSlideUpdateText: '更新幻灯片文本',
  operationFile: '文件',
  operationFormat: '格式',
  operationType: '类型'
}

const en: Record<TranslationKey, string> = {
  title: 'Office Editor',
  new: 'New',
  import: 'Import',
  importFormat: 'Import format',
  imported: 'Imported',
  importedWithWarnings: 'Imported with limitations',
  save: 'Save',
  sync: 'Sync',
  ask: 'Ask',
  delete: 'Delete',
  documents: 'Documents',
  operations: 'Operations',
  snapshots: 'Snapshots',
  spreadsheet: 'Spreadsheet',
  document: 'Document',
  presentation: 'Presentation',
  xlsx: 'XLSX',
  docx: 'DOCX',
  pptx: 'PPTX',
  allTypes: 'All types',
  newDocumentType: 'New document type',
  collapseSidebar: 'Collapse sidebar',
  expandSidebar: 'Expand sidebar',
  noDocument: 'No document selected',
  untitled: 'Untitled',
  synced: 'Synced',
  dirty: 'Unsaved',
  queued: 'Queued',
  applied: 'Applied',
  failed: 'Failed',
  openReview: 'Open review',
  assistantPlaceholder: 'Review this Office document and queue edits for my confirmation',
  requestTimeout: 'Request timed out',
  remoteRequestFailed: 'Remote request failed',
  unknownError: 'Unknown error',
  emptyHint: 'Create or select an Office document to start collaborating',
  collab: 'Collab',
  connecting: 'Connecting',
  connected: 'Connected',
  disconnected: 'Disconnected',
  operationImportDocument: 'Import document',
  operationReviewNote: 'Review note',
  operationFailureReport: 'Failure report',
  operationSheetSetRangeValues: 'Update sheet range',
  operationDocAppendText: 'Append document text',
  operationDocReplaceText: 'Replace document text',
  operationSlideCreateOutline: 'Create slide outline',
  operationSlideUpdateText: 'Update slide text',
  operationFile: 'File',
  operationFormat: 'Format',
  operationType: 'Type'
}

export function createTranslator(locale: unknown) {
  const dictionary = String(locale || '').toLowerCase().startsWith('en') ? en : zh
  return (key: TranslationKey) => dictionary[key] || key
}
