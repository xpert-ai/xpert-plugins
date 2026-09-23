import {
  containsWeComCliReference,
  isDirectSkillReadCommand,
  parseWeComCliCommand
} from './wecom-cli-command-policy.js'

describe('WeCom CLI command policy', () => {
  const binaryPath = '/workspace/.xpert/tools/wecom-cli/bin/wecom-cli'

  it('accepts a direct command and preserves quoted JSON arguments', () => {
    const parsed = parseWeComCliCommand('wecom-cli message send --text "hello; world"', binaryPath)
    expect(parsed).toEqual({
      commandTail: 'message send --text "hello; world"',
      argv: ['message', 'send', '--text', 'hello; world']
    })
  })

  it('accepts the managed absolute binary path', () => {
    expect(parseWeComCliCommand(`${binaryPath} --version`, binaryPath).argv).toEqual(['--version'])
  })

  it.each([
    'wecom-cli auth show --status',
    'wecom-cli message list && cat /etc/passwd',
    'wecom-cli message list | tee output',
    'wecom-cli message send > output',
    'wecom-cli message list $(touch /tmp/side-effect)',
    "sh -c 'wecom-cli message list'",
    'env WECOM_CLI_CONFIG_DIR=/tmp/other wecom-cli message list'
  ])('rejects unsafe or bypass commands: %s', (command) => {
    expect(() => parseWeComCliCommand(command, binaryPath)).toThrow()
  })

  it('identifies references that must not bypass the policy', () => {
    expect(containsWeComCliReference("sh -c 'wecom-cli message list'", binaryPath)).toBe(true)
    expect(containsWeComCliReference('/workspace/.xpert/skills/wecom-cli/SKILL.md', binaryPath)).toBe(false)
    expect(containsWeComCliReference('echo hello', binaryPath)).toBe(false)
  })

  it('allows only direct single-command reads of official Skill files', () => {
    const skillsDir = '/workspace/.xpert/skills/wecom-cli'
    expect(isDirectSkillReadCommand(`cat ${skillsDir}/wecomcli-message/SKILL.md`, skillsDir)).toBe(true)
    expect(isDirectSkillReadCommand(`head -n 40 '${skillsDir}/wecomcli-shared/SKILL.md'`, skillsDir)).toBe(true)
    expect(isDirectSkillReadCommand(`cat ${skillsDir}/../secrets/auth.json`, skillsDir)).toBe(false)
    expect(isDirectSkillReadCommand(`cat ${skillsDir}/wecomcli-message/SKILL.md; env`, skillsDir)).toBe(false)
    expect(isDirectSkillReadCommand(`sh -c 'cat ${skillsDir}/wecomcli-message/SKILL.md'`, skillsDir)).toBe(false)
  })
})
