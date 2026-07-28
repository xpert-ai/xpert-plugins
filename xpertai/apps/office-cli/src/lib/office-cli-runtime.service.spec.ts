jest.mock('@xpert-ai/plugin-sdk', () => ({
  pluginArtifactTableName: (namespace: string, key: string) => `${namespace}_${key}`
}))

import {
  assertSupportedCommand,
  extensionFromFileName,
  injectSelectionBridge,
  isWriteCommand,
  resolveOfficeCliCacheRoot,
  validateArguments,
  validateCommandArguments
} from './office-cli-runtime.service.js'

describe('OfficeCliRuntimeService guards', () => {
  it('classifies mutating commands explicitly', () => {
    expect(isWriteCommand('set')).toBe(true)
    expect(isWriteCommand('batch')).toBe(true)
    expect(isWriteCommand('import')).toBe(true)
    expect(isWriteCommand('view')).toBe(false)
  })

  it('rejects environment-management commands', () => {
    expect(() => assertSupportedCommand('install')).toThrow('Unsupported OfficeCLI document command')
    expect(() => assertSupportedCommand('mcp')).toThrow('Unsupported OfficeCLI document command')
    expect(() => assertSupportedCommand('watch')).toThrow('Unsupported OfficeCLI document command')
  })

  it('reserves file output flags for the runtime', () => {
    expect(() => validateArguments(['/slide[1]', '-o', '/tmp/file'], false)).toThrow('managed by the plugin runtime')
    expect(() => validateArguments(['/Sheet1', '--file', '/tmp/input.csv'], false)).toThrow('managed by the plugin runtime')
    expect(() => validateArguments(['/body/p[1]', '--save', '/tmp/payload.bin'], false)).toThrow('managed by the plugin runtime')
    expect(() => validateArguments(['/slide[1]', '--prop', 'fill=red'], false)).not.toThrow()
  })

  it('prevents property-based host file and network access', () => {
    expect(() => validateArguments(['/slide[1]', '--prop', 'src=/etc/passwd'], false))
      .toThrow('must use an inline data URI')
    expect(() => validateArguments(['/slide[1]', '--prop', 'src=https://example.com/image.png'], false))
      .toThrow('must use an inline data URI')
    expect(() => validateArguments(['/slide[1]', '--prop', 'src=data:image/png;base64,AA=='], false))
      .not.toThrow()
    expect(() => validateArguments(['/Sheet1/pivottable[1]', '--prop', 'src=Sheet1!A1:D10'], false))
      .not.toThrow()
    expect(() => validateArguments(['/body/p[1]', '--prop', 'text=https://xpertai.cn'], false))
      .not.toThrow()
  })

  it('accepts only stdin-based tabular imports', () => {
    expect(() => validateCommandArguments(
      'import',
      ['/Sheet1', '--stdin', '--format', 'csv', '--header'],
      'Name,Score\nAda,98'
    )).not.toThrow()
    expect(() => validateCommandArguments('import', ['/Sheet1', '/tmp/input.csv'], null))
      .toThrow('must use --stdin')
  })

  it('accepts only inline JSON merge data', () => {
    expect(() => validateCommandArguments('merge', ['--data', '{"name":"Ada"}'], null)).not.toThrow()
    expect(() => validateCommandArguments('merge', ['--data', '/tmp/data.json'], null))
      .toThrow('must be inline JSON')
  })

  it('accepts only native Office Open XML extensions', () => {
    expect(extensionFromFileName('report.DOCX')).toBe('docx')
    expect(() => extensionFromFileName('report.pdf')).toThrow('supports only')
  })

  it('uses a persistent per-user cache instead of the operating-system temp directory', () => {
    expect(resolveOfficeCliCacheRoot({
      env: {},
      platform: 'darwin',
      homeDirectory: '/Users/example'
    })).toBe('/Users/example/Library/Caches/xpert/office-cli/v1.0.142')
    expect(resolveOfficeCliCacheRoot({
      env: { XDG_CACHE_HOME: '/var/cache/example' },
      platform: 'linux',
      homeDirectory: '/home/example'
    })).toBe('/var/cache/example/xpert/office-cli/v1.0.142')
    expect(resolveOfficeCliCacheRoot({
      env: { OFFICECLI_CACHE_DIR: '/persistent/officecli' },
      platform: 'linux',
      homeDirectory: '/home/example'
    })).toBe('/persistent/officecli')
  })

  it('injects a visible inline editor and save bridge into OfficeCLI previews', () => {
    const html = injectSelectionBridge('<html><body><div data-path="/Sheet1/A1">原始内容</div></body></html>')
    expect(html).toContain('id="xpert-officecli-inline-editor"')
    expect(html).toContain('直接编辑')
    expect(html).toContain("type: 'save'")
    expect(html).toContain("type !== 'save-result'")
    expect(html).toContain('</body>')
  })
})
