import { configureCutDebug, cutDebug } from './remote-components/cut-workbench/src/debug.js'

describe('Cut Workbench debug logger', () => {
  const locationDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'location')

  afterEach(() => {
    configureCutDebug(null)
    jest.restoreAllMocks()
    restoreGlobalProperty('location', locationDescriptor)
  })

  it('uses host debug settings', () => {
    configureCutDebug({ enabled: true, production: false })
    const debug = jest.spyOn(console, 'debug').mockImplementation()

    expect(() => cutDebug.debug('bridge.request.completed', { requestId: '1' })).not.toThrow()
    expect(debug).toHaveBeenCalledWith('[cut-workbench] bridge.request.completed', { requestId: '1' })
  })

  it('keeps debug output disabled by default', () => {
    const debug = jest.spyOn(console, 'debug').mockImplementation()

    expect(() => cutDebug.debug('bridge.init')).not.toThrow()
    expect(debug).not.toHaveBeenCalled()
  })

  it('preserves the explicit query force-off override', () => {
    installLocationSearch('?xpertDebug=0')
    configureCutDebug({ enabled: true, production: false })
    const debug = jest.spyOn(console, 'debug').mockImplementation()

    cutDebug.debug('bridge.init')

    expect(debug).not.toHaveBeenCalled()
  })
})

function installLocationSearch(search: string) {
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { search }
  })
}

function restoreGlobalProperty(key: string, descriptor: PropertyDescriptor | undefined) {
  if (descriptor) {
    Object.defineProperty(globalThis, key, descriptor)
  } else {
    Reflect.deleteProperty(globalThis, key)
  }
}
