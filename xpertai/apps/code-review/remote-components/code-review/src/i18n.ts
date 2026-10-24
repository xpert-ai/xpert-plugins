export const messages = {
  reviewTemplate: ['Review template', '审查模板'],
  chooseReviewTemplate: ['Choose a review template', '选择审查模板'],
  changeReviewTemplate: ['Change template', '更换模板'],
  chooseReviewAssistant: ['Choose an Assistant', '选择执行智能体'],
  loadingPipelineOptions: ['Loading review options…', '正在加载审查选项…'],
  keepCurrentPipeline: ['Keep the current pipeline', '沿用当前流水线'],
  keepCurrentPipelineHelp: ['Future PR events use the current configuration. Choose another template below to change it when you save.', '后续 PR 事件沿用当前配置。可在下方更换模板，保存规则后生效。'],
  reuseReviewConfiguration: ['Reuse a saved configuration', '复用已有配置'],
  noReviewTemplates: ['No compatible review templates are available. Check that Code Review is installed and enabled.', '暂无可用的审查模板，请检查 Code Review 插件是否已安装并启用。'],
  noReviewAssistants: ['No published Assistants are available in this Project. Add a code review Assistant to the Project first.', '此项目暂无可用的已发布智能体，请先为项目关联代码审查智能体。'],
  noSavedReviewPipelines: ['No saved configurations yet. Choose a review template to continue.', '暂无已保存配置，可直接选择审查模板继续。'],
  reviewParameters: ['Review parameters', '审查参数'],
  reviewRequireChecks: ['Require successful CI checks', '要求 CI 检查通过'],
  reviewRequiredChecks: ['Required check names', '必要检查名称'],
  reviewRequiredChecksHelp: ['One name per line. Leave empty to use all checks returned for this commit.', '每行一个名称；留空时检查当前提交返回的所有检查项。'],
  reviewChecksLimit: ['Use at most 100 check names, each at most 200 characters.', '最多填写 100 个检查名称，每个不超过 200 字符。'],
  reviewBlockingPriorities: ['Priorities requiring a new revision', '需要返工的严重级别'],
  reviewPriorityRequired: ['Choose at least one priority.', '请至少选择一个严重级别。'],
  startReviewPipeline: ['Start review pipeline', '启动审查流水线'],
  startReviewTemplateHelp: ['Choose a template and its Assistants. Review evidence is visible in this Project; GitHub publication requires human approval.', '选择模板与执行智能体。审查依据在当前项目中可见，发布 GitHub 评论前需要人工确认。'],
  startLocalTemplateHelp: ['Choose a local Git review template and its Assistants. Approved findings stay in this Project.', '选择本地 Git 审查模板与执行智能体，经人工确认后将结果保存在当前项目。'],
  reviewManagedByPipeline: ['This review is managed by a Project pipeline.', '此审查由项目流水线管理。'],
  startReview: ['Start review', '启动审查'],
  working: ['Working…', '正在处理…'],
  noChangedFiles: ['No changed files in this snapshot.', '此快照没有变更文件。'],
  detailSummary: ['Summary', '摘要'],
  detailChanges: ['Code changes', '代码变更'],
  detailFindings: ['Review findings', '审查意见'],
  workbenchTitle: ["Review workbench", "审查工作台"],
  reviewInbox: ["Review inbox", "审查收件箱"],
  repositories: ["Repositories", "仓库"],
  settings: ["Settings", "设置"],
  personalFilters: ["Personal filters", "个人过滤"],
  newReview: ["New review", "新建审查"],
  openGithubPr: ["Open GitHub PR", "打开 GitHub PR"],
  importLocalGit: ["Import local Git", "导入本地 Git"],
  allRepositories: ["All repositories", "全部仓库"],
  searchReviews: ["Search PRs, titles or commits…", "搜索 PR、标题或提交…"],
  prQueue: ["PR list", "PR 列表"],
  resizeQueue: ['Resize PR list', '调整 PR 列表宽度'],
  resizeQueueHelp: ['Drag or use arrow keys to resize; double-click to reset.', '拖动或按左右方向键调整宽度；双击恢复默认。'],
  queueWidth: ['PR list width', 'PR 列表宽度'],
  queueNarrow: ['Narrow', '窄'],
  queueMedium: ['Medium', '中'],
  queueWide: ['Wide', '宽'],
  queueReset: ['Reset width', '恢复默认宽度'],
  allStatuses: ["All statuses", "全部状态"],
  runsCount: ["Records: {count}", "{count} 条记录"],
  runHistory: ["Run history", "运行记录"],
  sourceAutomatic: ["Webhook", "Webhook"],
  sourceManual: ["Manual", "手动"],
  sourceLocal: ["Local Git", "本地 Git"],
  sourceTrial: ["Trial", "试审"],
  approvalWaiting: ["Review complete; awaiting human confirmation.", "审查已完成，等待人工确认。"],
  goToApproval: ["Open approval", "前往人工确认"],
  trialComplete: ["Trial complete; publication is disabled.", "试审已完成，不会发布评论。"],
  retryReview: ["Retry review", "重试审查"],
  runReason: ["Run details", "运行说明"],
  selectReview: ["Select a PR to inspect its changes and review.", "选择一个 PR，查看代码变更和审查结果。"],
  emptyReviews: ["No reviews match this view.", "暂无符合条件的审查。"],
  emptyReviewsHelp: ["Open a GitHub PR or connect a repository to start.", "可新建审查打开 PR，或接入仓库接收自动审查。"],
  loadingReviews: ["Loading reviews…", "正在读取审查…"],
  showNavigation: ["Expand navigation", "展开导航"],
  hideNavigation: ["Collapse navigation", "收起导航"],
  showQueue: ["Show PR list", "显示 PR 列表"],
  hideQueue: ["Hide PR list", "收起 PR 列表"],
  resultsStayLocal: ["Results are saved in Xpert.", "结果先保存在 Xpert。"],
  openPrHelp: ["Load a fixed PR snapshot, then choose a review template and its Assistants. Public repositories can be opened without GitHub authorization.", "先读取 PR 固定版本，再选择审查模板和执行智能体。公开仓库无需 GitHub 授权即可打开。"],
  noSnapshot: ["This run has no review snapshot yet.", "此运行尚未生成审查快照。"],
  noSnapshotHelp: ["Inspect the run state below, or retry when the blocking condition is resolved.", "可查看下方运行状态；解决阻塞原因后重试。"],
  currentRun: ["Current run", "当前运行"],
  selectedRun: ["Selected run", "已选运行"],
  viewProcess: ["View execution", "查看执行过程"],
  reviewSectionsLabel: ["Review sections", "审查详情"],
  workbenchStatusUnknown: ["Unknown state", "未知状态"],
  wb_needs_configuration: ["Needs configuration", "待配置"],
  wb_blocked: ["Needs attention", "需处理"],
  wb_awaiting_revision: ["Awaiting revision", "等待新版本"],
  wb_completed: ["Completed", "已完成"],
  wb_queued: ["Queued", "待审查"],
  wb_running: ["Reviewing", "审查中"],
  wb_awaiting_confirmation: ["Needs confirmation", "待确认"],
  wb_publishing: ["Publishing", "发布中"],
  wb_published: ["Published", "已发布"],
  wb_failed: ["Failed", "失败"],
  wb_skipped: ["Skipped", "已跳过"],
  wb_superseded: ["Superseded", "已有新提交"],
  wb_cancelled: ["Cancelled", "已取消"],
  wb_publication_unknown: ["Check GitHub", "需核对 GitHub"],
  wb_ready: ["Ready", "待审查"],
  wb_reviewed: ["Draft ready", "草稿已就绪"],
  wb_submitting: ["Publishing", "发布中"],
  wb_submitted: ["Published", "已发布"],
  wb_submission_unknown: ["Check GitHub", "需核对 GitHub"],
  localImportTitle: ["Import a versioned change", "导入固定版本的变更"],
  localImportHelp: ["Choose an exported review bundle (up to 5 MB) containing the commit versions, diff and source.", "选择本地导出的审查包（最多 5 MB），包含提交版本、变更及对应源码。"],
  reviewBundle: ["Review bundle", "审查包"],
  importBundle: ["Import", "导入"],
  importingBundle: ["Importing…", "正在导入…"],
  pinOnly: ["Pinned only", "只看置顶"],
  reviewNoHistory: ["No other runs are available.", "暂无其他运行记录。"],

  enableRepositoryPipeline: ['Matching PR events consume model usage and save evidence in the selected Project. Only the Project approval gate can authorize GitHub publication. Historical private reviews stay private.', '匹配的 PR 事件将消耗模型额度，审查依据保存在所选项目中。发布到 GitHub 需要通过项目流水线的人工确认；历史私有记录保持不变。'],
  saveRepositoryPipeline: ['Save the Project binding and keep automation paused. Pending work using the previous policy stops; historical private records stay private.', '保存项目绑定并保持自动审查暂停。使用旧策略的待处理任务将停止，历史私有记录保持不变。'],
  repositoryPipeline: ['Project review pipeline', '项目审查流水线'],
  repositoryPipelineHelp: ['Choose a review template and its Assistants here. Saving binds the configuration to this Project; matching PR events use it automatically.', '在此选择审查模板与执行智能体。保存规则时绑定到当前项目，后续匹配的 PR 事件自动使用该配置。'],
  chooseProjectFirst: ['Select a Project in Bosi, then configure its review pipeline.', '请先在 Bosi 中选择项目，再配置审查流水线。'],
  differentProjectBinding: ['This repository is bound to another Project. Selecting a configuration below explicitly moves future reviews to the current Project; history stays in its original Project.', '此仓库已绑定其他项目。选择下方配置将把后续审查移至当前项目；历史记录保留在原项目。'],
  chooseSavedPipeline: ['Choose a saved pipeline', '选择已保存的流水线'],
  loadMorePipelines: ['Load more configurations', '加载更多配置'],
  createPipelineFirst: ['Save a standard or lightweight Code Review configuration in Project pipelines first.', '请先在项目流水线中保存标准审查或轻量审查配置。'],
  configureProjectPipeline: ['Configure Project pipelines', '配置项目流水线'],
  unboundRepository: ['Choose a review template before enabling automation.', '开启自动审查前，请选择审查模板。'],
  viewReviewPipeline: ['Open review pipeline', '查看审查流水线'],
  projectGateHelp: ['Publication is confirmed in the Project pipeline. Trial runs cannot publish.', '请在项目流水线中确认发布；试审不能发布。'],
  "operationFailedRefreshAndTryAgain": [
    "Operation failed. Refresh and try again.",
    "操作失败，请刷新后重试。"
  ],
  "ready": [
    "Ready",
    "待审查"
  ],
  "reviewing": [
    "Reviewing",
    "审查中"
  ],
  "draftReady": [
    "Draft ready",
    "草稿就绪"
  ],
  "failed": [
    "Failed",
    "失败"
  ],
  "cancelled": [
    "Cancelled",
    "已取消"
  ],
  "submitting": [
    "Submitting",
    "提交中"
  ],
  "submitted": [
    "Submitted",
    "已提交"
  ],
  "checkGithub": [
    "Check GitHub",
    "需核实提交"
  ],
  "codeReview": [
    "Code review",
    "代码审查"
  ],
  "readTheChangeVerifyTheFinding": [
    "Read the change. Verify the finding.",
    "读懂变更，核实问题。"
  ],
  "reload": [
    "Reload",
    "重新加载"
  ],
  "pullRequestUrl": [
    "Pull request URL",
    "Pull Request 地址"
  ],
  "githubAccess": [
    "GitHub access",
    "GitHub 访问方式"
  ],
  "publicRepository": [
    "Public repository",
    "公开仓库"
  ],
  "connectedGithub": [
    "Connected GitHub",
    "已连接 GitHub"
  ],
  "openPr": [
    "Open PR",
    "打开 PR"
  ],
  "prList": [
    "PR list",
    "PR 列表"
  ],
  "recentPinned": [
    "Recent & pinned",
    "最近与置顶"
  ],
  "reviewRequested": [
    "Review requested",
    "等待我审查"
  ],
  "createdByMe": [
    "Created by me",
    "我创建的 PR"
  ],
  "pullRequests": [
    "Pull requests",
    "Pull Request 列表"
  ],
  "noPullRequestsHereYet": [
    "No pull requests here yet.",
    "暂无 PR。"
  ],
  "previousPage": [
    "Previous page",
    "上一页"
  ],
  "nextPage": [
    "Next page",
    "下一页"
  ],
  "startWithAPullRequest": [
    "Start with a pull request",
    "从一个 Pull Request 开始"
  ],
  "openAPublicPrAboveOrConnectGithub": [
    "Open a public PR above, or connect GitHub in your workspace to review private repositories. Draft findings stay private until you confirm submission.",
    "输入公开 PR 地址，或在工作空间连接 GitHub 后审查私有仓库。审查草稿仅自己可见，确认后才会提交。"
  ],
  "refreshPr": [
    "Refresh PR",
    "刷新 PR"
  ],
  "pin": [
    "Pin",
    "置顶"
  ],
  "cancelReview": [
    "Cancel review",
    "取消审查"
  ],
  "reviewChanges": [
    "Review changes",
    "审查变更"
  ],
  "submitReview": [
    "Submit review…",
    "提交审查…"
  ],
  "reviewSections": [
    "Review sections",
    "审查内容"
  ],
  "overview": [
    "Overview",
    "概览"
  ],
  "changes": [
    "Changes",
    "文件变更"
  ],
  "findings": [
    "Findings",
    "发现"
  ],
  "checks": [
    "Checks",
    "检查结果"
  ],
  "reviewFocusOptional": [
    "Review focus (optional)",
    "审查重点（可选）"
  ],
  "forExampleConcurrencyAndAuthorization": [
    "For example: concurrency and authorization",
    "例如：并发处理与权限校验"
  ],
  "coverageLimitations": [
    "Coverage limitations",
    "覆盖范围限制"
  ],
  "fileListIsIncomplete": [
    "File list is incomplete.",
    "文件列表不完整。"
  ],
  "someFilesHaveNoDiffBinaryOrToo": [
    "Some files have no diff (binary or too large).",
    "部分文件没有差异文本（可能是二进制或体积过大）。"
  ],
  "checksAreUnavailable": [
    "Checks are unavailable.",
    "无法读取检查结果。"
  ],
  "onlyTheFirstCommentsAreIncluded": [
    "Only the first 100 comments are included.",
    "仅包含前 100 条评论。"
  ],
  "checkListIsIncomplete": [
    "Check list is incomplete.",
    "检查结果列表不完整。"
  ],
  "reviewSummary": [
    "Review summary",
    "审查结论"
  ],
  "startAReviewToGenerateADraftWith": [
    "Start a review to generate a draft with verifiable findings.",
    "开始审查，生成可核对依据的审查草稿。"
  ],
  "prDescription": [
    "PR description",
    "PR 描述"
  ],
  "noDescription": [
    "No description.",
    "暂无描述。"
  ],
  "viewSubmittedReview": [
    "View submitted review",
    "查看已提交的审查"
  ],
  "changedFile": [
    "Changed file",
    "变更文件"
  ],
  "viewed": [
    "Viewed",
    "已阅"
  ],
  "diffUnavailableOpenGithubToInspectThisFile": [
    "Diff unavailable. Open GitHub to inspect this file.",
    "无法显示差异，请到 GitHub 检查此文件。"
  ],
  "noSupportedBugsWereFoundInTheReviewed": [
    "No supported bugs were found in the reviewed scope.",
    "在已审查范围内未发现有依据的问题。"
  ],
  "findingsWillAppearAfterTheReview": [
    "Findings will appear after the review.",
    "审查完成后将展示发现的问题。"
  ],
  "noCheckRunsReturnedByGithub": [
    "No check runs returned by GitHub.",
    "GitHub 未返回检查记录。"
  ],
  "submitToGithub": [
    "Submit to GitHub",
    "提交到 GitHub"
  ],
  "thisSendsAReviewFromYourConnectedGithub": [
    "This sends a review from your connected GitHub account. Verify the message and selected findings.",
    "将使用已连接的 GitHub 账号提交审查。请核对内容并选择需要提交的问题。"
  ],
  "reviewDecision": [
    "Review decision",
    "审查结论"
  ],
  "comment": [
    "Comment",
    "仅评论"
  ],
  "approve": [
    "Approve",
    "批准"
  ],
  "requestChanges": [
    "Request changes",
    "请求修改"
  ],
  "reviewMessage": [
    "Review message",
    "审查内容"
  ],
  "cancel": [
    "Cancel",
    "取消"
  ],
  "confirmSubmission": [
    "Confirm submission",
    "确认提交"
  ],
  "backToList": [
    "Review inbox",
    "审查列表"
  ],
  "askInChat": [
    "Ask in conversation",
    "在对话中询问"
  ],
  "changedFiles": [
    "Changed files",
    "变更文件"
  ],
  "askFinding": [
    "Explain the finding “{title}” at {path}:{line}, with source evidence.",
    "请结合代码依据解释 {path}:{line} 的“{title}”问题。"
  ]
} as const

