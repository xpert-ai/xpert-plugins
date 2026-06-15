export type TranslationKey =
  | 'newDocument'
  | 'save'
  | 'import'
  | 'exportJson'
  | 'openLucid'
  | 'askAssistant'
  | 'search'
  | 'allStatuses'
  | 'draft'
  | 'reviewed'
  | 'archived'
  | 'versions'
  | 'restore'
  | 'archive'
  | 'markReviewed'
  | 'backToDraft'
  | 'mermaid'
  | 'saveMermaid'
  | 'title'
  | 'description'
  | 'drawingRequest'
  | 'changeSummary'
  | 'standardImport'
  | 'externalDocument'
  | 'lucidDocumentUrl'
  | 'lucidDocumentId'
  | 'embedUrl'
  | 'previewUrl'
  | 'registerExternal'
  | 'operationCompleted'
  | 'requestTimeout'
  | 'remoteRequestFailed'
  | 'unknownError'
  | 'noDocument'
  | 'dirty'
  | 'saved'
  | 'untitled'
  | 'documentCreated'
  | 'agentDocumentUpdated'
  | 'documents'
  | 'inspector'
  | 'collapseDocuments'
  | 'expandDocuments'
  | 'collapseInspector'
  | 'expandInspector'
  | 'invalidJson'
  | 'standardImportNotice'
  | 'embedNotice'
  | 'embedPreview'
  | 'imagePreview'
  | 'standardImportPreview'
  | 'previewUnavailable'

const translations: Record<string, Record<TranslationKey, string>> = {
  zh_Hans: {
    newDocument: '新建',
    save: '保存',
    import: '导入',
    exportJson: 'JSON',
    openLucid: '打开',
    askAssistant: '发送',
    search: '搜索文档',
    allStatuses: '全部状态',
    draft: '草稿',
    reviewed: '已审核',
    archived: '已归档',
    versions: '版本',
    restore: '恢复',
    archive: '归档',
    markReviewed: '标记已审核',
    backToDraft: '退回草稿',
    mermaid: 'Mermaid',
    saveMermaid: '保存草稿',
    title: '标题',
    description: '描述',
    drawingRequest: '绘图需求',
    changeSummary: '变更摘要',
    standardImport: 'Standard Import',
    externalDocument: 'Lucid 文档',
    lucidDocumentUrl: 'Lucid 文档 URL',
    lucidDocumentId: 'Lucid 文档 ID',
    embedUrl: 'Embed URL',
    previewUrl: '预览 URL',
    registerExternal: '登记链接',
    operationCompleted: '操作已完成',
    requestTimeout: '请求超时',
    remoteRequestFailed: '远程请求失败',
    unknownError: '未知错误',
    noDocument: '请选择或新建 Lucidchart 文档',
    dirty: '未保存',
    saved: '已保存',
    untitled: '未命名 Lucidchart 文档',
    documentCreated: 'Lucidchart 文档已创建',
    agentDocumentUpdated: 'Agent Lucidchart 结果已刷新',
    documents: '文档',
    inspector: '详情',
    collapseDocuments: '收起文档侧栏',
    expandDocuments: '展开文档侧栏',
    collapseInspector: '收起详情侧栏',
    expandInspector: '展开详情侧栏',
    invalidJson: 'Standard Import JSON 无效',
    standardImportNotice: '保存的是 Lucid Standard Import 的 document.json 内容；.lucid ZIP 可由外部 Lucid REST 导入流程生成。',
    embedNotice: 'Lucid Embed 是否可显示取决于 Lucid 文档权限、Cookie 或 token-based embed 配置。',
    embedPreview: 'Lucid Embed',
    imagePreview: '预览图',
    standardImportPreview: '结构预览',
    previewUnavailable: '当前 Standard Import 暂无可预览图形，请检查 pages/shapes/lines 数据。'
  },
  en_US: {
    newDocument: 'New',
    save: 'Save',
    import: 'Import',
    exportJson: 'JSON',
    openLucid: 'Open',
    askAssistant: 'Send',
    search: 'Search documents',
    allStatuses: 'All statuses',
    draft: 'Draft',
    reviewed: 'Reviewed',
    archived: 'Archived',
    versions: 'Versions',
    restore: 'Restore',
    archive: 'Archive',
    markReviewed: 'Mark reviewed',
    backToDraft: 'Back to draft',
    mermaid: 'Mermaid',
    saveMermaid: 'Save draft',
    title: 'Title',
    description: 'Description',
    drawingRequest: 'Drawing request',
    changeSummary: 'Change summary',
    standardImport: 'Standard Import',
    externalDocument: 'Lucid document',
    lucidDocumentUrl: 'Lucid document URL',
    lucidDocumentId: 'Lucid document ID',
    embedUrl: 'Embed URL',
    previewUrl: 'Preview URL',
    registerExternal: 'Register link',
    operationCompleted: 'Operation completed',
    requestTimeout: 'Request timed out',
    remoteRequestFailed: 'Remote request failed',
    unknownError: 'Unknown error',
    noDocument: 'Select or create a Lucidchart document',
    dirty: 'Unsaved',
    saved: 'Saved',
    untitled: 'Untitled Lucidchart document',
    documentCreated: 'Lucidchart document created',
    agentDocumentUpdated: 'Agent Lucidchart result refreshed',
    documents: 'Documents',
    inspector: 'Inspector',
    collapseDocuments: 'Collapse documents sidebar',
    expandDocuments: 'Expand documents sidebar',
    collapseInspector: 'Collapse inspector',
    expandInspector: 'Expand inspector',
    invalidJson: 'Invalid Standard Import JSON',
    standardImportNotice: 'This stores Lucid Standard Import document.json content. A .lucid ZIP can be produced by an external Lucid REST import flow.',
    embedNotice: 'Lucid Embed rendering depends on document permissions, cookies, or token-based embed configuration.',
    embedPreview: 'Lucid Embed',
    imagePreview: 'Preview image',
    standardImportPreview: 'Structure preview',
    previewUnavailable: 'No previewable shapes were found in the current Standard Import. Check pages/shapes/lines data.'
  }
}

export function createTranslator(locale?: unknown) {
  const dictionary = String(locale || '').toLowerCase().startsWith('en') ? translations.en_US : translations.zh_Hans
  return (key: TranslationKey) => dictionary[key] || translations.en_US[key] || key
}
