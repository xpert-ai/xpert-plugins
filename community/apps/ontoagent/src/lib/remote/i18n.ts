const en = {
  title: 'OntoAgent Governed Workbench',
  subtitle: 'Ontology source, versioned terms, packet transfers, and answer review.',
  overview: 'Overview',
  terms: 'Term Catalogue',
  answers: 'Answer Review',
  transfers: 'Packet Transfers',
  sync: 'Sync / Retry',
  syncing: 'Syncing…',
  seed: 'Load demo ontology',
  seeding: 'Loading demo…',
  contextSource: 'Context source',
  localVersion: 'Ontology version',
  localAssertions: 'Ontology assertions',
  localTerms: 'Catalogue terms',
  transferTotal: 'Transfers',
  transferPending: 'Pending transfers',
  noTransfers: 'No packet transfers yet.',
  sender: 'Sender',
  recipient: 'Recipient',
  depth: 'Depth',
  packetHash: 'Packet hash',
  noLocalTerms: 'No ontology terms yet. Load the demo ontology or import your own.',
  refresh: 'Refresh',
  loading: 'Loading…',
  mirrorVersion: 'mirrorVersion',
  sourceDigest: 'sourceDigest',
  assertionCount: 'Assertions',
  stale: 'stale',
  upToDate: 'up-to-date',
  missingSnapshot: 'No snapshot yet. Configure Auto-Ontology credentials and run Sync.',
  lastError: 'Last error',
  excluded: 'Excluded (uncertified / incomplete)',
  unsupported: 'Unsupported',
  recentRuns: 'Recent sync runs',
  noRuns: 'No sync runs yet.',
  noTerms: 'No certified terms in the mirror.',  noAnswers: 'No answer records yet. Ask the assistant first.',
  search: 'Search',
  searchPlaceholder: 'Search term id, label, alias…',
  previous: 'Previous',
  next: 'Next',
  pageInfo: 'Page {page} · {total} total',
  status: 'Status',
  all: 'All',
  proposed: 'proposed',
  confirmed: 'confirmed',
  rejected: 'rejected',
  term: 'Term',
  aliases: 'Aliases',
  createdAt: 'Created at',
  question: 'Question',
  answer: 'Answer',
  showMore: 'Show more',
  showLess: 'Show less',
  retrieval: 'Retrieval',
  confirm: 'Confirm',
  reject: 'Reject',
  reviewCommentPlaceholder: 'Optional review comment…',
  actionDone: 'Done',
  actionFailed: 'Action failed',
  attempts: 'attempts'
}
export type MessageKey = keyof typeof en

const zh: Record<MessageKey, string> = {
  title: 'OntoAgent 受治理工作台',
  subtitle: '本体来源、版本化术语、Packet 转交与回答审核。',
  overview: '总览',
  terms: '术语目录',
  answers: '回答审核',
  transfers: 'Packet 转交',
  sync: '同步 / 重试',
  syncing: '同步中…',
  seed: '加载示例本体',
  seeding: '加载中…',
  contextSource: '本体来源',
  localVersion: '本体版本',
  localAssertions: '本体断言数',
  localTerms: '目录术语数',
  transferTotal: '转交总数',
  transferPending: '待领取转交',
  noTransfers: '暂无 Packet 转交。',
  sender: '发送方',
  recipient: '接收方',
  depth: '深度',
  packetHash: 'Packet 摘要',
  noLocalTerms: '尚无本体术语；请加载示例本体或导入自有本体。',
  refresh: '刷新',
  loading: '加载中…',
  mirrorVersion: '镜像版本',
  sourceDigest: '来源摘要',
  assertionCount: '断言数',
  stale: '过期（stale）',
  upToDate: '最新',
  missingSnapshot: '尚未同步快照。请配置 Auto-Ontology 凭证后执行同步。',
  lastError: '最近错误',
  excluded: '排除项（未认证/不完整）',
  unsupported: '不支持项',
  recentRuns: '最近同步记录',
  noRuns: '暂无同步记录。',
  noTerms: '镜像中暂无认证术语。',
  noAnswers: '暂无回答记录，请先在助手中提问。',
  search: '搜索',
  searchPlaceholder: '搜索术语 ID、名称、别名…',
  previous: '上一页',
  next: '下一页',
  pageInfo: '第 {page} 页 · 共 {total} 条',
  status: '状态',
  all: '全部',
  proposed: '待确认',
  confirmed: '已采纳',
  rejected: '已拒绝',
  term: '术语',
  aliases: '别名',
  createdAt: '创建时间',
  question: '问题',
  answer: '回答',
  showMore: '展开',
  showLess: '收起',
  retrieval: '检索',
  confirm: '确认采纳',
  reject: '拒绝',
  reviewCommentPlaceholder: '审核备注（可选）…',
  actionDone: '操作完成',
  actionFailed: '操作失败',
  attempts: '次尝试'
}

export const catalogs = { 'en-US': en, 'zh-Hans': zh }
type Locale = keyof typeof catalogs
let locale: Locale = 'zh-Hans'

export function configureLocale(value: string | undefined) {
  const aliases: Record<string, Locale> = {
    en: 'en-US', en_US: 'en-US', 'en-US': 'en-US',
    zh: 'zh-Hans', zh_Hans: 'zh-Hans', 'zh-Hans': 'zh-Hans', 'zh-CN': 'zh-Hans', zh_CN: 'zh-Hans'
  }
  locale = (value && aliases[value]) || 'zh-Hans'
  document.documentElement.lang = locale
}

export function currentLocale() {
  return locale
}

export function t(key: MessageKey, values: Record<string, string | number> = {}) {
  return catalogs[locale][key].replace(/\{(\w+)\}/g, (_match, name: string) => String(values[name] ?? ''))
}

export function formatTime(value: string | Date | undefined) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(date)
}
