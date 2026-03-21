import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { posix as path } from 'node:path'
import {
  BaseSandbox,
  type IPluginConfigResolver,
  PLUGIN_CONFIG_RESOLVER_TOKEN
} from '@xpert-ai/plugin-sdk'
import { Inject, Injectable, Optional } from '@nestjs/common'
import {
  DEFAULT_MINERU_SECRET_ENV_PATH,
  DEFAULT_MINERU_STAMP_PATH,
  DEFAULT_MINERU_WRAPPER_PATH,
  MINERU_BOOTSTRAP_SCHEMA_VERSION,
  MINERU_SKILLS_VERSION,
  MinerUConfig,
  MinerUConfigSchema
} from './mineru.types.js'
import { MinerUPluginName } from './types.js'
import { getSkillAssets, type MinerUSkillAsset } from './skills/index.js'

type MinerUBootstrapBackend = Pick<BaseSandbox, 'execute' | 'uploadFiles'>

type MinerUBootstrapStamp = {
  tool?: string
  bootstrapVersion?: number
  skillsVersion?: string
  secretFingerprint?: string
  installedAt?: string
}

@Injectable()
export class MinerUBootstrapService {
  constructor(
    @Optional()
    @Inject(PLUGIN_CONFIG_RESOLVER_TOKEN)
    private readonly pluginConfigResolver?: IPluginConfigResolver
  ) {}

  resolveConfig(config?: Partial<MinerUConfig>): MinerUConfig {
    const defaults = {
      skillsDir: process.env['MINERU_SKILLS_DIR'],
      wrapperPath: process.env['MINERU_WRAPPER_PATH']
    }
    const pluginConfig =
      this.pluginConfigResolver?.resolve<Partial<MinerUConfig>>(MinerUPluginName, {
        defaults
      }) ?? {}

    return MinerUConfigSchema.parse({
      ...defaults,
      ...pluginConfig,
      ...(config ?? {})
    })
  }

  getStampPath() {
    return DEFAULT_MINERU_STAMP_PATH
  }

  getSecretEnvPath() {
    return DEFAULT_MINERU_SECRET_ENV_PATH
  }

  getRunnerPath(config: Pick<MinerUConfig, 'skillsDir'>) {
    return path.join(config.skillsDir, 'scripts/mineru_runner.py')
  }

  buildSystemPrompt(config: MinerUConfig): string {
    return [
      'The `mineru` command is available in the sandbox through a managed wrapper.',
      'Always run MinerU via the `sandbox_shell` tool using the `mineru` command.',
      `Before your first use, read the skill file at \`${config.skillsDir}/SKILL.md\` with \`cat ${config.skillsDir}/SKILL.md\`.`,
      'Do not export API keys manually and do not pass tokens on the command line unless the user explicitly asks.',
      '',
      'PREFER:',
      '- `mineru --file ./document.pdf --output ./output/`',
      '- `mineru --dir ./docs --output ./output --workers 4 --resume`',
      '',
      'GUIDELINES:',
      '- Inspect generated Markdown before summarizing results.',
      '- Use `--resume` for large directories.',
      '- The command downloads result archives and writes `full.md` under the chosen output directory.',
      '',
      `For API details read \`${config.skillsDir}/references/api_reference.md\`.`
    ].join('\n')
  }

  isMinerUCommand(command: string): boolean {
    const firstToken = getFirstCommandToken(command)
    return firstToken === 'mineru' || firstToken.endsWith('/mineru')
  }

  rewriteCommand(command: string, wrapperPath: string): string {
    const firstToken = getFirstCommandToken(command)
    if (firstToken === wrapperPath) {
      return command
    }
    if (firstToken === 'mineru' || firstToken.endsWith('/mineru')) {
      return command.replace(/^(\s*)\S+/, `$1${wrapperPath}`)
    }
    return command
  }

  computeSecretFingerprint(apiKey: string) {
    return `sha256:${createHash('sha256').update(apiKey).digest('hex')}`
  }

  async ensureBootstrap(backend: MinerUBootstrapBackend | null, config: MinerUConfig) {
    if (!backend || typeof backend.execute !== 'function') {
      throw new Error('Sandbox backend is not available for MinerU bootstrap.')
    }

    const stampPath = this.getStampPath()
    const runnerPath = this.getRunnerPath(config)
    const wrapperPath = config.wrapperPath
    const secretEnvPath = this.getSecretEnvPath()
    const secretFingerprint = this.computeSecretFingerprint(config.apiKey)
    const bootstrapAssets = this.getBootstrapAssets(config)

    const pythonCheck = await backend.execute('which python3 2>/dev/null')
    if (pythonCheck?.exitCode !== 0 || !pythonCheck?.output?.trim()) {
      throw new Error('Python 3 is not available in the sandbox. MinerU CLI requires python3 to be pre-installed.')
    }

    const stampCheck = await backend.execute(`cat ${shellQuote(stampPath)} 2>/dev/null || echo ''`)
    const stampContent = stampCheck?.output?.trim() ?? ''

    if (stampContent) {
      try {
        const stamp = JSON.parse(stampContent) as MinerUBootstrapStamp
        if (
          stamp.bootstrapVersion === MINERU_BOOTSTRAP_SCHEMA_VERSION &&
          stamp.skillsVersion === MINERU_SKILLS_VERSION &&
          stamp.secretFingerprint === secretFingerprint
        ) {
          const fileChecks = await backend.execute(
            `[ -f ${shellQuote(wrapperPath)} ] && [ -f ${shellQuote(runnerPath)} ] && echo ok || echo missing`
          )
          if (fileChecks?.output?.trim() === 'ok') {
            return { output: 'already bootstrapped', exitCode: 0, truncated: false }
          }
        }
      } catch {
        // Corrupted stamp. Re-bootstrap.
      }
    }

    await this.writeAssets(backend, bootstrapAssets)
    await this.writeSecretEnv(backend, secretEnvPath, config.apiKey)
    await this.writeWrapper(backend, wrapperPath, runnerPath, secretEnvPath)
    await this.writeStamp(backend, secretFingerprint)

    return { output: 'bootstrapped mineru', exitCode: 0, truncated: false }
  }

