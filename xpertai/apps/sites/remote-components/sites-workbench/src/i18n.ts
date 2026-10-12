const messages = {
  sites: ['Sites', '站点'], subtitle: ['Build in chat. Preview and publish here.', '在对话中构建，在这里预览和发布。'],
  create: ['New site', '新建站点'], search: ['Search sites', '搜索站点'], reload: ['Refresh', '刷新'], back: ['All sites', '所有站点'],
  preview: ['Preview', '预览'], versions: ['Versions', '版本'], settings: ['Settings', '设置'], publish: ['Publish version', '发布版本'],
  draft: ['Unpublished', '未发布'], live: ['Published', '已发布'], latest: ['Latest saved', '最新保存'], deployed: ['Currently published', '当前发布'],
  empty: ['Your next site starts here', '从这里开始构建站点'], emptyDescription: ['Describe your site in the chat. Saved versions appear here for review.', '在左侧对话中描述需求，保存的版本将在这里供你审阅。'],
  name: ['Site name', '站点名称'], prompt: ['What would you like to build?', '你想构建什么站点？'], nameHint: ['A name for your project', '为项目起个名字'],
  createDescription: ['Create a project and send your brief to the assistant in the left chat.', '创建项目，并将需求发送到左侧智能体对话。'],
  cancel: ['Cancel', '取消'], confirm: ['Confirm', '确认'], access: ['Who can access?', '谁可以访问？'], admins_only: ['Only me', '仅自己'], workspace_all: ['Workspace members', '工作区成员'], custom: ['Selected users', '指定用户'], public_link: ['Anyone with the link', '任何持链接的人'],
  publicWarning: ['Anyone who receives this link can open the published version.', '获得链接的任何人都可以打开此发布版本。'],
  publishDescription: ['Publish this exact saved version. Later edits remain drafts until published again.', '发布选定的保存版本。后续修改需再次发布才会上线。'],
  users: ['User IDs, separated by commas', '用户 ID，以逗号分隔'], open: ['Open published site', '打开已发布站点'],
  desktop: ['Desktop preview', '桌面预览'], mobile: ['Mobile preview', '手机预览'], noVersion: ['No saved version yet', '还没有保存版本'],
  saveHint: ['Ask the assistant to build the source and save a version. It will appear here automatically.', '请在左侧让智能体构建源码并保存版本，完成后会自动显示在这里。'],
  improve: ['Continue in chat', '在对话中继续修改'], build: ['Build this site', '构建此站点'], previous: ['Previous page', '上一页'], next: ['Next page', '下一页'],
  restore: ['Restore as new draft', '恢复为新草稿'], restoreDescription: ['Copy this version into a new saved version. The published site stays on its current version.', '复制此版本并保存为新草稿，当前发布版本保持不变。'],
  emptyVersions: ['Saved versions will appear here.', '保存的版本将在此显示。'], emptySearch: ['No matching sites', '没有匹配的站点'],
  archive: ['Archive site', '归档站点'], archiveDescription: ['Remove this project from the library. Existing published links are not revoked. Revoke them first if needed.', '将项目移出列表。已有发布链接不会自动撤销，如需停止访问，请先撤销链接。'],
  revoke: ['Revoke public link', '撤销公开链接'], revokeDescription: ['The public link for this deployment will stop working.', '此发布版本的公开链接将失效。'],
  hosting: ['Hosting', '托管方式'], hostingDescription: ['Self-contained static sites, published through Xpert Artifacts. Server functions, databases and traffic analytics are not available in this version.', '独立静态站点，通过 Xpert Artifact 发布。此版本不提供服务端函数、数据库和访问统计。'],
  error: ['The operation failed. Refresh and try again; check plugin configuration if it persists.', '操作失败。请刷新重试；若仍失败，请检查插件配置。'],
  sent: ['Sent to the left chat', '已发送到左侧对话'], saved: ['Saved successfully', '保存成功'], version: ['Version', '版本'],
  page: ['Page', '页'], createPrompt: ['Build the site “{name}” for project {id}: {prompt}. Inspect this project first, create source files, then save a reviewable version. Do not publish yet.', '为项目 {id} 构建站点「{name}」：{prompt}。先检查项目，再创建源码文件并保存可审阅版本，暂不发布。'],
  improvePrompt: ['Continue editing site “{name}”, project {id}, based on the selected version {version}. Inspect the project and ask me what to change.', '继续编辑站点「{name}」（项目 {id}），当前选中版本 {version}。请先检查项目，再询问我需要修改什么。'],
  versionLabel: ['v{number}', 'v{number}'],
} as const
export type MessageKey = keyof typeof messages
export function i18n(value?: string) {
  const chinese = /^zh(?:[-_]|$)/i.test(value ?? '')
  return { locale: chinese ? 'zh-CN' : 'en-US', t: (key: MessageKey, params: Record<string, string | number> = {}) => Object.entries(params).reduce<string>((s, [k,v]) => s.replaceAll(`{${k}}`, String(v)), messages[key][chinese ? 1 : 0]) }
}
