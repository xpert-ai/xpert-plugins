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
  | 'delete'
  | 'deleteDrawing'
  | 'deleteVersion'
  | 'deleteDrawingTitle'
  | 'deleteDrawingDescription'
  | 'deleteVersionTitle'
  | 'deleteVersionDescription'
  | 'cancel'
  | 'confirmDelete'
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
  | 'agentDrawingUpdatedWithLocalChanges'
  | 'sceneDataInvalid'
  | 'mermaidAutoPreviewed'
  | 'mermaidAutoSaved'
  | 'mermaidAutoChangeSummary'
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
    delete: '删除',
    deleteDrawing: '删除图形',
    deleteVersion: '删除版本',
    deleteDrawingTitle: '确认删除图形',
    deleteDrawingDescription: '此操作会物理删除该图形、全部版本和日志记录，无法撤销。',
    deleteVersionTitle: '确认删除版本',
    deleteVersionDescription: '此操作会物理删除该版本记录及关联日志，无法撤销。',
    cancel: '取消',
    confirmDelete: '确认删除',
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
    agentDrawingUpdatedWithLocalChanges: 'Agent 已更新图形，但当前画布有未保存改动，未自动覆盖。',
    sceneDataInvalid: '图形数据异常，已降级为空白画布以避免页面崩溃',
    mermaidAutoPreviewed: 'Mermaid 草稿已自动转换为预览',
    mermaidAutoSaved: 'Mermaid 转换结果已自动保存',
    mermaidAutoChangeSummary: '自动保存 Mermaid 转换结果',
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
    delete: 'Delete',
    deleteDrawing: 'Delete drawing',
    deleteVersion: 'Delete version',
    deleteDrawingTitle: 'Delete drawing?',
    deleteDrawingDescription: 'This will permanently delete this drawing, all versions, and activity logs. This cannot be undone.',
    deleteVersionTitle: 'Delete version?',
    deleteVersionDescription: 'This will permanently delete this version record and related activity logs. This cannot be undone.',
    cancel: 'Cancel',
    confirmDelete: 'Delete',
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
    agentDrawingUpdatedWithLocalChanges: 'Agent updated this drawing, but unsaved canvas changes were kept.',
    sceneDataInvalid: 'Invalid scene data was replaced with a blank canvas to keep the page running.',
    mermaidAutoPreviewed: 'Mermaid draft auto-converted for preview.',
    mermaidAutoSaved: 'Mermaid conversion auto-saved',
    mermaidAutoChangeSummary: 'Auto-saved Mermaid conversion',
    drawings: 'Drawings',
    inspector: 'Inspector',
    collapseDrawings: 'Collapse drawings sidebar',
    expandDrawings: 'Expand drawings sidebar',
    collapseInspector: 'Collapse inspector',
    expandInspector: 'Expand inspector'
  }
}

export function createTranslator(locale?: unknown) {
  const normalizedLocale = String(locale || '').toLowerCase()
  const dictionary = normalizedLocale.startsWith('zh') ? translations.zh_Hans : translations.en_US
  return (key: TranslationKey) => dictionary[key] || translations.en_US[key] || key
}
