import { startRemoteBridge } from './runtime'

it('retries only the ready handshake while the host changes scope, then stops on init and disposal', () => {
  const descriptors = ['window', 'parent', 'document'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const)
  const timers = new Map<number, { callback: () => void; delay: number }>()
  let sequence = 0
  let listener: (event: MessageEvent) => void = () => undefined
  const parent = { postMessage: jest.fn() }, context = jest.fn()
  Object.defineProperties(globalThis, {
    parent: { configurable: true, value: parent },
    document: { configurable: true, value: { body: { scrollHeight: 800 }, documentElement: { scrollHeight: 800 } } },
    window: { configurable: true, value: {
      setTimeout: (callback: () => void, delay: number) => { timers.set(++sequence, { callback, delay }); return sequence },
      clearTimeout: (id: number) => timers.delete(id),
      addEventListener: (_: string, handler: typeof listener) => { listener = handler }, removeEventListener: jest.fn()
    } }
  })
  const tick = () => { const [id, timer] = [...timers].find(([, timer]) => timer.delay === 1000)!; timers.delete(id); timer.callback() }
  const cleanup = startRemoteBridge(context, () => undefined)
  try {
    tick(); tick()
    expect(parent.postMessage.mock.calls.map(([message]) => message.type)).toEqual(['ready', 'ready', 'ready'])
    listener({ source: parent, data: { channel: 'xpertai.remote_component', protocolVersion: 1,
      type: 'init', instanceId: 'current-frame', scopeRevision: 2, locale: 'en-US' } } as unknown as MessageEvent)
    expect(context).toHaveBeenCalledWith(expect.objectContaining({ scopeRevision: 2, locale: 'en-US' }))
    expect([...timers.values()].filter(timer => timer.delay === 1000)).toHaveLength(0)
    cleanup()
    const dispose = startRemoteBridge(context, () => undefined)
    dispose()
    expect([...timers.values()].filter(timer => timer.delay === 1000)).toHaveLength(0)
  } finally {
    cleanup()
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})
