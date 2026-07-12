export type TranslationKey =
  | 'newDrawing'
  | 'newDrawingMenu'
  | 'newVersion'
  | 'save'
  | 'saveChanges'
  | 'saveNoChanges'
  | 'recoverDraft'
  | 'recoverPreviousDraft'
  | 'noRecoveryDraft'
  | 'draftRecovered'
  | 'import'
  | 'exportJson'
  | 'exportPng'
  | 'exportSvg'
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
  | 'confirmAction'
  | 'confirmDelete'
  | 'markReviewed'
  | 'backToDraft'
  | 'mermaid'
  | 'convert'
  | 'saveConverted'
  | 'title'
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
  | 'drawingNotReady'
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
  | 'diagramTemplates'
  | 'searchTemplates'
  | 'templateCategory'
  | 'templateTag'
  | 'allCategories'
  | 'allTags'
  | 'templateTitle'
  | 'createFromTemplate'
  | 'applyToCurrent'
  | 'templateReplaceNotice'
  | 'templateDirtyBlocked'
  | 'confirmTemplateReplace'
  | 'confirmTemplateReplaceTitle'
  | 'templateCreated'
  | 'diagramQuality'
  | 'irRevision'
  | 'syncState'
  | 'synced'
  | 'diverged'
  | 'pendingRender'
  | 'validationIssues'
  | 'visualReviews'
  | 'rerenderFromIr'
  | 'rerenderDirtyBlocked'
  | 'confirmIrReplace'
  | 'confirmIrReplaceTitle'
  | 'diagramRendered'
  | 'collaborators'
  | 'collaborationConnected'
  | 'collaborationConnecting'
  | 'collaborationDisconnected'
  | 'collaborationUnavailable'
  | 'share'
  | 'sharePublicLink'
  | 'shareOrganization'
  | 'shareWorkspace'
  | 'copyShareLink'
  | 'revokeShare'
  | 'confirmPublicShare'
  | 'confirmPublicShareTitle'
  | 'confirmRevokeShare'
  | 'confirmRevokeShareTitle'
  | 'shareLinkCopied'
  | 'artifactShared'
  | 'shareRevoked'
  | 'shareDrawing'
  | 'shareDescription'
  | 'alwaysShareLatest'
  | 'alwaysShareLatestDescription'
  | 'sharingLatestScene'
  | 'sharingCurrentVersion'
  | 'shareAccess'
  | 'createShareLink'
  | 'updateShareLink'
  | 'shareLinkReady'
  | 'shareLinkNotCreated'
  | 'shareLinkMissing'
  | 'shareSyncRequired'
  | 'shareSyncTimeout'
  | 'shareManualCopy'
  | 'exportDrawing'
  | 'exportDrawingDescription'

