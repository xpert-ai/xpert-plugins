/**
 * 状态徽标（蓝图 §8：六态软底/强字成对 + §6.6 文件态复用同规格色对）
 *
 * 徽标同时出现在列表行、详情头部与统计 pill 三处，保证同一状态跨区域视觉恒定；
 * 文字自述状态名（不只靠颜色），满足色弱可达性（§6.8）。
 */
import React from '../react-shim'
import type { CandidateStatus, UploadStatus } from '../types'

interface BadgeSpec {
  label: string
  tone: string
  icon?: string
  dot?: boolean
  spin?: boolean
  // 悬浮说明覆写：与 label 不同口径时（如合并进行态注明服务端职责）用它做 title
  hint?: string
}

// 候选人六态取值表：色对/图标逐项对齐蓝图 §8
function candidateSpec(status: CandidateStatus, timedOut: boolean): BadgeSpec {
  switch (status) {
    case 'pending_review':
      return { label: '待审', tone: 'tone-blue', dot: true }
    case 'accepted':
      return { label: '推进', tone: 'tone-green', icon: 'ri-arrow-right-up-line' }
    case 'hold':
      return { label: '待定', tone: 'tone-amber', icon: 'ri-pause-line' }
    case 'rejected':
      return { label: '淘汰', tone: 'tone-red', icon: 'ri-close-circle-line' }
    case 'failed':
      return { label: '失败', tone: 'tone-failed', icon: 'ri-error-warning-line' }
    default:
      // parsing 与竞态出现的 draft（按解析中呈现，§6.2）；超 10 分钟转琥珀「解析超时」（§6.4）
      return timedOut
        ? { label: '解析超时', tone: 'tone-amber', icon: 'ri-timer-line' }
        : { label: '解析中', tone: 'tone-blue', icon: 'ri-loader-4-line', spin: true }
  }
}

/**
 * 候选人状态徽标
 *
 * @param status 候选人六态（draft 竞态时上层已归一为 parsing）
 * @param timedOut 30s 心跳本地重算的解析超时判定（§6.4）
 * @param withAvatarMark 首字头像底色 = 状态强色（§8 辅助规则）需要时由上层读取 tone
 */
export function CandidateBadge({ status, timedOut = false }: { status: CandidateStatus; timedOut?: boolean }) {
  const spec = candidateSpec(status, timedOut)
  return (
    <span className={`rs-badge ${spec.tone}`} title={spec.label}>
      {spec.dot ? <span className="rs-badge-dot" /> : null}
      {spec.icon ? <i className={spec.spin ? `${spec.icon} rs-spin` : spec.icon} aria-hidden="true" /> : null}
      {spec.label}
    </span>
  )
}

// 状态强色 CSS 变量名：首字头像底色复用（§8：头像底 = 状态 fg 强色，白字）
export function statusAccent(status: CandidateStatus, timedOut = false): string {
  switch (status) {
    case 'pending_review':
    case 'parsing':
    case 'draft':
      return timedOut ? 'var(--rs-amber)' : 'var(--rs-blue)'
    case 'accepted':
      return 'var(--rs-green)'
    case 'hold':
      return 'var(--rs-amber)'
    case 'rejected':
      return 'var(--rs-red)'
    case 'failed':
      return '#b91c1c'
    default:
      return 'var(--rs-soft)'
  }
}

/**
 * 上传弹窗文件态徽标（§6.6 表 v4.2 收敛 5 态：排队中灰 / 上传中蓝 loader / 已创建绿 / 跳过(重复)弱色 / 失败红对）
 *
 * v4.2：字节传输与服务端校验/解析/落库同属一个请求往返，前端不可区分，「上传中」为唯一进行态；
 * 超 60s 无回执行尾「仍在处理，可稍后查看」提醒由上传弹窗行组件呈现，不影响徽标标签。
 * 失败徽标取 §8 v2 注「红对」（软底强字），不套候选人「失败」描边变体——文件态与候选人态色对各自独立。
 */
export function UploadBadge({ status }: { status: UploadStatus }) {
  const spec: BadgeSpec | null =
    status === 'queued'
      ? { label: '排队中', tone: 'tone-neutral' }
      : status === 'uploading'
        ? { label: '上传中', tone: 'tone-blue', icon: 'ri-loader-4-line', spin: true, hint: '上传并由服务端解析中' }
        : status === 'created'
          ? { label: '已创建', tone: 'tone-green', icon: 'ri-check-line' }
          : status === 'skipped'
            ? { label: '跳过(重复)', tone: 'tone-neutral' }
            : { label: '失败', tone: 'tone-red', icon: 'ri-error-warning-line' }
  if (!spec) return null
  return (
    <span className={`rs-badge ${spec.tone}`} title={spec.hint ?? spec.label}>
      {spec.icon ? <i className={spec.spin ? `${spec.icon} rs-spin` : spec.icon} aria-hidden="true" /> : null}
      {spec.label}
    </span>
  )
}
