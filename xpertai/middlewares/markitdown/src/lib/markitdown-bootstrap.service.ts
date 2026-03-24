import { Buffer } from 'node:buffer'
import { posix as path } from 'node:path'
import {
  BaseSandbox,
  type IPluginConfigResolver,
  PLUGIN_CONFIG_RESOLVER_TOKEN
} from '@xpert-ai/plugin-sdk'
import { Inject, Injectable, Optional } from '@nestjs/common'
import {
  DEFAULT_MARKITDOWN_VERSION,
  DEFAULT_MARKITDOWN_SKILLS_DIR,
  DEFAULT_MARKITDOWN_STAMP_PATH,
  MARKITDOWN_BOOTSTRAP_SCHEMA_VERSION,
  MarkItDownConfig,
  MarkItDownConfigSchema
} from './markitdown.types.js'
import { MarkItDownPluginName } from './types.js'
import { getSkillAssets, type MarkItDownSkillAsset } from './skills/index.js'

type MarkItDownBootstrapBackend = Pick<BaseSandbox, 'execute' | 'uploadFiles'>
type MarkItDownBootstrapStamp = {
  tool?: string
  version?: string
  bootstrapVersion?: number
  installedAt?: string
}

@Injectable()
export class MarkItDownBootstrapService {
  constructor(
    @Optional()
    @Inject(PLUGIN_CONFIG_RESOLVER_TOKEN)
    private readonly pluginConfigResolver?: IPluginConfigResolver
  ) {}

  resolveConfig(config?: Partial<MarkItDownConfig>): MarkItDownConfig {
    const defaults: MarkItDownConfig = {
      version: process.env['MARKITDOWN_VERSION'] || DEFAULT_MARKITDOWN_VERSION,
      skillsDir: process.env['MARKITDOWN_SKILLS_DIR'] || DEFAULT_MARKITDOWN_SKILLS_DIR,
      extras: process.env['MARKITDOWN_EXTRAS'] || 'all'
    }
    const pluginConfig =
      this.pluginConfigResolver?.resolve<MarkItDownConfig>(MarkItDownPluginName, {
        defaults
      }) ?? defaults
    const middlewareConfig = MarkItDownConfigSchema.partial().parse(config ?? {})

    return MarkItDownConfigSchema.parse({
      ...defaults,
      ...pluginConfig,
      ...middlewareConfig
    })
  }

  getStampPath(): string {
    return DEFAULT_MARKITDOWN_STAMP_PATH
  }

  buildSystemPrompt(config = this.resolveConfig()): string {
    return [
      'The `markitdown` command (from Microsoft markitdown) is installed in the sandbox via pip.',
      'IMPORTANT: Use the `markitdown` command to convert files to Markdown. It supports PDF, DOCX, PPTX, XLSX, HTML, CSV, JSON, XML, ZIP, images (JPEG/PNG with EXIF and OCR), audio (MP3/WAV with speech-to-text), RSS feeds, and more.',
      'Always run file conversion via the `sandbox_shell` tool using the `markitdown` command.',
      `Before your first use, read the skill file at \`${config.skillsDir}/SKILL.md\` with \`cat ${config.skillsDir}/SKILL.md\` to learn all available options and usage patterns.`,
      '',
      'QUICK USAGE:',
      '- Convert a file: `markitdown path/to/file.pdf`',
      '- Convert a URL: `markitdown https://example.com/page.html`',
      '- Save output: `markitdown path/to/file.docx > output.md`',
      '- Piped input: `cat file.html | markitdown`',
      '',
      'GUIDELINES:',
      '- Output goes to stdout by default. Redirect with `>` to save to a file.',
      '- For large files, the conversion may take a moment. The default timeout should be sufficient for most files.',
      '- For images, markitdown extracts EXIF metadata and can do OCR if configured.',
      '- For audio files, markitdown performs speech-to-text transcription.',
      '- Inspect the output carefully and summarize results back to the user.',
      '',
      `For detailed format-specific guidance, read \`${config.skillsDir}/references/supported-formats.md\`.`
    ].join('\n')
  }

  isMarkItDownCommand(command: string): boolean {
    if (!command) {
      return false
    }
    return /\bmarkitdown\b/.test(command)
  }

