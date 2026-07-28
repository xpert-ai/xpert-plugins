import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'

describe('OfficeCLI Workbench bundle', () => {
  it('mounts without unresolved JSX runtime globals', () => {
    const script = readFileSync(
      join(__dirname, 'remote-components', 'office-cli-workbench', 'app.js'),
      'utf8'
    )
    const render = jest.fn()
    const createElement = jest.fn((type, props) => ({ type, props }))
    const noop = () => undefined

    expect(() => runInNewContext(script, {
      window: {
        React: {
          Children: {},
          Fragment: 'fragment',
          createElement,
          useCallback: noop,
          useEffect: noop,
          useMemo: noop,
          useRef: () => ({ current: null }),
          useState: () => [undefined, noop]
        },
        ReactDOM: {
          createRoot: () => ({ render }),
          hydrateRoot: noop
        }
      },
      document: {
        getElementById: () => ({})
      },
      parent: {
        postMessage: noop
      },
      console,
      Map,
      Error,
      setTimeout,
      clearTimeout
    })).not.toThrow()
    expect(render).toHaveBeenCalledTimes(1)
    expect(script).toContain('OfficeCLI \\u539F\\u751F Office')
    expect(script).toContain('assistant.context.set')
    expect(script).toContain('delete_document')
    expect(script).toContain('\\u6C38\\u4E45\\u5220\\u9664')
    expect(script).toContain('preview-loading-indicator')
    expect(script).toContain('45 \\u79D2')
    expect(script).toContain('\\u7248\\u672C')
    expect(script).not.toContain('Ask Agent')
    expect(script).not.toContain('Run command')
  })
})