const translations: Record<string, Record<TranslationKey, string>> = {
  zh_Hans: {
    newDrawing: '新建',
    newDrawingMenu: '新建图形',
    newVersion: '新建版本',
    save: '保存',
    saveChanges: '保存当前改动',
    saveNoChanges: '没有改动，无需保存',
    recoverDraft: '恢复草稿',
    recoverPreviousDraft: '恢复自动保存覆盖前的草稿',
    noRecoveryDraft: '没有可恢复的草稿快照',
    draftRecovered: '已恢复上一个草稿快照，请检查后保存',
    import: '导入',
    exportJson: 'JSON',
    exportPng: 'PNG',
    exportSvg: 'SVG',
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
    confirmAction: '确认',
    confirmDelete: '确认删除',
    markReviewed: '标记已审核',
    backToDraft: '退回草稿',
    mermaid: 'Mermaid',
    convert: '转换',
    saveConverted: '保存转换',
    title: '标题',
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
    drawingNotReady: '图形数据暂未就绪，请稍后刷新重试',
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
    expandInspector: '展开详情侧栏',
    diagramTemplates: '技术图模板',
    searchTemplates: '搜索模板',
    templateCategory: '模板分类',
    templateTag: '模板标签',
    allCategories: '全部分类',
    allTags: '全部标签',
    templateTitle: '图表标题',
    createFromTemplate: '从模板新建',
    applyToCurrent: '替换当前图',
    templateReplaceNotice: '应用到当前图会创建新版本并整体替换，不进行合并。',
    templateDirtyBlocked: '当前画布有未保存改动，请先保存或放弃改动。',
    confirmTemplateReplace: '确认使用模板整体替换当前图，并创建一个新版本？',
    confirmTemplateReplaceTitle: '替换当前图形？',
    templateCreated: '已从模板创建图表',
    diagramQuality: 'DiagramIR 质量状态',
    irRevision: 'IR 版本',
    syncState: '同步状态',
    synced: '已同步',
    diverged: '已分叉',
    pendingRender: '待渲染',
    validationIssues: '校验问题',
    visualReviews: '视觉审核',
    rerenderFromIr: '从 IR 重新渲染',
    rerenderDirtyBlocked: '当前画布有未保存改动，不能从 IR 重新渲染。',
    confirmIrReplace: '当前 Excalidraw 场景已与 DiagramIR 分叉。确认用 IR 创建新版本并替换？',
    confirmIrReplaceTitle: '从 DiagramIR 替换当前图形？',
    diagramRendered: 'DiagramIR 已重新渲染',
    collaborators: '协作者',
    collaborationConnected: '实时协作已连接',
    collaborationConnecting: '正在连接实时协作',
    collaborationDisconnected: '实时协作未连接',
    collaborationUnavailable: '实时协作暂不可用',
    share: '分享',
    sharePublicLink: '创建公开链接',
    shareOrganization: '组织成员可访问',
    shareWorkspace: '工作区成员可访问',
    copyShareLink: '复制分享链接',
    revokeShare: '撤销分享',
    confirmPublicShare: '公开链接无需登录即可访问。确认将当前图形发布为只读 Excalidraw 页面？',
    confirmPublicShareTitle: '创建公开链接？',
    confirmRevokeShare: '确认撤销当前 Artifact 分享链接？已有链接将立即失效。',
    confirmRevokeShareTitle: '撤销分享链接？',
    shareLinkCopied: 'Artifact 分享链接已复制',
    artifactShared: 'Artifact 已发布',
    shareRevoked: 'Artifact 分享已撤销',
    shareDrawing: '分享图形',
    shareDescription: '发布可交互查看的只读 Excalidraw 页面，或导出当前图形。',
    alwaysShareLatest: '始终分享最新已发布版本',
    alwaysShareLatestDescription: '仅在你点击创建或更新链接时发布新内容',
    sharingLatestScene: '链接指向最新已发布工作场景',
    sharingCurrentVersion: '固定分享当前版本',
    shareAccess: '访问范围',
    createShareLink: '创建链接',
    updateShareLink: '更新链接',
    shareLinkReady: '分享链接已就绪',
    shareLinkNotCreated: '尚未创建分享链接',
    shareLinkMissing: '平台未返回可复制的 Artifact 分享链接。',
    shareSyncRequired: '当前画布有未同步改动，请恢复实时协作连接后再分享。',
    shareSyncTimeout: '画布同步超时，为避免发布旧内容，本次分享已取消。',
    shareManualCopy: '浏览器未允许自动复制，已选中链接，请手动复制。',
    exportDrawing: '导出图形',
    exportDrawingDescription: '下载可编辑文件或图片副本'
  },
  en_US: {
    newDrawing: 'New',
    newDrawingMenu: 'New drawing',
    newVersion: 'New version',
    save: 'Save',
    saveChanges: 'Save current changes',
    saveNoChanges: 'No changes to save',
    recoverDraft: 'Recover draft',
    recoverPreviousDraft: 'Recover the draft from before the latest autosave overwrite',
    noRecoveryDraft: 'No recoverable draft snapshot is available.',
    draftRecovered: 'Previous draft recovered. Review it, then save.',
    import: 'Import',
    exportJson: 'JSON',
    exportPng: 'PNG',
    exportSvg: 'SVG',
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
    confirmAction: 'Confirm',
    confirmDelete: 'Delete',
    markReviewed: 'Mark reviewed',
    backToDraft: 'Back to draft',
    mermaid: 'Mermaid',
    convert: 'Convert',
    saveConverted: 'Save converted',
    title: 'Title',
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
    drawingNotReady: 'Drawing data is not ready yet. Please refresh and try again shortly.',
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
    expandInspector: 'Expand inspector',
    diagramTemplates: 'Technical diagram templates',
    searchTemplates: 'Search templates',
    templateCategory: 'Template category',
    templateTag: 'Template tag',
    allCategories: 'All categories',
    allTags: 'All tags',
    templateTitle: 'Diagram title',
    createFromTemplate: 'Create from template',
    applyToCurrent: 'Replace current',
    templateReplaceNotice: 'Applying to the current drawing creates a new version and replaces the whole scene; merging is not supported.',
    templateDirtyBlocked: 'Save or discard the unsaved canvas changes before applying a template.',
    confirmTemplateReplace: 'Replace the current drawing from this template and create a new version?',
    confirmTemplateReplaceTitle: 'Replace the current drawing?',
    templateCreated: 'Diagram created from template',
    diagramQuality: 'DiagramIR quality',
    irRevision: 'IR revision',
    syncState: 'Sync state',
    synced: 'Synced',
    diverged: 'Diverged',
    pendingRender: 'Pending render',
    validationIssues: 'Validation issues',
    visualReviews: 'Visual reviews',
    rerenderFromIr: 'Re-render from IR',
    rerenderDirtyBlocked: 'The canvas has unsaved changes and cannot be re-rendered from IR.',
    confirmIrReplace: 'The Excalidraw scene diverged from DiagramIR. Create a new version and replace it from IR?',
    confirmIrReplaceTitle: 'Replace from DiagramIR?',
    diagramRendered: 'DiagramIR rendered',
    collaborators: 'Collaborators',
    collaborationConnected: 'Live collaboration connected',
    collaborationConnecting: 'Connecting live collaboration',
    collaborationDisconnected: 'Live collaboration disconnected',
    collaborationUnavailable: 'Live collaboration is unavailable',
    share: 'Share',
    sharePublicLink: 'Create public link',
    shareOrganization: 'Organization access',
    shareWorkspace: 'Workspace access',
    copyShareLink: 'Copy share link',
    revokeShare: 'Revoke share',
    confirmPublicShare: 'Anyone with a public link can view it without signing in. Publish the current drawing as a read-only Excalidraw page?',
    confirmPublicShareTitle: 'Create a public link?',
    confirmRevokeShare: 'Revoke the current Artifact share? Existing links will stop working immediately.',
    confirmRevokeShareTitle: 'Revoke share link?',
    shareLinkCopied: 'Artifact share link copied',
    artifactShared: 'Artifact published',
    shareRevoked: 'Artifact share revoked',
    shareDrawing: 'Share drawing',
    shareDescription: 'Publish an interactive read-only Excalidraw page or export the current drawing.',
    alwaysShareLatest: 'Always share latest published version',
    alwaysShareLatestDescription: 'New content is published only when you create or update the link',
    sharingLatestScene: 'Link follows the latest published working scene',
    sharingCurrentVersion: 'Sharing this fixed version',
    shareAccess: 'Access scope',
    createShareLink: 'Create link',
    updateShareLink: 'Update link',
    shareLinkReady: 'Share link is ready',
    shareLinkNotCreated: 'No share link created yet',
    shareLinkMissing: 'The platform did not return a copyable Artifact share link.',
    shareSyncRequired: 'This drawing has unsynchronized changes. Reconnect live collaboration before sharing.',
    shareSyncTimeout: 'Drawing synchronization timed out, so sharing was cancelled to avoid publishing stale content.',
    shareManualCopy: 'Automatic copy was blocked. The link is selected for manual copying.',
    exportDrawing: 'Export drawing',
    exportDrawingDescription: 'Download an editable file or image copy'
  }
}

export function createTranslator(locale?: unknown) {
  const normalizedLocale = String(locale || '').toLowerCase()
  const dictionary = normalizedLocale.startsWith('zh') ? translations.zh_Hans : translations.en_US
  return (key: TranslationKey) => dictionary[key] || translations.en_US[key] || key
}
