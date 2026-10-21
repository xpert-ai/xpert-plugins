import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { test } from 'node:test'
import { transformSync } from 'esbuild'
import { z } from 'zod/v3'
import { errorMessage } from '../remote-components/code-review/src/i18n.js'

function bridgeFixture() {
  const sent: { type: string; requestId?: string }[] = []
  const delays: number[] = []
  const parent = { postMessage(message: { type: string; requestId?: string }) { sent.push(message) } }
  let listener: ((event: { source: typeof parent; data: unknown }) => void) | undefined
  const module = { exports: {} as typeof import('../remote-components/code-review/src/bridge.js') }
  const source = readFileSync(new URL('../remote-components/code-review/src/bridge.ts', import.meta.url), 'utf8')
  runInNewContext(transformSync(source, { loader: 'ts', format: 'cjs' }).code, {
    module, exports: module.exports, clearTimeout,
    setTimeout(callback: () => void, delay: number) { delays.push(delay); return setTimeout(callback, delay) },
    require(id: string) {
      if (id === 'zod/v3') return { z }
      if (id === './theme') return { applyTheme() {} }
      throw new Error(`Unexpected import: ${id}`)
    },
    window: { parent, innerHeight: 800,
      addEventListener(_type: string, callback: typeof listener) { listener = callback },
      removeEventListener() { listener = undefined }
    }
  })
  const bridge = module.exports
  const disconnect = bridge.connect(() => {})
  const emit = (message: object) => listener?.({ source: parent, data: {
    channel: 'xpertai.remote_component', protocolVersion: 1, instanceId: 'instance', scopeRevision: 1, ...message
  } })
  emit({ type: 'init', manifest: { key: 'code-review' }, locale: 'zh-Hans' })
  return { sent, bridge, emit, disconnect, delays }
}

test('the real view bridge preserves host connection error codes for localized messages', async (t) => {
  const f = bridgeFixture()
  t.after(f.disconnect)
  for (const code of ['unsupported', 'connector_not_installed', 'workspace_management_required', 'connection_timeout']) {
    const pending = f.bridge.command('workspace.connector.connect', { provider: 'github' })
    assert.ok(f.delays.at(-1)! > 10 * 60 * 1000, 'the bridge must outlast the host authorization attempt')
    const rejected = assert.rejects(pending, new RegExp(code))
    f.emit({ type: 'clientCommandResult', requestId: f.sent.at(-1)?.requestId,
      result: { success: false, code, message: 'untrusted detailed response' } })
    await rejected
    assert.doesNotMatch(errorMessage(code, 'zh-Hans'), /操作失败，请刷新|untrusted/)
  }
})

test('connection results distinguish confirmed authorization from cancellation', async (t) => {
  const f = bridgeFixture()
  t.after(f.disconnect)
  for (const status of ['connected', 'cancelled']) {
    const pending = f.bridge.command('workspace.connector.connect', { provider: 'github' })
    f.emit({ type: 'clientCommandResult', requestId: f.sent.at(-1)?.requestId, result: { success: true, data: { status } } })
    assert.deepEqual(await pending, { status })
  }
})

test('switching workspace invalidates pending authorization and ignores its late completion', async (t) => {
  const f = bridgeFixture()
  t.after(f.disconnect)
  const pending = f.bridge.command('workspace.connector.connect', { provider: 'github' })
  const rejected = assert.rejects(pending, /context_changed/)
  const requestId = f.sent.at(-1)?.requestId
  f.emit({ type: 'hostEvent', event: { type: 'view.context.changed',
    data: { revision: 2, runtimeScope: { projectId: null, conversationId: 'another' } } } })
  f.emit({ type: 'clientCommandResult', requestId, result: { success: true, data: { status: 'connected' } } })
  await rejected
})

test('connection errors explain the next action instead of recommending a refresh', () => {
  for (const [code, zh, en] of [
    ['unsupported', /升级客户端.*Web/, /Update.*web/],
    ['command_unavailable', /升级客户端.*Web/, /Update.*web/],
    ['connector_not_installed', /安装 GitHub Connector/, /install the GitHub Connector/],
    ['workspace_management_required', /工作空间管理权限/, /workspace administrator/],
    ['forbidden', /无权.*管理员/, /permission.*administrator/],
    ['authentication_required', /重新登录/, /Sign in again/],
    ['connection_navigation_failed', /无法打开授权页面/, /Could not open/],
    ['connection_timeout', /超时.*授权结果/, /timed out.*authorization/],
    ['connection_failed', /网络.*授权页面/, /network.*authorization/],
    ['context_changed', /工作空间已切换/, /workspace changed/]
  ] as const) {
    assert.match(errorMessage(code, 'zh-Hans'), zh)
    assert.match(errorMessage(code, 'en-US'), en)
    assert.doesNotMatch(errorMessage(code, 'zh-Hans'), /操作失败，请刷新/)
  }
})
