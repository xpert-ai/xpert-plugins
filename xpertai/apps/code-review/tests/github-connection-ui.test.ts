import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { setImmediate } from 'node:timers/promises'
import { test } from 'node:test'
import { transformSync } from 'esbuild'
import { z } from 'zod/v3'
import { githubConnectionSchema } from '../src/github-connection.js'
import type { Host } from '../remote-components/code-review/src/bridge.js'

const host: Host = { instanceId: 'view', scopeRevision: 1, manifest: { key: 'code-review' } }

// Exercise the real hook across mount/unmount and async completion without a browser session.
function fixture() {
  let cursor = 0, currentHost: Host | null = host
  const values: unknown[] = []
  const callbacks = new Map<number, { deps: unknown[]; value: unknown }>()
  const effects = new Map<number, { deps: unknown[]; cleanup?: () => void }>()
  const pendingEffects: (() => void)[] = []
  const requests: { resolve: (value: unknown) => void; reject: (error: Error) => void }[] = []
  const same = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((value, i) => Object.is(value, b[i]))
  const react = {
    useState<T>(initial: T) {
      const index = cursor++
      if (!(index in values)) values[index] = initial
      return [values[index] as T, (value: T) => { values[index] = value }] as const
    },
    useRef<T>(initial: T) {
      const index = cursor++
      if (!(index in values)) values[index] = { current: initial }
      return values[index] as { current: T }
    },
    useCallback<T>(value: T, deps: unknown[]) {
      const index = cursor++, old = callbacks.get(index)
      if (old && same(old.deps, deps)) return old.value as T
      callbacks.set(index, { deps, value })
      return value
    },
    useEffect(effect: () => (() => void), deps: unknown[]) {
      const index = cursor++, old = effects.get(index)
      if (old && same(old.deps, deps)) return
      pendingEffects.push(() => { old?.cleanup?.(); effects.set(index, { deps, cleanup: effect() }) })
    }
  }
  const module = { exports: {} as typeof import('../remote-components/code-review/src/use-github-connection.js') }
  const source = readFileSync(new URL('../remote-components/code-review/src/use-github-connection.ts', import.meta.url), 'utf8')
  runInNewContext(transformSync(source, { loader: 'ts', format: 'cjs' }).code, {
    module, exports: module.exports,
    require(id: string) {
      if (id === 'react') return react
      if (id === 'zod/v3') return { z }
      if (id === '../../../src/github-connection') return { githubConnectionSchema }
      if (id === './bridge') return { data(query: unknown) {
        assert.equal(JSON.stringify(query), JSON.stringify({ parameters: { githubConnection: true } }))
        return new Promise((resolve, reject) => requests.push({ resolve, reject }))
      } }
      throw new Error(`Unexpected import: ${id}`)
    }
  })
  function render(next = currentHost) {
    currentHost = next; cursor = 0
    const result = module.exports.useGitHubConnection(currentHost)
    for (const effect of pendingEffects.splice(0)) effect()
    return result
  }
  return { render, requests, unmount() { for (const effect of effects.values()) effect.cleanup?.() } }
}

test('fresh mounts load the saved GitHub account without requiring another authorization click', async () => {
  for (let reload = 0; reload < 2; reload++) {
    const f = fixture()
    assert.equal(f.render().connection.status, 'loading')
    assert.equal(f.requests.length, 1)
    f.requests[0].resolve({ meta: { connection: { status: 'connected', login: 'tiven-w' } } })
    await setImmediate()
    const connection = f.render().connection
    assert.equal(connection.status, 'connected')
    if (connection.status === 'connected') assert.equal(connection.login, 'tiven-w')
    f.unmount()
  }
})

test('refresh replaces the account and clears stale identity on failure or disconnection', async () => {
  const f = fixture()
  f.render()
  f.requests[0].resolve({ meta: { connection: { status: 'connected', login: 'first' } } })
  await setImmediate()
  for (const status of ['connected', 'unavailable', 'disconnected'] as const) {
    const pending = f.render().refresh()
    assert.equal(f.render().connection.status, 'loading')
    if (status === 'unavailable') f.requests.at(-1)!.reject(new Error('request failed'))
    else f.requests.at(-1)!.resolve({ meta: { connection: status === 'connected' ? { status, login: 'second' } : { status } } })
    await pending
    const connection = f.render().connection
    assert.equal(connection.status, status)
    if (connection.status === 'connected') assert.equal(connection.login, 'second')
    else assert.equal('login' in connection, false)
  }
  f.unmount()
})

test('workspace changes discard late results and late authorization refreshes from the old host', async () => {
  const f = fixture()
  const previous = f.render()
  const nextHost = { ...host, scopeRevision: 2 }
  assert.equal(f.render(nextHost).connection.status, 'loading')
  await previous.refresh()
  assert.equal(f.requests.length, 2)
  f.requests[1].resolve({ meta: { connection: { status: 'connected', login: 'new-workspace' } } })
  await setImmediate()
  f.requests[0].resolve({ meta: { connection: { status: 'connected', login: 'old-workspace' } } })
  await setImmediate()
  const connection = f.render().connection
  assert.equal(connection.status, 'connected')
  if (connection.status === 'connected') assert.equal(connection.login, 'new-workspace')
  f.unmount()
})