  async ensureBootstrap(backend: MarkItDownBootstrapBackend, config = this.resolveConfig()) {
    if (!backend || typeof backend.execute !== 'function') {
      throw new Error('Sandbox backend is not available for MarkItDown bootstrap.')
    }

    const stampPath = this.getStampPath()
    const bootstrapAssets = this.getBootstrapAssets(config)

    // Check stamp to see if already bootstrapped with same version
    const stampCheck = await backend.execute(
      `cat ${shellQuote(stampPath)} 2>/dev/null || echo ''`
    )
    const stampContent = stampCheck?.output?.trim() ?? ''
    if (stampContent) {
      try {
        const stamp = JSON.parse(stampContent) as MarkItDownBootstrapStamp
        if (stamp.version === config.version) {
          // Stamp matches, but verify the markitdown binary actually exists
          const whichResult = await backend.execute('which markitdown 2>/dev/null')
          if (whichResult?.exitCode === 0 && whichResult?.output?.trim()) {
            if (stamp.bootstrapVersion !== MARKITDOWN_BOOTSTRAP_SCHEMA_VERSION) {
              await this.writeAssets(backend, bootstrapAssets)
              await this.writeStamp(backend, config.version)
            }
            return { output: 'already bootstrapped', exitCode: 0, truncated: false }
          }
        }
      } catch {
        // stamp is corrupted, re-bootstrap
      }
    }

    // 1. Check Python/pip availability
    const pipCheck = await backend.execute('which pip3 2>/dev/null || which pip 2>/dev/null')
    if (pipCheck?.exitCode !== 0 || !pipCheck?.output?.trim()) {
      throw new Error(
        'Python pip is not available in the sandbox. MarkItDown requires Python with pip to be pre-installed.'
      )
    }
    const pipCmd = pipCheck.output.trim().split('\n')[0]

    // 2. Install markitdown via pip
    // --break-system-packages is needed for PEP 668 compliant environments
    // (Debian/Ubuntu with externally-managed Python). Safe in a disposable sandbox.
    const versionSpec = config.version === 'latest' ? '' : `==${config.version}`
    const extrasSpec = config.extras ? `[${config.extras}]` : ''
    const installCmd = `${pipCmd} install --break-system-packages "markitdown${extrasSpec}${versionSpec}"`
    const installResult = await backend.execute(installCmd)
    if (installResult?.exitCode !== 0) {
      throw new Error(`MarkItDown install failed: ${installResult?.output || 'Unknown error'}`)
    }

    // 3. Upload skill files to sandbox
    await this.writeAssets(backend, bootstrapAssets)

    // 4. Write stamp file
    await this.writeStamp(backend, config.version)

    return installResult
  }

  private getBootstrapAssets(config: MarkItDownConfig): MarkItDownSkillAsset[] {
    return getSkillAssets(config.skillsDir)
  }

  private async writeStamp(backend: MarkItDownBootstrapBackend, version: string) {
    const stampPath = this.getStampPath()
    const stampData = JSON.stringify({
      tool: 'markitdown',
      version,
      bootstrapVersion: MARKITDOWN_BOOTSTRAP_SCHEMA_VERSION,
      installedAt: new Date().toISOString()
    })
    await backend.execute(
      `mkdir -p ${shellQuote(path.dirname(stampPath))} && echo ${shellQuote(stampData)} > ${shellQuote(stampPath)}`
    )
  }

  private async writeAssets(
    backend: MarkItDownBootstrapBackend,
    assets: MarkItDownSkillAsset[]
  ) {
    const canUploadDirectly =
      typeof backend.uploadFiles === 'function' && assets.every((asset) => !path.isAbsolute(asset.path))

    if (canUploadDirectly) {
      const results = await backend.uploadFiles(
        assets.map(({ path, content }) => [path, Buffer.from(content, 'utf8')])
      )
      const failed = results?.filter((result) => result.error)
      if (failed?.length) {
        throw new Error(`Failed to write MarkItDown skill assets: ${failed.map((item) => item.path).join(', ')}`)
      }
      return
    }

    for (const asset of assets) {
      const dir = path.dirname(asset.path)
      const result = await backend.execute(
        `mkdir -p ${shellQuote(dir)} && cat <<'__XPERT_MARKITDOWN_EOF__' > ${shellQuote(asset.path)}\n${asset.content}\n__XPERT_MARKITDOWN_EOF__`
      )
      if (result?.exitCode !== 0) {
        throw new Error(`Failed to write MarkItDown skill asset ${asset.path}: ${result?.output || 'Unknown error'}`)
      }
    }
  }
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`
}
