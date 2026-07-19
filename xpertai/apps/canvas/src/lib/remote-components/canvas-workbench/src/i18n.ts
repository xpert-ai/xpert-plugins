export type TranslationKey =
  | 'newCanvas'
  | 'save'
  | 'newVersion'
  | 'versionCreated'
  | 'import'
  | 'reviewed'
  | 'draft'
  | 'archive'
  | 'delete'
  | 'deleteVersion'
  | 'deleted'
  | 'confirmDeleteCanvas'
  | 'confirmDeleteVersion'
  | 'documents'
  | 'studio'
  | 'inspector'
  | 'canvasItems'
  | 'versionItems'
  | 'collaborators'
  | 'manualVersionHint'
  | 'noCanvases'
  | 'noVersions'
  | 'noLogs'
  | 'versions'
  | 'logs'
  | 'details'
  | 'ask'
  | 'askAssistant'
  | 'askPlaceholder'
  | 'snapshot'
  | 'noSnapshot'
  | 'restore'
  | 'aiHolderTip'
  | 'annotationTip'
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
  | 'connecting'
  | 'disconnected'
  | 'share'
  | 'shareCanvas'
  | 'shareCanvasTip'
  | 'shareUnavailable'
  | 'shareDescription'
  | 'alwaysShareLatest'
  | 'alwaysShareLatestDescription'
  | 'sharingLatestPublish'
  | 'sharingFixedPublish'
  | 'shareAccess'
  | 'sharePublicLink'
  | 'shareOrganization'
  | 'shareWorkspace'
  | 'copyShareLink'
  | 'updateShareLink'
  | 'createShareLink'
  | 'shareLinkReady'
  | 'shareLinkNotCreated'
  | 'revokeShare'
  | 'shareVersionNote'
  | 'confirmPublicShareTitle'
  | 'confirmPublicShare'
  | 'cancel'
  | 'confirmAction'
  | 'confirmRevokeShareTitle'
  | 'confirmRevokeShare'
  | 'shareSyncRequired'
  | 'shareSyncTimeout'
  | 'shareLinkMissing'
  | 'shareExportMissing'
  | 'sharePreparing'
  | 'artifactShared'
  | 'shareLinkCopied'
  | 'shareManualCopy'
  | 'shareRevoked'
  | 'emptyCanvas'

