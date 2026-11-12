import { afterEach, describe, expect, it, vi } from 'vitest'
import { configureRemoteDebug, debugBridge } from '../remote/debug.js'

afterEach(() => { configureRemoteDebug(); vi.restoreAllMocks() })

describe('remote debug privacy boundary', () => {
  it('stays silent by default and can be disabled after explicit host opt-in', () => {
    const output = vi.spyOn(console, 'debug').mockImplementation(() => {})
    debugBridge('init')
    expect(output).not.toHaveBeenCalled()
    configureRemoteDebug({ enabled: true })
    debugBridge('request', { kind: 'executeAction', pending: 1 })
    expect(output).toHaveBeenCalledExactlyOnceWith('[manufacturing-quotation]', 'request', { kind: 'executeAction', pending: 1 })
    configureRemoteDebug({ enabled: false })
    debugBridge('response')
    expect(output).toHaveBeenCalledTimes(1)
  })

  it('drops unknown strings, arbitrary payload fields and invalid counters', () => {
    const output = vi.spyOn(console, 'debug').mockImplementation(() => {})
    configureRemoteDebug({ enabled: true })
    const unsafe = { kind: 'synthetic-secret', pending: Number.NaN, token: 'synthetic-token', inquiry: 'synthetic-inquiry' }
    debugBridge('request', unsafe)
    expect(output).toHaveBeenCalledExactlyOnceWith('[manufacturing-quotation]', 'request', {})
  })
})