  private getBootstrapAssets(config: MinerUConfig): MinerUSkillAsset[] {
    return getSkillAssets(config.skillsDir)
  }

  private async writeSecretEnv(backend: MinerUBootstrapBackend, secretEnvPath: string, apiKey: string) {
    const content = `MINERU_TOKEN=${shellQuote(apiKey)}\n`
    const command =
      `mkdir -p ${shellQuote(path.dirname(secretEnvPath))} && ` +
      `cat <<'__XPERT_MINERU_SECRET_EOF__' > ${shellQuote(secretEnvPath)}\n${content}__XPERT_MINERU_SECRET_EOF__\n` +
      `chmod 600 ${shellQuote(secretEnvPath)}`
    const result = await backend.execute(command)
    if (result?.exitCode !== 0) {
      throw new Error(`Failed to write MinerU secret env file: ${result?.output || 'Unknown error'}`)
    }
  }

  private async writeWrapper(
    backend: MinerUBootstrapBackend,
    wrapperPath: string,
    runnerPath: string,
    secretEnvPath: string
  ) {
    const content = `#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=${shellQuote(secretEnvPath)}
PY_SCRIPT=${shellQuote(runnerPath)}

if [ ! -f "$ENV_FILE" ]; then
  echo "MinerU secret env file is missing: $ENV_FILE" >&2
  exit 1
fi

if [ ! -f "$PY_SCRIPT" ]; then
  echo "MinerU runner script is missing: $PY_SCRIPT" >&2
  exit 1
fi

set -a
. "$ENV_FILE"
set +a

exec python3 "$PY_SCRIPT" "$@"
`
    const command =
      `mkdir -p ${shellQuote(path.dirname(wrapperPath))} && ` +
      `cat <<'__XPERT_MINERU_WRAPPER_EOF__' > ${shellQuote(wrapperPath)}\n${content}__XPERT_MINERU_WRAPPER_EOF__\n` +
      `chmod 755 ${shellQuote(wrapperPath)}`
    const result = await backend.execute(command)
    if (result?.exitCode !== 0) {
      throw new Error(`Failed to write MinerU wrapper script: ${result?.output || 'Unknown error'}`)
    }
  }

  private async writeStamp(backend: MinerUBootstrapBackend, secretFingerprint: string) {
    const stampPath = this.getStampPath()
    const stampData = JSON.stringify({
      tool: 'mineru',
      bootstrapVersion: MINERU_BOOTSTRAP_SCHEMA_VERSION,
      skillsVersion: MINERU_SKILLS_VERSION,
      secretFingerprint,
      installedAt: new Date().toISOString()
    })
    const result = await backend.execute(
      `mkdir -p ${shellQuote(path.dirname(stampPath))} && echo ${shellQuote(stampData)} > ${shellQuote(stampPath)}`
    )
    if (result?.exitCode !== 0) {
      throw new Error(`Failed to write MinerU bootstrap stamp: ${result?.output || 'Unknown error'}`)
    }
  }

  private async writeAssets(backend: MinerUBootstrapBackend, assets: MinerUSkillAsset[]) {
    const canUploadDirectly =
      typeof backend.uploadFiles === 'function' && assets.every((asset) => !path.isAbsolute(asset.path))

    if (canUploadDirectly) {
      const results = await backend.uploadFiles(
        assets.map(({ path, content }) => [path, Buffer.from(content, 'utf8')])
      )
      const failed = results?.filter((result) => result.error)
      if (failed?.length) {
        throw new Error(`Failed to write MinerU skill assets: ${failed.map((item) => item.path).join(', ')}`)
      }
      return
    }

    for (const asset of assets) {
      const dir = path.dirname(asset.path)
      const result = await backend.execute(
        `mkdir -p ${shellQuote(dir)} && cat <<'__XPERT_MINERU_ASSET_EOF__' > ${shellQuote(asset.path)}\n${asset.content}\n__XPERT_MINERU_ASSET_EOF__`
      )
      if (result?.exitCode !== 0) {
        throw new Error(`Failed to write MinerU skill asset ${asset.path}: ${result?.output || 'Unknown error'}`)
      }
    }
  }
}

function getFirstCommandToken(command: string) {
  const trimmed = command.trim()
  if (!trimmed) {
    return ''
  }
  return trimmed.split(/\s+/, 1)[0]?.replace(/^['"]|['"]$/g, '') ?? ''
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`
}
