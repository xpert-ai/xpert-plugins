export type ParsedWeComCliCommand = {
  commandTail: string
  argv: string[]
}

export function containsWeComCliReference(command: string, binaryPath: string): boolean {
  return /(^|[\s'"])wecom-cli(?=$|[\s'"])/.test(command) || command.includes(binaryPath)
}

export function parseWeComCliCommand(command: string, binaryPath: string): ParsedWeComCliCommand {
  const source = command.trim()
  if (!source) throw new Error('WeCom CLI command is empty.')
  assertSingleShellCommand(source)
  const tokens = parseShellTokens(source)
  const executable = tokens[0]
  if (!executable || (executable.value !== 'wecom-cli' && executable.value !== binaryPath)) {
    throw new Error(
      'Run WeCom operations as a direct `wecom-cli` command, without shell wrappers or environment prefixes.'
    )
  }
  const argv = tokens.slice(1).map((token) => token.value)
  if (argv[0]?.toLowerCase() === 'auth') {
    throw new Error(
      'Direct `wecom-cli auth` commands are blocked. Use `wecom_cli_auth_ensure`; connector authentication is platform-managed.'
    )
  }
  return {
    commandTail: source.slice(executable.end).trim(),
    argv
  }
}

export function isDirectSkillReadCommand(command: string, skillsDir: string): boolean {
  const source = command.trim()
  if (!source) return false
  try {
    assertSingleShellCommand(source)
    const tokens = parseShellTokens(source)
    if (!['cat', 'less', 'head', 'tail'].includes(tokens[0]?.value ?? '')) return false
    const normalizedSkillsDir = trimTrailingSlash(skillsDir)
    return tokens.slice(1).some((token) => {
      const value = trimTrailingSlash(token.value)
      return value.startsWith(`${normalizedSkillsDir}/`) && !value.split('/').includes('..')
    })
  } catch {
    return false
  }
}

type ShellToken = { value: string; end: number }

function assertSingleShellCommand(command: string): void {
  let quote: 'single' | 'double' | null = null
  let escaped = false
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]
    const next = command[index + 1]
    if (char === '\n' || char === '\r') throw new Error('WeCom CLI commands must be a single shell line.')
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\' && quote !== 'single') {
      escaped = true
      continue
    }
    if (char === "'" && quote !== 'double') {
      quote = quote === 'single' ? null : 'single'
      continue
    }
    if (char === '"' && quote !== 'single') {
      quote = quote === 'double' ? null : 'double'
      continue
    }
    if (quote === 'single') continue
    if (char === '`' || (char === '$' && next === '(')) {
      throw new Error('Shell command substitution is blocked for WeCom CLI commands.')
    }
    if (!quote && [';', '|', '&', '>', '<'].includes(char)) {
      throw new Error('Shell chaining, pipes, redirects, and background execution are blocked for WeCom CLI commands.')
    }
  }
  if (escaped || quote) throw new Error('WeCom CLI command contains an incomplete escape or quote.')
}

function parseShellTokens(command: string): ShellToken[] {
  const tokens: ShellToken[] = []
  let value = ''
  let inToken = false
  let quote: 'single' | 'double' | null = null
  let escaped = false
  for (let index = 0; index <= command.length; index += 1) {
    const char = command[index]
    if (escaped) {
      value += char
      inToken = true
      escaped = false
      continue
    }
    if (char === '\\' && quote !== 'single') {
      escaped = true
      inToken = true
      continue
    }
    if (char === "'" && quote !== 'double') {
      quote = quote === 'single' ? null : 'single'
      inToken = true
      continue
    }
    if (char === '"' && quote !== 'single') {
      quote = quote === 'double' ? null : 'double'
      inToken = true
      continue
    }
    if ((char === undefined || /\s/.test(char)) && !quote) {
      if (inToken) {
        tokens.push({ value, end: index })
        value = ''
        inToken = false
      }
      continue
    }
    value += char
    inToken = true
  }
  return tokens
}

function trimTrailingSlash(value: string): string {
  return value.length > 1 ? value.replace(/\/+$/, '') : value
}
