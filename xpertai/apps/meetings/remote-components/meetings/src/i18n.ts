const en = {
  viewTitle: "Meetings",
  collaboration_unavailable: "The collaboration service is unavailable.",
  followTranscript: "Follow latest text",
  liveRetrying: "Retrying transcription",
  liveWaiting:
    "Short segments appear during recording and are refined when you finish.",
  listening: "Listening",
  liveTranscript: "Live transcript",
  summaryEditable:
    "This Markdown document can be edited together. AI source evidence stays in the generated history.",
  summaryPlaceholder: "Edit your meeting summary…",
  downloadDraft: "Download draft",
  documentOffline:
    "Synchronization is unavailable. Keep this page open while retrying, or download your draft before leaving.",
  otherWindows: "Other active windows:",
  connecting: "Connecting…",
  online: "online",
  redo: "Redo",
  undo: "Undo",
  quote: "Quote",
  heading: "Heading",
  fullTranscript: "View full transcript",
  formatNotes: "Markdown formatting",
  bold: "Bold",
  italic: "Italic",
  bulletList: "Bullet list",
  orderedList: "Numbered list",
  secure_storage_unavailable:
    "Secure storage is unavailable. Unlock your keychain and retry.",
  cache_corrupt:
    "The local recording cache could not be read. Keep the files and contact support.",
  audio_expired:
    "The recording retention period has expired. Your notes and transcript checkpoints remain available.",
  speech_to_text_model_missing:
    "Configure a speech-to-text model on this Assistant before recording.",
  minutes: "min",
  openAssistant: "Open meeting conversation",
  assistantWorking: "Assistant is summarizing",
  phaseComplete: "Completed stage summaries",
  silenceHelp:
    "Both sources quiet for {seconds}s → stage summary in Assistant. Final minutes follow when recording ends.",
  assistantFailed:
    "A stage summary failed. Final minutes will still use the full transcript.",
  captureHelp:
    "Audio is saved securely on this device and uploaded as connectivity allows. Transcription updates during recording; the summary follows when you finish.",
  subtitle: "A space for every conversation",
  newMeeting: "New recording",
  library: "Meeting library",
  search: "Search meetings, notes and transcripts",
  recent: "Recent meetings",
  private: "Meeting files follow Assistant workspace permissions",
  workspaceFolder: "Assistant workspace folder",
  workspaceFailed:
    "Workspace files need synchronization. Meeting content is retained.",
  workspaceRetry: "Sync files",
  workspace_file_conflict:
    "A workspace file was edited separately. Preserve or move that version before synchronizing again.",
  workspace_sync_failed:
    "Workspace file synchronization failed. Your meeting content is retained; try again.",
  workspace_scope_missing:
    "The host did not provide an Assistant workspace. Update the host and reopen Meetings.",
  workspace_scope_changed:
    "The Assistant workspace scope changed. Restore the original scope before synchronizing.",
  workspace_unavailable: "The platform workspace file service is unavailable.",
  assistant_workspace_required:
    "Open Meetings in the Assistant workspace to save meeting files.",
  empty: "Your meeting notes start here",
  emptyHelp:
    "Capture a conversation. Keep your notes, decisions and next steps together.",
  title: "Meeting title",
  untitled: "Untitled meeting",
  record: "Start recording",
  cancel: "Cancel",
  readyTitle: "Ready when you are",
  consent: "Let everyone know before recording.",
  sources: "Microphone + system audio",
  sourcesHelp: "Captures your voice and the call audio. No meeting bot joins.",
  desktopHelp: "Recording requires Xpert Desktop on macOS 15 or later.",
  recording: "Recording",
  starting: "Preparing audio",
  uploading: "Saving recording",
  pending: "Waiting to save",
  interrupted: "Recording interrupted",
  stopped: "Recording ended",
  created: "Ready to record",
  microphone: "Microphone",
  system: "System audio",
  end: "End recording",
  elapsed: "Elapsed",
  notes: "Personal notes",
  saved: "Saved",
  saving: "Saving…",
  unsaved: "Unsaved changes",
  save: "Save notes",
  notesPlaceholder:
    "Jot down what matters. Your notes stay separate from the AI summary.",
  during: "Stay in the conversation",
  duringHelp:
    "Write a few notes here. After you finish, Meetings will organize the transcript, decisions and follow-ups.",
  summary: "Summary",
  transcript: "Transcript",
  overview: "Overview",
  decisions: "Key decisions",
  followups: "Follow-ups",
  questions: "Open questions",
  owner: "Owner",
  due: "Due date",
  unspecified: "Not specified",
  source: "View source",
  original: "Original conversation",
  sourceClose: "Close source",
  queued: "Waiting to process",
  transcribing: "Transcribing recording",
  summarizing: "Organizing your meeting",
  ready: "Ready",
  failed: "Needs attention",
  processHelp:
    "You can leave this view. Your notes and recording are saved; processing continues in the background.",
  retry: "Retry processing",
  retryUpload: "Retry upload",
  export: "Export notes",
  includeTranscript: "Include transcript",
  delete: "Delete meeting",
  deleteTitle: "Delete this meeting?",
  deleteHelp:
    "The meeting, notes, transcript and saved recording will be removed. This cannot be undone.",
  back: "Back to meetings",
  previous: "Previous",
  next: "Next",
  noDecisions: "No supported decisions were found.",
  noActions: "No supported follow-ups were found.",
  noTranscript: "The transcript will appear after processing.",
  loading: "Loading meetings…",
  refresh: "Refresh",
  error: "Could not complete this operation. Please retry.",
  rename: "Rename meeting",
  apply: "Save",
  edit: "Edit follow-up",
  request_timeout:
    "The request timed out. Your saved content is safe; try again.",
  revision_conflict:
    "These notes changed in another view. Your draft is still here. Refresh to compare before saving.",
  desktop_required:
    "Recording requires Xpert Desktop on macOS 15 or later. Open this meeting in Desktop to record. You can still view and edit meetings in your browser.",
  user_activation_required:
    "Recording must start from your click. Click Start recording again.",
  unsupported:
    "Recording is unavailable in this environment. Open this meeting in the latest Xpert Desktop on macOS 15 or later. You can still view and edit meetings in your browser.",
  checkingCapture: "Checking recording availability…",
  capture_unavailable:
    "Could not connect to the recording feature. Open Meetings in the latest Xpert Desktop and reopen the view to retry. Your saved meetings are still available.",
  forbidden:
    "This workspace does not allow this operation. Check the Assistant's plugin permissions or contact your administrator.",
  audio_permission_denied:
    "Audio access was not granted. In macOS System Settings → Privacy & Security, allow Xpert Desktop to access Microphone and Screen & System Audio Recording, then retry. Reopen Desktop if macOS asks you to.",
  audio_source_missing:
    "Audio capture was incomplete. Your notes are preserved; please start a new recording.",
  audio_conversion_failed:
    "Audio could not be converted. Recording has stopped and your notes are preserved.",
  assistant_scheduling_failed: "Assistant scheduling failed. Retry processing.",
  assistant_result_missing:
    "Assistant finished without saving a valid summary. Retry processing.",
  assistant_failed:
    "Assistant processing failed. Open the meeting conversation for details.",
  assistant_dispatch_failed:
    "Assistant could not start. Check its published model and retry.",
  assistant_timeout:
    "Assistant timed out. Retry after checking the conversation.",
  assistant_runtime_unavailable:
    "This platform version does not support Assistant tasks.",
  summary_model_missing:
    "Configure and publish the primary model of the Meetings Assistant.",
  processing_failed:
    "Processing failed. Your notes and transcript checkpoints are preserved.",
  device_lost: "An audio device disconnected. The captured portion is saved.",
  disk_error:
    "The recording could not be saved locally. Recording has stopped.",
  voice_active: "End the voice call before starting a meeting recording.",
  recording_active:
    "A meeting is already recording. Finish it before starting another.",
  scope_changed:
    "The account or workspace changed. Reopen Meetings in the current workspace.",
  upload_pending:
    "Some audio is waiting to upload. Keep Desktop open or retry when your connection returns.",
  audio_signing_missing:
    "This Desktop installation is missing its microphone signing permission. Install an updated, correctly signed version.",
  audio_permission_check_failed:
    "Microphone access could not be verified. Restart Desktop or install the latest version and try again.",
  system_audio_permission_denied:
    "Allow Desktop in macOS System Settings → Privacy & Security → Screen & System Audio Recording, then restart Desktop and try again.",
  blocked:
    "The recording request was blocked by the host. Reopen Meetings in the latest Desktop and try again.",
  emptySearch: "No meetings match this search.",
  noteConflict: "Keep a copy of your draft before refreshing.",
  actionText: "Follow-up",
  notesChanged: "Your notes changed after this summary was generated.",
  complete: "Done",
  recorded: "Recorded",
} as const;
const zh: Record<keyof typeof en, string> = {
  viewTitle: "会议记录",
  collaboration_unavailable: "协同编辑服务暂不可用。",
  followTranscript: "跟随最新内容",
  liveRetrying: "正在重试转写",
  liveWaiting: "语音按短分片持续识别，几秒后显示；结束后会结合上下文校准。",
  listening: "正在聆听",
  liveTranscript: "实时转写",
  summaryEditable:
    "摘要以 Markdown 保存，可在线协同编辑。AI 原始依据会单独保留。",
  summaryPlaceholder: "编辑会议摘要…",
  downloadDraft: "下载草稿",
  documentOffline: "同步暂不可用，请保持页面打开等待重试，或离开前下载草稿。",
  otherWindows: "其他在线窗口：",
  connecting: "连接中…",
  online: "人在线",
  redo: "重做",
  undo: "撤销",
  quote: "引用",
  heading: "标题",
  fullTranscript: "查看完整转写",
  formatNotes: "Markdown 格式",
  bold: "加粗",
  italic: "斜体",
  bulletList: "项目列表",
  orderedList: "编号列表",
  secure_storage_unavailable: "安全存储不可用，请解锁钥匙串后重试。",
  cache_corrupt: "无法读取本地录音缓存，请保留文件并联系支持。",
  audio_expired: "录音已超过保留期限，笔记和已完成的转写仍可查看。",
  speech_to_text_model_missing: "录音前，请为此助手配置语音转写模型。",
  minutes: "分钟",
  openAssistant: "打开会议对话",
  assistantWorking: "Assistant 正在总结",
  phaseComplete: "已完成阶段总结",
  silenceHelp:
    "两路音频共同静音 {seconds} 秒后，由 Assistant 做阶段总结；结束后生成最终纪要。",
  assistantFailed: "部分阶段总结未完成，最终纪要仍会使用完整转写。",
  captureHelp:
    "音频加密保存在本机并随网络上传，录音中持续转写，结束后生成会议摘要。",
  subtitle: "让每一次讨论，都有清晰的记录",
  newMeeting: "开始新录音",
  library: "会议记录",
  search: "搜索会议、笔记和转写内容",
  recent: "最近会议",
  private: "会议文件按 Assistant 工作区权限访问",
  workspaceFolder: "Assistant 工作区目录",
  workspaceFailed: "工作区文件待同步，会议内容已保留。",
  workspaceRetry: "同步文件",
  workspace_file_conflict:
    "工作区文件已被单独修改，请先另存或移走该版本，再重新同步。",
  workspace_sync_failed: "工作区文件同步失败，会议内容已保留，请重试。",
  workspace_scope_missing:
    "宿主未提供 Assistant 工作区，请更新宿主后重新打开 Meetings。",
  workspace_scope_changed: "Assistant 工作区范围已变更，请恢复原范围后再同步。",
  workspace_unavailable: "平台工作区文件服务暂不可用。",
  assistant_workspace_required:
    "请在 Assistant 工作区中打开 Meetings，以保存会议文件。",
  empty: "从一场对话开始",
  emptyHelp: "记录讨论，把笔记、决策和后续事项放在一起。",
  title: "会议名称",
  untitled: "未命名会议",
  record: "开始录音",
  cancel: "取消",
  readyTitle: "准备好，开始记录",
  consent: "录音前，请告知所有参会者。",
  sources: "麦克风 + 系统音频",
  sourcesHelp: "同时记录你的声音和通话声音，无需机器人入会。",
  desktopHelp: "录音需要 macOS 15 或更高版本的 Xpert Desktop。",
  recording: "正在录音",
  starting: "正在准备音频",
  uploading: "正在保存录音",
  pending: "等待保存",
  interrupted: "录音已中断",
  stopped: "录音已结束",
  created: "待录音",
  microphone: "麦克风",
  system: "系统音频",
  end: "结束录音",
  elapsed: "已录制",
  notes: "个人笔记",
  saved: "已保存",
  saving: "保存中…",
  unsaved: "有未保存的修改",
  save: "保存笔记",
  notesPlaceholder:
    "记下你关注的内容。个人笔记会独立保存，不会被 AI 摘要覆盖。",
  during: "专注讨论，随手记下重点",
  duringHelp: "在这里记录想法。结束后，Meetings 会整理转写、决策和后续事项。",
  summary: "会议摘要",
  transcript: "转写记录",
  overview: "会议概览",
  decisions: "关键决策",
  followups: "后续事项",
  questions: "待确认问题",
  owner: "负责人",
  due: "截止日期",
  unspecified: "未明确",
  source: "查看依据",
  original: "原始对话",
  sourceClose: "收起依据",
  queued: "等待处理",
  transcribing: "正在转写录音",
  summarizing: "正在整理会议",
  ready: "已完成",
  failed: "需要处理",
  processHelp: "可以离开此页面，后台会继续处理。笔记和录音已经保存。",
  retry: "重试处理",
  retryUpload: "重试上传",
  export: "导出笔记",
  includeTranscript: "包含转写",
  delete: "删除会议",
  deleteTitle: "删除这场会议？",
  deleteHelp: "会议、笔记、转写及保留的录音将被删除，此操作无法撤销。",
  back: "返回会议记录",
  previous: "上一页",
  next: "下一页",
  noDecisions: "暂未识别到有依据的决策。",
  noActions: "暂未识别到有依据的后续事项。",
  noTranscript: "处理完成后，转写记录将显示在这里。",
  loading: "正在加载会议…",
  refresh: "刷新",
  error: "操作未完成，请重试。",
  rename: "修改会议名称",
  apply: "保存",
  edit: "编辑后续事项",
  request_timeout: "请求超时，已保存的内容不会丢失，请重试。",
  revision_conflict:
    "另一页面已修改这些笔记。你的草稿仍保留在这里，刷新前请先复制对比。",
  desktop_required:
    "录音需要 macOS 15 或更高版本的 Xpert Desktop，请在桌面端打开会议后录音。浏览器中仍可查看和编辑会议记录。",
  user_activation_required: "录音需要由你亲自点击启动，请再次点击“开始录音”。",
  unsupported:
    "当前环境不支持录音。请在 macOS 15 或更高版本的最新版 Xpert Desktop 中打开会议。浏览器中仍可查看和编辑会议记录。",
  checkingCapture: "正在检查录音功能…",
  capture_unavailable:
    "无法连接录音功能。请在最新版 Xpert Desktop 中重新打开会议页面后重试，已保存的会议仍可访问。",
  forbidden:
    "当前工作区不允许此操作。请检查 Assistant 的插件授权，或联系管理员。",
  audio_permission_denied:
    "尚未获得音频权限。请在 macOS「系统设置 → 隐私与安全性」中，允许 Xpert Desktop 访问「麦克风」和「屏幕与系统音频录制」，然后重试；若系统提示，请重新打开 Desktop。",
  audio_source_missing: "未采集到完整音频，已有笔记已保留，请重新开始录音。",
  audio_conversion_failed: "音频转换失败，录音已停止，已有笔记已保留。",
  assistant_scheduling_failed: "Assistant 调度失败，请重试处理。",
  assistant_result_missing: "Assistant 未保存有效总结，请重试处理。",
  assistant_failed: "Assistant 处理失败，可打开会议对话查看。",
  assistant_dispatch_failed: "Assistant 启动失败，请检查已发布模型后重试。",
  assistant_timeout: "Assistant 处理超时，请检查会议对话后重试。",
  assistant_runtime_unavailable: "当前平台版本不支持后台 Assistant 任务。",
  summary_model_missing: "请为 Meetings Assistant 配置主模型并发布。",
  processing_failed: "处理失败，笔记和已完成的转写仍保留，可以重试。",
  device_lost: "音频设备已断开，已录制部分会保存。",
  disk_error: "无法在本地保存录音，录音已停止。",
  voice_active: "请先结束语音通话，再开始会议录音。",
  recording_active: "已有一场会议正在录音，请先结束该录音。",
  scope_changed: "账号或工作空间已切换，请在当前空间重新打开 Meetings。",
  upload_pending: "部分音频等待上传，请保持 Desktop 打开，或网络恢复后重试。",
  audio_signing_missing:
    "当前 Desktop 安装包缺少麦克风签名权限，请安装已修复签名的新版 App。",
  audio_permission_check_failed:
    "无法检查麦克风权限，请重启 Desktop 或安装最新版后重试。",
  system_audio_permission_denied:
    "请在 macOS「系统设置 → 隐私与安全性 → 屏幕与系统音频录制」中允许 Desktop 访问，然后重启 Desktop 再试。",
  blocked:
    "录音请求被宿主拦截，请在最新版 Desktop 中重新打开 Meetings 后重试。",
  emptySearch: "没有找到匹配的会议。",
  noteConflict: "刷新前，请先复制保留你的草稿。",
  actionText: "后续事项",
  notesChanged: "个人笔记在摘要生成后有过修改。",
  complete: "完成",
  recorded: "已录制",
};
export type Key = keyof typeof en;
export function translator(locale?: string) {
  const catalog = locale?.toLowerCase().startsWith("zh") ? zh : en;
  return (key: Key) => catalog[key];
}
export function errorText(error: unknown, t: (key: Key) => string) {
  const code = error instanceof Error ? error.message : "";
  return Object.hasOwn(en, code) ? t(code as Key) : t("error");
}
