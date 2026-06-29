import { createCanvasDebugLogger, redactDebugData, setCanvasDebugHostConfig } from './debug-logger.js'

const LOCAL_STORAGE_KEY = 'xpert.debug.canvas-workbench'

describe('canvas debug logger', () => {
  const localStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const locationDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'location')
  const parentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'parent')
  const topDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'top')

  afterEach(() => {
    setCanvasDebugHostConfig(null)
    restoreGlobalProperty('localStorage', localStorageDescriptor)
    restoreGlobalProperty('location', locationDescriptor)
    restoreGlobalProperty('parent', parentDescriptor)
    restoreGlobalProperty('top', topDescriptor)
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

  it('prints debug logs when enabled through localStorage', () => {
    installLocalStorage(LOCAL_STORAGE_KEY, '1')
    const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => undefined)

    const logger = createCanvasDebugLogger('canvas-workbench')
    logger.debug('toolEvent.normalized', { toolName: 'canvas_insert_image' })

    expect(debugSpy).toHaveBeenCalledWith('[canvas-workbench] toolEvent.normalized', {
      toolName: 'canvas_insert_image'
    })
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

  it('can disable host debug logs with a storage flag', () => {
    setCanvasDebugHostConfig({
      enabled: true,
      production: false
    })
    installLocalStorage(LOCAL_STORAGE_KEY, '0')
    const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => undefined)

    const logger = createCanvasDebugLogger('canvas-workbench')
    logger.debug('toolEvent.normalized', { toolName: 'canvas_insert_image' })

    expect(debugSpy).not.toHaveBeenCalled()
  })

  it('prints debug logs when enabled through a parent window storage flag', () => {
    const parentStorage = createMemoryStorage()
    parentStorage.setItem(LOCAL_STORAGE_KEY, '1')
    installParentWindow({ localStorage: parentStorage })
    const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => undefined)

    const logger = createCanvasDebugLogger('canvas-workbench')
    logger.debug('bridge.hostEvent.received', { toolName: 'canvas_insert_image' })

    expect(debugSpy).toHaveBeenCalledWith('[canvas-workbench] bridge.hostEvent.received', {
      toolName: 'canvas_insert_image'
    })
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

function installLocalStorage(key: string, value: string) {
  const storage = createMemoryStorage()
  storage.setItem(key, value)
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage
  })
}

function installLocationSearch(search: string) {
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: {
      search
    }
  })
}

function installParentWindow(parent: { localStorage: Storage }) {
  Object.defineProperty(globalThis, 'parent', {
    configurable: true,
    value: parent
  })
  Object.defineProperty(globalThis, 'top', {
    configurable: true,
    value: parent
  })
}

function createMemoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear() {
      values.clear()
    },
    getItem(key: string) {
      return values.get(key) ?? null
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null
    },
    removeItem(key: string) {
      values.delete(key)
    },
    setItem(key: string, value: string) {
      values.set(key, value)
    }
  }
}

function restoreGlobalProperty(key: string, descriptor: PropertyDescriptor | undefined) {
  if (descriptor) {
    Object.defineProperty(globalThis, key, descriptor)
  } else {
    Reflect.deleteProperty(globalThis, key)
  }
}
