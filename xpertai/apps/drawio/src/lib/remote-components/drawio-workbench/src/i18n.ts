export type TranslationKey =
  | 'newDrawing'
  | 'save'
  | 'syncEditor'
  | 'import'
  | 'exportXml'
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
  | 'loadMermaid'
  | 'saveConverted'
  | 'title'
  | 'description'
  | 'drawingRequest'
  | 'changeSummary'
  | 'operationCompleted'
  | 'requestTimeout'
  | 'remoteRequestFailed'
  | 'unknownError'
  | 'noDrawing'
  | 'dirty'
  | 'saved'
  | 'editorReady'
  | 'editorLoading'
  | 'mermaidNotice'
  | 'untitled'
  | 'drawingCreated'
  | 'agentDrawingUpdated'
  | 'drawings'
  | 'inspector'
  | 'collapseDrawings'
  | 'expandDrawings'
  | 'collapseInspector'
  | 'expandInspector'

const translations: Record<string, Record<TranslationKey, string>> = {
  zh_Hans: {
    newDrawing: '新建',
    save: '保存',
    syncEditor: '读取编辑器',
    import: '导入',
    exportXml: 'XML',
    askAssistant: '发送',
    search: '搜索图形',
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
    loadMermaid: '载入编辑器',
    saveConverted: '保存转换',
    title: '标题',
    description: '描述',
    drawingRequest: '绘图需求',
    changeSummary: '变更摘要',
    operationCompleted: '操作已完成',
    requestTimeout: '请求超时',
    remoteRequestFailed: '远程请求失败',
    unknownError: '未知错误',
    noDrawing: '请选择或新建图形',
    dirty: '未保存',
    saved: '已保存',
    editorReady: '编辑器已连接',
    editorLoading: '正在加载 draw.io 编辑器',
    mermaidNotice: 'Mermaid 会通过 diagrams.net descriptor 导入；请在编辑器中检查后保存。',
    untitled: '未命名图形',
    drawingCreated: '图形已创建',
    agentDrawingUpdated: 'Agent 绘图结果已刷新',
    drawings: '图形',
    inspector: '详情',
    collapseDrawings: '收起图形侧栏',
    expandDrawings: '展开图形侧栏',
    collapseInspector: '收起详情侧栏',
    expandInspector: '展开详情侧栏'
  },
  en_US: {
    newDrawing: 'New',
    save: 'Save',
    syncEditor: 'Read editor',
    import: 'Import',
    exportXml: 'XML',
    askAssistant: 'Send',
    search: 'Search diagrams',
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
    loadMermaid: 'Load in editor',
    saveConverted: 'Save converted',
    title: 'Title',
    description: 'Description',
    drawingRequest: 'Drawing request',
    changeSummary: 'Change summary',
    operationCompleted: 'Operation completed',
    requestTimeout: 'Request timed out',
    remoteRequestFailed: 'Remote request failed',
    unknownError: 'Unknown error',
    noDrawing: 'Select or create a diagram',
    dirty: 'Unsaved',
    saved: 'Saved',
    editorReady: 'Editor connected',
    editorLoading: 'Loading draw.io editor',
    mermaidNotice: 'Mermaid is imported through a diagrams.net descriptor. Review it in the editor before saving.',
    untitled: 'Untitled diagram',
    drawingCreated: 'Diagram created',
    agentDrawingUpdated: 'Agent diagram result refreshed',
    drawings: 'Diagrams',
    inspector: 'Inspector',
    collapseDrawings: 'Collapse diagrams sidebar',
    expandDrawings: 'Expand diagrams sidebar',
    collapseInspector: 'Collapse inspector',
    expandInspector: 'Expand inspector'
  }
}

export function createTranslator(locale?: unknown) {
  const dictionary = String(locale || '').toLowerCase().startsWith('en') ? translations.en_US : translations.zh_Hans
  return (key: TranslationKey) => dictionary[key] || translations.en_US[key] || key
}
