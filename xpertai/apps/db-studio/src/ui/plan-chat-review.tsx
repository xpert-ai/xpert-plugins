import { Button } from './controls'
import { command } from './bridge'
import { translate } from './i18n'
import type { Plan } from './model'

export function PlanChatReview({ plan, zh, disabled, protect, onRefresh }: {
  plan: Pick<Plan, 'id' | 'status'>
  zh: boolean
  disabled: boolean
  protect: (work: () => Promise<void>) => Promise<void>
  onRefresh: () => Promise<void>
}) {
  return <>
    <p className="muted">{translate(zh, 'plan_review_in_chat')}</p>
    <div className="toolbar">
      {['awaiting_approval', 'ready'].includes(plan.status) && <Button
        size="sm" disabled={disabled}
        onClick={() => void protect(async () => {
          await command('assistant.chat.send_message', {
            text: zh
              ? `请调用 db_studio_execute_plan 处理已有操作计划 ${plan.id}，在当前对话中请求审批并继续执行。不要创建重复计划。`
              : `Call db_studio_execute_plan for existing plan ${plan.id} to request approval in this conversation and continue execution. Do not create another plan.`,
          })
        })}
      >{translate(zh, 'plan_open_chat_review')}</Button>}
      <Button size="sm" onClick={() => void protect(onRefresh)}>
        {translate(zh, 'plan_refresh_status')}
      </Button>
    </div>
  </>
}
