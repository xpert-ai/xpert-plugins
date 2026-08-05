import { createCanvasDebugLogger, redactDebugData, setCanvasDebugHostConfig } from './debug-logger.js'

describe('canvas debug logger', () => {
  const locationDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'location')

  afterEach(() => {
    setCanvasDebugHostConfig(null)
    restoreGlobalProperty('location', locationDescriptor)
    jest.restoreAllMocks()
  })

  it('does not print debug or info logs by default', () => {
    const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => undefined)
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined)

    const logger = createCanvasDebugLogger('canvas-workbench')
    logger.debug('toolEvent.normalized', { toolName: 'canvas_insert_image' })
    logger.info('loadData.start', { documentId: 'doc-1' })

    expect(debugSpy).not.toHaveBeenCalled()
    expect(infoSpy).not.toHaveBeenCalled()
  })

  it('prints info logs when enabled through query param', () => {
    installLocationSearch('?xpertDebug=canvas-workbench')
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined)

    const logger = createCanvasDebugLogger('canvas-workbench')
    logger.info('bridge.hostEvent.received', { source: 'chatkit' })

    expect(infoSpy).toHaveBeenCalledWith('[canvas-workbench] bridge.hostEvent.received', {
      source: 'chatkit'
    })
  })

  it('prints debug logs when enabled by host config', () => {
    setCanvasDebugHostConfig({
      enabled: true,
      production: false
    })
    const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => undefined)

    const logger = createCanvasDebugLogger('canvas-workbench')
    logger.debug('toolEvent.normalized', { toolName: 'canvas_insert_image' })

    expect(debugSpy).toHaveBeenCalledWith('[canvas-workbench] toolEvent.normalized', {
      toolName: 'canvas_insert_image'
    })
  })

  it('can disable host debug logs with a query override', () => {
    setCanvasDebugHostConfig({
      enabled: true,
      production: false
    })
    installLocationSearch('?xpertDebug=0')
    const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => undefined)

    const logger = createCanvasDebugLogger('canvas-workbench')
    logger.debug('toolEvent.normalized', { toolName: 'canvas_insert_image' })

    expect(debugSpy).not.toHaveBeenCalled()
  })

  it('redacts sensitive and large payload fields', () => {
    const data = redactDebugData({
      token: 'secret-token',
      tenantId: 'tenant-1',
      dataUrl: 'data:image/png;base64,abcdef',
      snapshot: {
        store: {
          'shape:1': { id: 'shape:1' },
          'asset:1': { id: 'asset:1' }
        }
      },
      buffer: new ArrayBuffer(8),
      ok: 'value'
    })

    expect(data).toEqual({
      token: '[redacted]',
      tenantId: '[redacted]',
      dataUrl: '[redacted:data-url length=28]',
      snapshot: {
        __summary: 'snapshot',
        recordCount: 2
      },
      buffer: '[ArrayBuffer byteLength=8]',
      ok: 'value'
    })
  })
})

function installLocationSearch(search: string) {
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: {
      search
    }
  })
}

function restoreGlobalProperty(key: string, descriptor: PropertyDescriptor | undefined) {
  if (descriptor) {
    Object.defineProperty(globalThis, key, descriptor)
  } else {
    Reflect.deleteProperty(globalThis, key)
  }
}
