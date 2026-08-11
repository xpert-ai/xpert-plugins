import {
  installThemeVariables,
  type RemoteThemeRoot
} from './runtime'

describe('Story Studio remote theme installation', () => {
  it('installs host tokens as xui variables including the border color', () => {
    const classes = new Set<string>()
    const variables = new Map<string, string>()
    const dataset: DOMStringMap = {}
    const root: RemoteThemeRoot = {
      classList: {
        toggle(name, force) {
          if (force) classes.add(name)
          else classes.delete(name)
          return classes.has(name)
        }
      },
      dataset,
      style: {
        setProperty(name, value) {
          variables.set(name, value ?? '')
        }
      }
    }

    installThemeVariables(
      {
        mode: 'dark',
        tokens: {
          colorBorder: 'oklch(0.42 0.02 280)',
          colorInput: 'oklch(0.46 0.02 280)',
          radiusMd: '0.5rem',
          ignoredFlag: true
        }
      },
      root
    )

    expect(classes.has('dark')).toBe(true)
    expect(dataset.theme).toBe('dark')
    expect(dataset.storyTheme).toBe('dark')
    expect(variables).toEqual(
      new Map([
        ['--xui-color-border', 'oklch(0.42 0.02 280)'],
        ['--xui-color-input', 'oklch(0.46 0.02 280)'],
        ['--xui-radius-md', '0.5rem']
      ])
    )

    installThemeVariables('light', root)
    expect(classes.has('dark')).toBe(false)
    expect(dataset.theme).toBe('light')
    expect(dataset.storyTheme).toBe('light')
  })
})