const dictionary: Record<string, Record<TranslationKey, string>> = {
  en: {
    newCanvas: 'New',
    save: 'Save',
    newVersion: 'New version',
    versionCreated: 'Version created',
    import: 'Import',
    reviewed: 'Reviewed',
    draft: 'Draft',
    archive: 'Archive',
    delete: 'Delete',
    deleteVersion: 'Delete version',
    deleted: 'Deleted',
    confirmDeleteCanvas: 'Delete this canvas and all versions?',
    confirmDeleteVersion: 'Delete this version?',
    documents: 'Canvases',
    studio: 'Canvas Studio',
    inspector: 'Inspector',
    canvasItems: 'canvases',
    versionItems: 'versions',
    collaborators: 'Collaborators',
    manualVersionHint: 'Created manually only',
    noCanvases: 'No canvases found',
    noVersions: 'No versions yet',
    noLogs: 'No activity yet',
    versions: 'Versions',
    logs: 'Logs',
    details: 'Details',
    ask: 'Ask',
    askAssistant: 'Ask Assistant',
    askPlaceholder: 'Ask about the current canvas',
    snapshot: 'Snapshot',
    noSnapshot: 'No snapshot image yet',
    restore: 'Restore',
    aiHolderTip: 'Create a selected AI image holder for generated images',
    annotationTip: 'Add a red arrow and note for image feedback',
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
    synced: 'Synced',
    connecting: 'Connecting',
    disconnected: 'Offline',
    share: 'Share',
    shareCanvas: 'Share Canvas',
    shareCanvasTip: 'Publish a read-only Artifact link for this canvas',
    shareUnavailable: 'Artifact sharing is not available in this runtime',
    shareDescription: 'Publish the synchronized current page as a self-contained, read-only Artifact viewer.',
    alwaysShareLatest: 'Always show latest publish',
    alwaysShareLatestDescription: 'Keep this link on the latest explicitly published Artifact content.',
    sharingLatestPublish: 'Link follows the latest explicit publish',
    sharingFixedPublish: 'Link is fixed to this publish',
    shareAccess: 'Share access',
    sharePublicLink: 'Anyone with the link',
    shareOrganization: 'Organization members',
    shareWorkspace: 'Workspace members',
    copyShareLink: 'Copy link',
    updateShareLink: 'Update link',
    createShareLink: 'Create link',
    shareLinkReady: 'Share link is ready',
    shareLinkNotCreated: 'No share link yet',
    revokeShare: 'Revoke link',
    shareVersionNote: 'Publishing creates an Artifact version only. Canvas versions are still created manually from the Versions panel.',
    confirmPublicShareTitle: 'Create a public link?',
    confirmPublicShare: 'Anyone with this link will be able to view the published Canvas page without signing in.',
    cancel: 'Cancel',
    confirmAction: 'Create public link',
    confirmRevokeShareTitle: 'Revoke this share link?',
    confirmRevokeShare: 'The current link will stop working. The Canvas and its manually created versions are not affected.',
    shareSyncRequired: 'Canvas collaboration must be online and synchronized before sharing.',
    shareSyncTimeout: 'Canvas synchronization timed out. Please try sharing again.',
    shareLinkMissing: 'Platform Artifacts did not return a share link.',
    shareExportMissing: 'The backend did not return a Canvas Artifact export id.',
    sharePreparing: 'Preparing the Canvas share link in a sandbox browser…',
    artifactShared: 'Canvas Artifact is ready',
    shareLinkCopied: 'Share link copied',
    shareManualCopy: 'Select and copy the link manually',
    shareRevoked: 'Share link revoked',
    emptyCanvas: 'This Canvas page is empty'
  },
  zh: {
    newCanvas: '新建',
    save: '保存',
    newVersion: '新建版本',
    versionCreated: '版本已创建',
    import: '导入',
    reviewed: '已审核',
    draft: '草稿',
    archive: '归档',
    delete: '删除',
    deleteVersion: '删除版本',
    deleted: '已删除',
    confirmDeleteCanvas: '确定删除此画布及其所有版本？',
    confirmDeleteVersion: '确定删除此版本？',
    documents: '画布',
    studio: 'Canvas Studio',
    inspector: '检查器',
    canvasItems: '个画布',
    versionItems: '个版本',
    collaborators: '协作者',
    manualVersionHint: '仅支持人工创建',
    noCanvases: '暂无匹配画布',
    noVersions: '尚未创建版本',
    noLogs: '暂无活动记录',
    versions: '版本',
    logs: '日志',
    details: '详情',
    ask: '询问',
    askAssistant: '询问 Assistant',
    askPlaceholder: '询问当前画布',
    snapshot: '快照',
    noSnapshot: '暂无快照图片',
    restore: '恢复',
    aiHolderTip: '创建用于插入生成图片的选中占位符',
    annotationTip: '添加红色箭头和文字标注',
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
    synced: '已同步',
    connecting: '连接中',
    disconnected: '协作离线',
    share: '分享',
    shareCanvas: '分享 Canvas',
    shareCanvasTip: '将此画布发布为只读 Artifact 链接',
    shareUnavailable: '当前运行环境未提供 Artifact 分享能力',
    shareDescription: '把已同步的当前页面发布为自包含、只读的 Artifact 查看器。',
    alwaysShareLatest: '始终展示最新发布内容',
    alwaysShareLatestDescription: '此链接跟随最近一次人工明确发布的 Artifact 内容。',
    sharingLatestPublish: '链接跟随最新一次明确发布',
    sharingFixedPublish: '链接固定到本次发布',
    shareAccess: '分享范围',
    sharePublicLink: '获得链接的任何人',
    shareOrganization: '组织成员',
    shareWorkspace: '工作区成员',
    copyShareLink: '复制链接',
    updateShareLink: '更新链接',
    createShareLink: '创建链接',
    shareLinkReady: '分享链接已就绪',
    shareLinkNotCreated: '尚未创建分享链接',
    revokeShare: '撤销链接',
    shareVersionNote: '发布只会创建 Artifact 版本；Canvas 版本仍只能在版本面板中由人工创建。',
    confirmPublicShareTitle: '创建公开链接？',
    confirmPublicShare: '任何获得此链接的人无需登录即可查看本次发布的 Canvas 页面。',
    cancel: '取消',
    confirmAction: '创建公开链接',
    confirmRevokeShareTitle: '撤销此分享链接？',
    confirmRevokeShare: '当前链接将立即失效，Canvas 及其人工创建的版本不会受影响。',
    shareSyncRequired: '分享前 Canvas 协作必须在线并完成同步。',
    shareSyncTimeout: 'Canvas 同步超时，请重试分享。',
    shareLinkMissing: '平台 Artifact 未返回分享链接。',
    shareExportMissing: '后端未返回 Canvas Artifact 导出 ID。',
    sharePreparing: '正在 Sandbox 浏览器中生成 Canvas 分享文件…',
    artifactShared: 'Canvas Artifact 已就绪',
    shareLinkCopied: '分享链接已复制',
    shareManualCopy: '请选中链接并手动复制',
    shareRevoked: '分享链接已撤销',
    emptyCanvas: '此 Canvas 页面为空'
  }
}

export function createTranslator(locale: string | null | undefined) {
  const lang = String(locale || '').toLowerCase().startsWith('zh') ? 'zh' : 'en'
  return (key: TranslationKey) => dictionary[lang][key] ?? dictionary.en[key] ?? key
}
