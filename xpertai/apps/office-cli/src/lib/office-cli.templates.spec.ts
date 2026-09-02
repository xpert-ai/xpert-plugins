import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('OfficeCLI assistant template', () => {
  it('enables the sandbox and connects the common execution middlewares to the Agent', () => {
    const dsl = readFileSync(join(__dirname, '..', 'xpert-office-cli-assistant.yaml'), 'utf8')
    const middlewares = [
      ['Middleware_WebTools', 'WebTools'],
      ['Middleware_SandboxFile', 'SandboxFile'],
      ['Middleware_SandboxShell', 'SandboxShell'],
      ['Middleware_LoopGuard', 'LoopGuardMiddleware'],
      ['Middleware_ModelRetry', 'ModelRetryMiddleware'],
      ['Middleware_ViewImage', 'ViewImageMiddleware']
    ]

    expect(dsl).toContain('provider: docker-sandbox')
    for (const [key, provider] of middlewares) {
      expect(dsl).toContain(`provider: ${provider}`)
      expect(dsl).toContain([
        `    key: Agent_OfficeCLI/${key}`,
        '    from: Agent_OfficeCLI',
        `    to: ${key}`
      ].join('\n'))
    }
  })
})
