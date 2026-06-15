export type TranslationKey =
  | 'newDrawing'
  | 'save'
  | 'saveChanges'
  | 'saveNoChanges'
  | 'import'
  | 'exportJson'
  | 'exportPng'
  | 'exportSvg'
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
  | 'convert'
  | 'saveConverted'
  | 'title'
  | 'description'
  | 'drawingRequest'
  | 'changeSummary'
  | 'operationCompleted'
  | 'operationFailed'
  | 'requestTimeout'
  | 'remoteRequestFailed'
  | 'unknownError'
  | 'noDrawing'
  | 'dirty'
  | 'saved'
  | 'mermaidNotice'
  | 'untitled'
  | 'drawingCreated'
  | 'convertFailed'
  | 'agentDrawingUpdated'
  | 'mermaidAutoPreviewed'
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
    saveChanges: '保存当前改动',
    saveNoChanges: '没有改动，无需保存',
    import: '导入',
    exportJson: 'JSON',
    exportPng: 'PNG',
    exportSvg: 'SVG',
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
    convert: '转换',
    saveConverted: '保存转换',
    title: '标题',
    description: '描述',
    drawingRequest: '绘图需求',
    changeSummary: '变更摘要',
    operationCompleted: '操作已完成',
    operationFailed: '操作失败',
    requestTimeout: '请求超时',
    remoteRequestFailed: '远程请求失败',
    unknownError: '未知错误',
    noDrawing: '请选择或新建图形',
    dirty: '未保存',
    saved: '已保存',
    mermaidNotice: 'Flowchart 可结构化转换，其他 Mermaid 类型可能以图片进入画布。',
    untitled: '未命名图形',
    drawingCreated: '图形已创建',
    convertFailed: 'Mermaid 转换失败',
    agentDrawingUpdated: 'Agent 绘图结果已刷新',
    mermaidAutoPreviewed: 'Mermaid 草稿已自动转换为预览，确认后请保存转换',
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
    saveChanges: 'Save current changes',
    saveNoChanges: 'No changes to save',
    import: 'Import',
    exportJson: 'JSON',
    exportPng: 'PNG',
    exportSvg: 'SVG',
    askAssistant: 'Send',
    search: 'Search drawings',
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
    convert: 'Convert',
    saveConverted: 'Save converted',
    title: 'Title',
    description: 'Description',
    drawingRequest: 'Drawing request',
    changeSummary: 'Change summary',
    operationCompleted: 'Operation completed',
    operationFailed: 'Operation failed',
    requestTimeout: 'Request timed out',
    remoteRequestFailed: 'Remote request failed',
    unknownError: 'Unknown error',
    noDrawing: 'Select or create a drawing',
    dirty: 'Unsaved',
    saved: 'Saved',
    mermaidNotice: 'Flowcharts convert to editable elements best; other Mermaid types may enter as images.',
    untitled: 'Untitled drawing',
    drawingCreated: 'Drawing created',
    convertFailed: 'Mermaid conversion failed',
    agentDrawingUpdated: 'Agent drawing result refreshed',
    mermaidAutoPreviewed: 'Mermaid draft auto-converted for preview. Save the conversion after review.',
    drawings: 'Drawings',
    inspector: 'Inspector',
    collapseDrawings: 'Collapse drawings sidebar',
    expandDrawings: 'Expand drawings sidebar',
    collapseInspector: 'Collapse inspector',
    expandInspector: 'Expand inspector'
  }
}

export function createTranslator(locale?: unknown) {
  const dictionary = String(locale || '').toLowerCase().startsWith('en') ? translations.en_US : translations.zh_Hans
  return (key: TranslationKey) => dictionary[key] || translations.en_US[key] || key
}