const codes: Record<string, [string, string]> = {
  HUMAN_DECISION_REQUIRED: ["Review complete; awaiting human approval in the Project pipeline.", "审查已完成，等待项目流水线中的人工确认。"],
  review_timeout: ["Review timed out; check the model and execution.", "审查超时，请检查模型或执行记录。"],
  trigger_disabled: ["Trigger disabled", "未启用此事件触发"],
  pull_request_closed: ["PR closed", "PR 已关闭"],
  automation_paused: ["Automatic reviews paused", "自动审查已暂停"],
  daily_limit_reached: ["Daily limit reached (UTC); new events resume tomorrow.", "已达到每日审查上限（UTC）；下一日的新事件会恢复审查。"],
  new_commit: ["A newer commit superseded this review.", "已有更新的提交，本轮结果不会发布。"],
  policy_changed: ["Policy changed; the next matching PR event will use the new policy.", "策略已更改，本轮已停止。下一次符合条件的 PR 事件会使用新策略。"],
  repository_already_configured: ["This repository already has an automation owner.", "此仓库已有自动审查配置，请联系原配置人管理。"],
  installation_permissions_required: ["Grant the GitHub App Contents read and Pull requests write access.", "请为 GitHub App 授予 Contents 读取和 Pull requests 读写权限。"],
  repository_management_required: ["Repository write or admin access is required.", "只有拥有仓库写入或管理权限的账号可以开启自动审查。"],
  github_app_not_configured: ["Ask an administrator to configure the GitHub App first.", "请先由管理员配置 GitHub App，再授权仓库。"],
  github_app_invalid_key: ["The GitHub App private key is invalid. Ask an administrator to replace the PEM value.", "GitHub App 私钥格式不正确，请管理员重新填写完整 PEM 私钥。"],
  github_repository_revalidation_required: ["The GitHub App reference changed. Save the repository rules again to revalidate access.", "GitHub App 引用已变化，请重新保存仓库规则以验证授权。"],
  github_integration_mismatch: ["The shared connection uses another integration or PAT. Disconnect it in workspace connector settings, then return here to authorize with the required integration.", "GitHub 连接使用了另一条集成或 PAT。请先在工作空间连接器管理中断开该共享连接，再返回此处使用指定集成授权。"],
  github_integration_incomplete: ["Complete the App ID, App slug, OAuth and PEM fields in System integrations.", "请在系统集成中补齐 App ID、App slug、OAuth 和 PEM 配置。"],
  github_oauth_unavailable: ["The Connector does not provide the required GitHub OAuth integration method. Update the GitHub Connector plugin.", "所选连接器未提供所需的 GitHub OAuth 系统集成授权，请更新 GitHub Connector 插件。"],
  github_integration_unavailable: ["The selected GitHub system integration is unavailable in this tenant.", "所选 GitHub 系统集成不存在或不在可用租户范围内。"],
  pipeline_binding_unavailable: ['The saved pipeline is unavailable. Choose an accessible Project configuration.', '已保存的流水线不可用，请选择有权访问的项目配置。'],
  pipeline_dispatch_pending: ['This PR is being started. Refresh to open its pipeline.', '此 PR 正在启动，请刷新后打开流水线。'],
  pipeline_project_unavailable: ['The automation owner cannot manage this Project. Restore access or reconfigure the binding.', '自动审查配置人无权管理此项目，请恢复其权限或重新配置绑定。'],
  pipeline_binding_required: ['Choose a review template and its Assistants first.', '请先选择审查模板与执行智能体。'],
  pipeline_template_unavailable: ['This template is unavailable for this source. Reload the template list.', '此模板不可用或不适用于当前审查来源，请重新加载模板列表。'],
  pipeline_assistant_required: ['Choose an available Assistant for every review role.', '请为每个审查角色选择当前可用的智能体。'],
  pipeline_configuration_mismatch: ['This configuration does not match a supported review template. Choose a template and configure it again.', '此配置不符合当前审查模板，请重新选择模板并配置。'],
  pipeline_version_already_started: ['This PR revision already has a pipeline. Open the existing instance.', '此 PR 版本已有流水线，请打开已有实例。'],
  pipeline_approval_required: ['Approve this review in the Project pipeline.', '请在项目流水线中完成审查确认。'],
  trial_cannot_publish: ['Trial runs cannot publish reviews.', '试审不能发布审查评论。'],
  pipeline_policy_invalid: ['Pipeline reviews use Project visibility and human approval.', '流水线审查采用项目可见范围，并由人工确认发布。'],
  project_required: ['Select a Project first.', '请先选择项目。'],
  unsupported: ['This client does not support this operation. Update the client or continue in the web app.', '当前客户端尚不支持此操作，请升级客户端或在 Web 端继续。'],
  command_unavailable: ['This operation is unavailable in this client. Update the client or continue in the web app.', '当前客户端无法执行此操作，请升级客户端或在 Web 端继续。'],
  connector_not_installed: ['Ask an administrator to install the GitHub Connector plugin before connecting.', '请管理员安装 GitHub Connector 插件后再连接账号。'],
  workspace_management_required: ['Ask a workspace administrator to configure the GitHub connection.', '需要工作空间管理权限，请联系管理员配置 GitHub 连接。'],
  forbidden: ['You do not have permission to perform this operation. Contact your workspace administrator.', '当前账号无权执行此操作，请联系工作空间管理员。'],
  authentication_required: ['Your session expired. Sign in again before connecting.', '登录已失效，请重新登录后连接。'],
  invalid_payload: ['The connection request is invalid. Update the client and plugin before retrying.', '连接请求格式不正确，请更新客户端和插件后重试。'],
  context_changed: ['The assistant or workspace changed. Reopen this view before trying again.', '助手或工作空间已切换，请重新打开此视图后操作。'],
  stale_context: ['The assistant or workspace changed. Reopen this view before trying again.', '助手或工作空间已切换，请重新打开此视图后操作。'],
  connection_in_progress: ['Another connection is in progress. Complete or cancel it first.', '另一个连接正在进行中，请先完成或取消。'],
  connection_navigation_failed: ['Could not open the authorization page. Check your browser and try again.', '无法打开授权页面，请检查浏览器后重试。'],
  connection_timeout: ['Connection timed out. Check authorization in the web app, then try again.', '连接等待超时，请在 Web 端检查授权结果后重新连接。'],
  request_timeout: ['The request timed out. Check the connection or authorization status before retrying.', '请求等待超时，请检查网络或授权状态后重试。'],
  connection_failed: ['Connection failed. Check your network and any error on the authorization page before retrying.', '连接失败，请检查网络及授权页面中的错误提示后重试。'],
  github_auth_required: ['Connect GitHub in this workspace to continue.', '请在此工作空间连接 GitHub 后继续。'],
  stale_revision: ['The PR has new commits. Refresh and review again.', 'PR 已有新提交，请刷新后重新审查。'],
  revision_conflict: ['This review changed. Reload and try again.', '审查记录已变化，请刷新后重试。'],
  pull_request_not_found: ['PR or source file is unavailable. Check the URL and repository access.', 'PR 或源码文件不可用，请核对地址和仓库权限。'],
  github_access_or_rate_limit: ['GitHub access denied or rate limit reached. Try your connected account.', 'GitHub 拒绝访问或达到请求限制，请使用已连接账号。'],
  review_result_missing: ['The task finished without a review draft. Retry the review.', '任务结束但未保存审查草稿，请重试。'],
  assistant_task_failed: ['The Assistant task failed. Check its model configuration and retry.', '助手任务失败，请检查模型配置后重试。'],
  dispatch_pending_confirmation: ['Waiting for the platform to confirm this task. Refresh to check progress.', '等待平台确认任务，可刷新查看进度。'],
  submission_unknown_check_github: ['Submission outcome is unknown. Check GitHub before any new submission.', '无法确定提交结果。再次提交前请先查看 GitHub。'],
  invalid_input: ['Some fields are invalid. Check your input.', '输入格式有误，请检查。'],
  invalid_pull_request_url: ['Enter an https://github.com/owner/repo/pull/number URL.', '请输入 https://github.com/owner/repo/pull/编号 地址。'],
  revision_changed_during_fetch: ['The PR changed while loading. Try again.', 'PR 在加载期间发生变化，请重试。']
}

export type MessageKey = keyof typeof messages
export function platformText(value: Record<string, string>, locale: string) {
  return (locale === 'zh-Hans' ? value.zh_Hans : value.en_US) ?? value.en_US ?? Object.values(value)[0] ?? ''
}
export function i18n(value?: string) {
  const aliases = ['zh', 'zh-CN', 'zh-Hans', 'zh_Hans', 'zh_CN']
  const locale = aliases.includes(value ?? '') ? 'zh-Hans' : 'en-US'
  return { locale, formatDate: (value: string) => new Intl.DateTimeFormat(locale, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)), t: (key: MessageKey, values: Record<string, string | number> = {}) => {
    const message = messages[key][locale === 'zh-Hans' ? 1 : 0]
    return message.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? '{' + name + '}'))
  } }
}
export function errorMessage(code: string, locale: string) {
  return codes[code]?.[locale === 'zh-Hans' ? 1 : 0] ?? messages.operationFailedRefreshAndTryAgain[locale === 'zh-Hans' ? 1 : 0]
}
