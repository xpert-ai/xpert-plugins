import { configureCutDebug, cutDebug } from './remote-components/cut-workbench/src/debug.js'

describe('Cut Workbench debug logger', () => {
  const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

  afterEach(() => {
    configureCutDebug(null)
    jest.restoreAllMocks()
    if (originalLocalStorage) {
      Object.defineProperty(globalThis, 'localStorage', originalLocalStorage)
    } else {
      delete (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage
    }
  })

  it('uses host debug settings when sandboxed localStorage access throws', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('Storage is unavailable for an opaque origin.', 'SecurityError')
      }
    })
    configureCutDebug({ enabled: true, production: false })
    const debug = jest.spyOn(console, 'debug').mockImplementation()

    expect(() => cutDebug.debug('bridge.request.completed', { requestId: '1' })).not.toThrow()
    expect(debug).toHaveBeenCalledWith('[cut-workbench] bridge.request.completed', { requestId: '1' })
  })

  it('keeps debug output disabled by default when sandboxed localStorage access throws', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('Storage is unavailable for an opaque origin.', 'SecurityError')
      }
    })
    const debug = jest.spyOn(console, 'debug').mockImplementation()

    expect(() => cutDebug.debug('bridge.init')).not.toThrow()
    expect(debug).not.toHaveBeenCalled()
  })

  it('preserves the explicit localStorage force-off override', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: jest.fn(() => '0')
      }
    })
    configureCutDebug({ enabled: true, production: false })
    const debug = jest.spyOn(console, 'debug').mockImplementation()

    cutDebug.debug('bridge.init')

    expect(debug).not.toHaveBeenCalled()
  })
})
