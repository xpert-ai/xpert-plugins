/**
 * 处置动作条（蓝图 §3.6：按状态显隐编排，全部动作来自 manifest，UI 不臆造后端动作）
 *
 * 「淘汰」走 AlertDialog 轻确认（D3：可撤回语义，防误触不过度）；执行中按钮 disabled +
 * 「提交中…」，操作区 aria-busy。编辑态由详情区接管 footer（本组件仅浏览态渲染）。
 */
import React from '../react-shim'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button
} from '@xpert-ai/plugin-shadcn-ui'
import type { CandidateView } from '../types'

const { useState } = React

export type DispositionKey = 'accept_candidate' | 'hold_candidate' | 'reject_candidate' | 'reset_candidate' | 'retry_candidate'

interface ActionBarProps {
  candidate: CandidateView
  // 解析超时行也显示「重试」（M1-④/brief：failed 或 parsing 超时可见）
  timedOut: boolean
  busyKey: string | null
  onDispose: (key: DispositionKey) => Promise<void>
  onEdit: () => void
}

// 按钮编排表：key/文案/variant/图标/显隐判定，逐行对应 §3.6 表格
const BUTTONS: Array<{
  key: DispositionKey | 'edit'
  label: string
  variant: 'default' | 'outline' | 'ghost'
  destructive?: boolean
  icon: string
  visible: (candidate: CandidateView, timedOut: boolean) => boolean
}> = [
  {
    key: 'accept_candidate',
    label: '推进',
    variant: 'default',
    icon: 'ri-arrow-right-up-line',
    // §3.6 表：推进在 pending_review / hold / rejected / failed 可见（解析中行无分数不可处置）
    visible: (c) => c.status === 'pending_review' || c.status === 'hold' || c.status === 'rejected' || c.status === 'failed'
  },
  { key: 'hold_candidate', label: '待定', variant: 'outline', icon: 'ri-pause-line', visible: (c) => c.status === 'pending_review' },
  { key: 'reject_candidate', label: '淘汰', variant: 'outline', destructive: true, icon: 'ri-close-circle-line', visible: (c) => c.status === 'pending_review' || c.status === 'hold' },
  { key: 'reset_candidate', label: '撤回为待审', variant: 'ghost', icon: 'ri-arrow-go-back-line', visible: (c) => c.status === 'accepted' || c.status === 'hold' || c.status === 'rejected' },
  { key: 'edit', label: '编辑', variant: 'ghost', icon: 'ri-edit-2-line', visible: (c) => c.status === 'pending_review' },
  { key: 'retry_candidate', label: '重试', variant: 'outline', icon: 'ri-restart-line', visible: (c, t) => c.status === 'failed' || (c.status === 'parsing' && t) }
]

export function ActionBar({ candidate, timedOut, busyKey, onDispose, onEdit }: ActionBarProps) {
  const [confirmReject, setConfirmReject] = useState(false)
  const visible = BUTTONS.filter((button) => button.visible(candidate, timedOut))
  const busy = busyKey !== null

  async function run(key: DispositionKey) {
    await onDispose(key)
  }

  return (
    <footer className="rs-detail-foot" aria-busy={busy}>
      {visible.map((button) => {
        const isBusy = busyKey === button.key
        return (
          <Button
            key={button.key}
            variant={button.variant}
            size="sm"
            disabled={busy}
            className={button.destructive ? 'rs-action-destructive' : undefined}
            onClick={() => {
              if (button.key === 'edit') {
                onEdit()
                return
              }
              // 淘汰为终态感操作：先轻确认再执行（D3）
              if (button.key === 'reject_candidate') {
                setConfirmReject(true)
                return
              }
              void run(button.key as DispositionKey)
            }}
          >
            <i className={button.icon} aria-hidden="true" />
            {isBusy ? '提交中…' : button.label}
          </Button>
        )
      })}
      <AlertDialog
        open={confirmReject}
        onOpenChange={(open) => {
          if (!busy) setConfirmReject(open)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>淘汰该候选人？</AlertDialogTitle>
            <AlertDialogDescription>该候选人将标记为淘汰，可撤回。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {/* 组件库类型要求显式 variant/size（包内 Pick 约束），取消=outline、确认=红强调（D3 轻确认） */}
            <AlertDialogCancel variant="outline" size="sm">
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              variant="default"
              size="sm"
              className="rs-reject-confirm-action"
              onClick={() => {
                setConfirmReject(false)
                void run('reject_candidate')
              }}
            >
              淘汰
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </footer>
  )
}
