import type { TAgentRunnableConfigurable } from '@xpert-ai/contracts'
import { DEFAULT_WECOM_TIMEOUT_MS, SENSITIVE_FILTER_MIDDLEWARE_NAME } from './constants.js'
import type { AuditEntry, FilterMode, ResolvedWecomConfig, ResolvedWecomGroup } from './runtime-types.js'
import type { SensitiveRule, WecomNotifyConfig } from './types.js'
import { getErrorText, isRecord, toNonEmptyString, withTimeout } from './utils.js'

export function resolveRuntimeWecomConfig(config: WecomNotifyConfig | null | undefined): ResolvedWecomConfig | null {
  if (!isRecord(config) || config.enabled === false) {
    return null
  }

  const groups: ResolvedWecomGroup[] = []
  const drafts = Array.isArray(config.groups) ? config.groups : []
  for (const item of drafts) {
    if (!isRecord(item)) {
      continue
    }

    const webhookUrl = toNonEmptyString(item.webhookUrl)
    if (!webhookUrl) {
      continue
    }

    groups.push({
      webhookUrl,
    })
  }

  if (groups.length === 0) {
    return null
  }

  const timeoutMs =
    typeof config.timeoutMs === 'number' && Number.isFinite(config.timeoutMs) && config.timeoutMs > 0
      ? Math.min(Math.floor(config.timeoutMs), 120000)
      : DEFAULT_WECOM_TIMEOUT_MS

  return {
    groups,
    timeoutMs,
  }
}

export function buildMatchedNotificationMessage(input: {
  mode: FilterMode
  nodeTitle: string
  finalAction: 'pass' | 'block' | 'rewrite'
  records: AuditEntry[]
  runtimeConfigurable: TAgentRunnableConfigurable | null
  inputSnippet?: string
}): string {
  const modeLabel = input.mode === 'rule' ? '规则模式' : 'LLM 模式'
  const finalActionLabel =
    input.finalAction === 'block' ? '已拦截' : input.finalAction === 'rewrite' ? '已改写' : '放行'
  const phaseLabel = (phase: AuditEntry['phase']) => (phase === 'input' ? '输入' : '输出')
  const actionLabel = (action?: SensitiveRule['action']) => {
    if (action === 'block') {
      return '拦截'
    }
    if (action === 'rewrite') {
      return '改写'
    }
    return '未指定'
  }
  const sourceLabel = (source: AuditEntry['source']) => {
    if (source === 'rule') {
      return '规则'
    }
    if (source === 'llm') {
      return 'LLM'
    }
    return '异常兜底策略'
  }
  const reasonLabel = (reason?: string) => {
    if (!reason) {
      return '无'
    }
    if (reason === 'llm') {
      return 'LLM判定命中（模型未返回具体原因）'
    }
    if (reason.startsWith('llm:')) {
      return `LLM判定：${reason.replace('llm:', '') || '命中'}`
    }
    if (reason.startsWith('rule:')) {
      return `命中规则 ${reason.replace('rule:', '')}`
    }
    if (reason.startsWith('llm-error:')) {
      return `LLM判定异常: ${reason.replace('llm-error:', '')}`
    }
    if (reason.startsWith('llm-fail-open:')) {
      return `LLM故障放行: ${reason.replace('llm-fail-open:', '')}`
    }
    return reason
  }

  const matched = input.records.filter((entry) => entry.matched)
  const now = new Date()
  const alertTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(
    now.getSeconds(),
  ).padStart(2, '0')}`
  const lines: string[] = [
    '【敏感内容告警】',
    `节点：${input.nodeTitle || SENSITIVE_FILTER_MIDDLEWARE_NAME}`,
    `模式：${modeLabel}`,
    `处理结果：${finalActionLabel}`,
    `命中数量：${matched.length}`,
    `告警时间：${alertTime}`,
  ]

  if (input.runtimeConfigurable?.thread_id) {
    lines.push(`会话ID：${input.runtimeConfigurable.thread_id}`)
  }
  if (input.runtimeConfigurable?.executionId) {
    lines.push(`执行ID：${input.runtimeConfigurable.executionId}`)
  }
  if (input.inputSnippet?.trim()) {
    lines.push(`最近输入片段：${input.inputSnippet}`)
  }

  lines.push('命中详情：')
  matched.forEach((entry, index) => {
    lines.push(
      `${index + 1}. 阶段=${phaseLabel(entry.phase)}，来源=${sourceLabel(entry.source)}，动作=${actionLabel(entry.action)}，依据=${reasonLabel(entry.reason)}`,
    )
  })

  return lines.join('\n')
}

export async function dispatchWecomNotification(
  wecomConfig: ResolvedWecomConfig | null,
  message: string,
): Promise<void> {
  if (!wecomConfig || !message.trim()) {
    return
  }

  const payload: Record<string, unknown> = {
    msgtype: 'text',
    text: {
      content: message,
    },
  }

  for (const group of wecomConfig.groups) {
    try {
      const response = await withTimeout(
        fetch(group.webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }),
        wecomConfig.timeoutMs,
      )

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const body = await response.json().catch(() => null)
      const rawErrCode = isRecord(body) ? body['errcode'] : undefined
      const errCode = typeof rawErrCode === 'number' ? rawErrCode : Number(rawErrCode)
      if (!Number.isFinite(errCode) || errCode !== 0) {
        const errMsg = isRecord(body) ? String(body['errmsg'] ?? '') : 'unknown'
        throw new Error(`errcode=${String(rawErrCode ?? 'unknown')}, errmsg=${errMsg}`)
      }
    } catch (error) {
      // Notify failure should not break model execution.
      console.warn(
        `[${SENSITIVE_FILTER_MIDDLEWARE_NAME}] Failed to send WeCom notification to ${group.webhookUrl}: ${getErrorText(error)}`,
      )
    }
  }
}
