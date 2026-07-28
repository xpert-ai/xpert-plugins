import { Injectable, Logger } from '@nestjs/common'
import { createHash, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile
} from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import {
  OFFICE_CLI_READ_COMMANDS,
  OFFICE_CLI_RELEASE_VERSION,
  OFFICE_CLI_WRITE_COMMANDS
} from './constants.js'
import { resolveOfficeCliReleaseAsset } from './office-cli-release.js'
import type {
  OfficeCliCommand,
  OfficeCliDocumentExecutionResult,
  OfficeCliDocumentFormat,
  OfficeCliExecutionResult,
  OfficeCliGuidanceSkill
} from './types.js'

const READ_COMMANDS = new Set<string>(OFFICE_CLI_READ_COMMANDS)
const WRITE_COMMANDS = new Set<string>(OFFICE_CLI_WRITE_COMMANDS)
const FORBIDDEN_ARGUMENT_FLAGS = new Set([
  '-o',
  '--output',
  '--input',
  '--file',
  '--save',
  '--config',
  '--plugin-dir',
  '--format-handler'
])
const DEFAULT_TIMEOUT_MS = 120_000
const DEFAULT_MAX_OUTPUT_BYTES = 8 * 1024 * 1024
const DEFAULT_MAX_DOWNLOAD_BYTES = 96 * 1024 * 1024
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 600_000
const DEFAULT_DOWNLOAD_ATTEMPTS = 3
const DOWNLOAD_RETRY_DELAY_MS = 750

@Injectable()
export class OfficeCliRuntimeService {
  private readonly logger = new Logger(OfficeCliRuntimeService.name)
  private binaryPromise?: Promise<string>

  async prewarm() {
    const binaryPath = await this.resolveBinary()
    const result = await this.execute(['--version'], { timeoutMs: 15_000 })
    this.logger.log(
      `OfficeCLI ${result.stdout.trim() || result.stderr.trim() || OFFICE_CLI_RELEASE_VERSION} is ready at ${binaryPath}.`
    )
    return binaryPath
  }

  async health() {
    try {
      const binaryPath = await this.resolveBinary()
      const result = await this.execute(['--version'], { timeoutMs: 15_000 })
      return {
        status: 'up',
        binaryPath,
        pinnedVersion: OFFICE_CLI_RELEASE_VERSION,
        reportedVersion: result.stdout.trim() || result.stderr.trim()
      }
    } catch (error) {
      return {
        status: 'down',
        pinnedVersion: OFFICE_CLI_RELEASE_VERSION,
        error: getErrorMessage(error)
      }
    }
  }

  async createDocument(format: OfficeCliDocumentFormat) {
    return this.withTemporaryDirectory(async (directory) => {
      const filePath = join(directory, `document.${format}`)
      await this.execute(['create', filePath], { cwd: directory })
      return readFile(filePath)
    })
  }

  async renderHtml(buffer: Buffer, format: OfficeCliDocumentFormat) {
    return this.withDocument(buffer, format, async ({ directory, filePath }) => {
      const outputPath = join(directory, 'preview.html')
      await this.execute(['view', filePath, 'html', '-o', outputPath], {
        cwd: directory,
        timeoutMs: 40_000
      })
      const html = await readFile(outputPath, 'utf8')
      return injectSelectionBridge(html)
    })
  }

  async executeHelp(args: string[] = []) {
    validateArguments(args, false)
    return this.execute(['help', ...args, '--json'])
  }

  async loadSkill(name: OfficeCliGuidanceSkill) {
    return this.execute(['load_skill', name], {
      timeoutMs: 15_000,
      maxOutputBytes: 2 * 1024 * 1024
    })
  }

  async executeDocumentCommand(input: {
    buffer: Buffer
    format: OfficeCliDocumentFormat
    command: OfficeCliCommand
    args?: string[]
    stdin?: string | null
  }): Promise<OfficeCliDocumentExecutionResult> {
    const { command } = input
    assertSupportedCommand(command)
    const args = input.args ?? []
    validateArguments(args, false)
    validateCommandArguments(command, args, input.stdin)

    return this.withDocument(input.buffer, input.format, async ({ directory, filePath }) => {
      let commandArgs: string[]
      let resultFilePath = filePath

      if (command === 'merge') {
        resultFilePath = join(directory, `merged.${input.format}`)
        commandArgs = [command, filePath, resultFilePath, ...args]
      } else if (command === 'help') {
        commandArgs = [command, ...args]
      } else {
        commandArgs = [command, filePath, ...args]
      }

      if (supportsJsonOutput(command) && !commandArgs.includes('--json')) {
        commandArgs.push('--json')
      }
      const result = await this.execute(commandArgs, {
        cwd: directory,
        stdin: input.stdin ?? undefined
      })
      const fileBuffer = isWriteCommand(command)
        ? await readFile(resultFilePath)
        : input.buffer

      return {
        ...result,
        fileBuffer
      }
    })
  }

  async resolveBinary() {
    const configuredPath = process.env.OFFICECLI_BINARY_PATH?.trim()
    if (configuredPath) {
      await access(configuredPath, fsConstants.X_OK)
      return configuredPath
    }

    if (!this.binaryPromise) {
      this.binaryPromise = this.preparePinnedBinary().catch((error) => {
        this.binaryPromise = undefined
        throw error
      })
    }
    return this.binaryPromise
  }

  async execute(
    args: string[],
    options: {
      cwd?: string
      stdin?: string
      timeoutMs?: number
      maxOutputBytes?: number
    } = {}
  ): Promise<OfficeCliExecutionResult> {
    const binaryPath = await this.resolveBinary()
    const startedAt = Date.now()
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES

    return new Promise((resolve, reject) => {
      const child = spawn(binaryPath, args, {
        cwd: options.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          OFFICECLI_SKIP_UPDATE: '1',
          OFFICECLI_NO_AUTO_RESIDENT: '1',
          DOTNET_CLI_TELEMETRY_OPTOUT: '1'
        }
      })
      let outputBytes = 0
      let settled = false
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        finish(new Error(`OfficeCLI command timed out after ${options.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms.`))
      }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)

      const capture = (target: Buffer[]) => (chunk: Buffer) => {
        outputBytes += chunk.byteLength
        if (outputBytes > maxOutputBytes) {
          child.kill('SIGKILL')
          finish(new Error(`OfficeCLI output exceeded ${maxOutputBytes} bytes.`))
          return
        }
        target.push(Buffer.from(chunk))
      }

      child.stdout.on('data', capture(stdout))
      child.stderr.on('data', capture(stderr))
      child.on('error', finish)
      child.on('close', (exitCode) => {
        if (settled) {
          return
        }
        const stdoutText = Buffer.concat(stdout).toString('utf8')
        const stderrText = Buffer.concat(stderr).toString('utf8')
        if (exitCode !== 0) {
          finish(new Error(buildCommandError(args, exitCode, stdoutText, stderrText)))
          return
        }
        settled = true
        clearTimeout(timer)
        resolve({
          command: basename(binaryPath),
          args,
          exitCode: exitCode ?? 0,
          stdout: stdoutText,
          stderr: stderrText,
          json: tryParseJson(stdoutText),
          durationMs: Date.now() - startedAt
        })
      })

      if (options.stdin !== undefined) {
        child.stdin.end(options.stdin)
      } else {
        child.stdin.end()
      }

      function finish(error: Error) {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timer)
        reject(error)
      }
    })
  }

  private async preparePinnedBinary() {
    const asset = resolveOfficeCliReleaseAsset()
    const cacheRoot = resolveOfficeCliCacheRoot()
    const binaryPath = join(cacheRoot, process.platform === 'win32' ? 'officecli.exe' : 'officecli')
    await mkdir(cacheRoot, { recursive: true })

    if (await fileMatchesChecksum(binaryPath, asset.sha256)) {
      await ensureExecutable(binaryPath)
      return binaryPath
    }

    const downloaded = await downloadReleaseAssetWithRetry(asset)
    const digest = sha256(downloaded)
    if (digest !== asset.sha256) {
      throw new Error(`OfficeCLI checksum mismatch: expected ${asset.sha256}, received ${digest}.`)
    }

    const temporaryPath = join(cacheRoot, `.officecli-${randomUUID()}.download`)
    try {
      await writeFile(temporaryPath, downloaded, { mode: 0o755 })
      await rm(binaryPath, { force: true })
      await rename(temporaryPath, binaryPath)
    } finally {
      await rm(temporaryPath, { force: true })
    }
    await ensureExecutable(binaryPath)
    return binaryPath
  }

  private async withDocument<T>(
    buffer: Buffer,
    format: OfficeCliDocumentFormat,
    task: (context: { directory: string; filePath: string }) => Promise<T>
  ) {
    return this.withTemporaryDirectory(async (directory) => {
      const filePath = join(directory, `document.${format}`)
      await writeFile(filePath, buffer)
      return task({ directory, filePath })
    })
  }

  private async withTemporaryDirectory<T>(task: (directory: string) => Promise<T>) {
    const directory = await mkdtemp(join(tmpdir(), 'xpert-office-cli-'))
    try {
      return await task(directory)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
}

export function resolveOfficeCliCacheRoot(options: {
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  homeDirectory?: string
} = {}) {
  const env = options.env ?? process.env
  const configured = env.OFFICECLI_CACHE_DIR?.trim()
  if (configured) {
    return configured
  }

  const platform = options.platform ?? process.platform
  const homeDirectory = options.homeDirectory ?? homedir()
  let cacheRoot = env.XDG_CACHE_HOME?.trim()
  if (!cacheRoot) {
    if (platform === 'darwin') {
      cacheRoot = join(homeDirectory, 'Library', 'Caches')
    } else if (platform === 'win32') {
      cacheRoot = env.LOCALAPPDATA?.trim() || join(homeDirectory, 'AppData', 'Local')
    } else {
      cacheRoot = join(homeDirectory, '.cache')
    }
  }
  return join(cacheRoot, 'xpert', 'office-cli', OFFICE_CLI_RELEASE_VERSION)
}

async function downloadReleaseAssetWithRetry(asset: {
  version: string
  url: string
}) {
  const deadline = Date.now() + DEFAULT_DOWNLOAD_TIMEOUT_MS
  let lastError: unknown
  let attemptsMade = 0

  for (let attempt = 1; attempt <= DEFAULT_DOWNLOAD_ATTEMPTS; attempt += 1) {
    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) {
      break
    }
    attemptsMade = attempt
    try {
      return await downloadReleaseAsset(asset, Math.min(540_000, remainingMs))
    } catch (error) {
      lastError = error
      if (attempt === DEFAULT_DOWNLOAD_ATTEMPTS) {
        break
      }
      const delayMs = Math.min(
        DOWNLOAD_RETRY_DELAY_MS * (2 ** (attempt - 1)),
        Math.max(0, deadline - Date.now())
      )
      if (delayMs > 0) {
        await delay(delayMs)
      }
    }
  }

  throw new Error(
    `Unable to prepare OfficeCLI ${asset.version} after ${attemptsMade} download attempt${attemptsMade === 1 ? '' : 's'}: `
    + `${getErrorMessage(lastError)} Set OFFICECLI_BINARY_PATH to a preinstalled executable or ensure the Xpert server can access GitHub Releases.`
  )
}

async function downloadReleaseAsset(
  asset: {
    version: string
    url: string
  },
  timeoutMs: number
) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(asset.url, {
      headers: {
        'user-agent': '@xpert-ai/plugin-office-cli'
      },
      redirect: 'follow',
      signal: controller.signal
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}.`)
    }
    const contentLength = Number(response.headers.get('content-length') || 0)
    if (contentLength > DEFAULT_MAX_DOWNLOAD_BYTES) {
      throw new Error(`OfficeCLI binary is larger than the ${DEFAULT_MAX_DOWNLOAD_BYTES}-byte download limit.`)
    }
    return await readBoundedResponse(response, DEFAULT_MAX_DOWNLOAD_BYTES)
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Download timed out after ${timeoutMs}ms.`)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

export function isWriteCommand(command: string): command is (typeof OFFICE_CLI_WRITE_COMMANDS)[number] {
  return WRITE_COMMANDS.has(command)
}

export function assertSupportedCommand(command: string): asserts command is OfficeCliCommand {
  if (!READ_COMMANDS.has(command) && !WRITE_COMMANDS.has(command)) {
    throw new Error(`Unsupported OfficeCLI document command: ${command}.`)
  }
}

export function validateArguments(args: string[], allowOutputFlags: boolean) {
  if (args.length > 200) {
    throw new Error('OfficeCLI commands accept at most 200 arguments.')
  }
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (typeof argument !== 'string' || argument.includes('\0')) {
      throw new Error('OfficeCLI arguments must be strings without null bytes.')
    }
    if (Buffer.byteLength(argument, 'utf8') > 1_000_000) {
      throw new Error('An OfficeCLI argument exceeded the 1 MB limit.')
    }
    if (!allowOutputFlags && FORBIDDEN_ARGUMENT_FLAGS.has(argument)) {
      throw new Error(`OfficeCLI argument ${argument} is managed by the plugin runtime.`)
    }
    if (argument === '--prop') {
      validatePropertyValue(args[index + 1])
    }
  }
}

function validatePropertyValue(property: string | undefined) {
  if (!property) {
    throw new Error('OfficeCLI --prop requires a key=value argument.')
  }
  const separator = property.indexOf('=')
  if (separator <= 0) {
    throw new Error('OfficeCLI --prop requires a key=value argument.')
  }
  const key = property.slice(0, separator).trim().toLowerCase()
  const value = property.slice(separator + 1).trim()
  if ((key === 'path' || key === 'source') && looksLikeExternalLocation(value)) {
    throw new Error(`OfficeCLI property ${key} cannot reference host files or external URLs.`)
  }
  if ((key === 'src' || key === 'image') && !isSafeInlineSource(value)) {
    throw new Error(`OfficeCLI property ${key} must use an inline data URI or an internal Excel range.`)
  }
  if (/^image:(?!data:)/i.test(value)) {
    throw new Error(`OfficeCLI property ${key} cannot reference a host file as an image fill.`)
  }
}

function looksLikeExternalLocation(value: string) {
  return /^(?:https?:|file:|~(?:\/|\\)|\.{1,2}(?:\/|\\)|[a-z]:[\\/]|\\\\)/i.test(value)
}

function isSafeInlineSource(value: string) {
  return /^(?:data:|none$|clear$)/i.test(value)
    || /^(?:'[^']+'|[A-Za-z0-9_]+)![A-Z]{1,3}[1-9]\d*(?::[A-Z]{1,3}[1-9]\d*)?$/i.test(value)
}

export function validateCommandArguments(
  command: OfficeCliCommand,
  args: string[],
  stdin?: string | null
) {
  if (command === 'import') {
    if (!args.includes('--stdin')) {
      throw new Error('OfficeCLI import must use --stdin; host file paths are not allowed.')
    }
    if (!stdin) {
      throw new Error('OfficeCLI import requires CSV or TSV content in stdin.')
    }
    validateImportArguments(args)
  }
  if (command === 'merge') {
    const dataIndex = args.indexOf('--data')
    const data = dataIndex >= 0 ? args[dataIndex + 1] : undefined
    if (!data) {
      throw new Error('OfficeCLI merge requires inline JSON through --data.')
    }
    try {
      JSON.parse(data)
    } catch {
      throw new Error('OfficeCLI merge --data must be inline JSON; host file paths are not allowed.')
    }
  }
}

function validateImportArguments(args: string[]) {
  if (!args[0]?.startsWith('/')) {
    throw new Error('OfficeCLI import requires an Excel sheet path as its first argument.')
  }
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--stdin' || argument === '--header') {
      continue
    }
    if (argument === '--format') {
      const format = args[index + 1]
      if (format !== 'csv' && format !== 'tsv') {
        throw new Error('OfficeCLI import --format must be csv or tsv.')
      }
      index += 1
      continue
    }
    if (argument === '--start-cell') {
      const startCell = args[index + 1]
      if (!startCell || !/^[A-Z]{1,3}[1-9]\d*$/i.test(startCell)) {
        throw new Error('OfficeCLI import --start-cell must be an Excel cell reference.')
      }
      index += 1
      continue
    }
    throw new Error(`OfficeCLI import argument ${argument} is not allowed.`)
  }
}

function supportsJsonOutput(command: string) {
  return command !== 'help' && command !== 'refresh'
}

async function fileMatchesChecksum(path: string, expected: string) {
  try {
    const file = await readFile(path)
    return sha256(file) === expected
  } catch {
    return false
  }
}

async function readBoundedResponse(response: Response, maxBytes: number) {
  if (!response.body) {
    throw new Error('OfficeCLI binary download returned an empty response body.')
  }
  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let totalBytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    totalBytes += value.byteLength
    if (totalBytes > maxBytes) {
      await reader.cancel()
      throw new Error(`OfficeCLI binary is larger than the ${maxBytes}-byte download limit.`)
    }
    chunks.push(Buffer.from(value))
  }
  return Buffer.concat(chunks, totalBytes)
}

async function ensureExecutable(path: string) {
  if (process.platform !== 'win32') {
    await chmod(path, 0o755)
  }
  await access(path, fsConstants.X_OK)
}

function sha256(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function tryParseJson(value: string) {
  const normalized = value.trim()
  if (!normalized) {
    return undefined
  }
  try {
    return JSON.parse(normalized)
  } catch {
    return undefined
  }
}

function buildCommandError(args: string[], exitCode: number | null, stdout: string, stderr: string) {
  const details = stderr.trim() || stdout.trim() || 'No diagnostic output.'
  return `OfficeCLI ${args[0] ?? 'command'} failed with exit code ${exitCode ?? 'unknown'}: ${details.slice(0, 4000)}`
}

export function injectSelectionBridge(html: string) {
  const bridge = `<style>
#xpert-officecli-inline-editor {
  position: fixed;
  z-index: 2147483647;
  width: min(360px, calc(100vw - 24px));
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
  color: #202124;
  box-shadow: 0 16px 48px rgba(15, 23, 42, .24);
  font: 13px/1.4 Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
#xpert-officecli-inline-editor[hidden] { display: none !important; }
#xpert-officecli-inline-editor * { box-sizing: border-box; }
#xpert-officecli-inline-editor .xpert-officecli-editor-title { margin-bottom: 7px; font-weight: 700; }
#xpert-officecli-inline-editor .xpert-officecli-editor-path {
  margin-bottom: 8px;
  overflow: hidden;
  color: #71717a;
  font: 11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}
#xpert-officecli-inline-editor textarea {
  display: block;
  width: 100%;
  min-height: 72px;
  max-height: 180px;
  resize: vertical;
  padding: 9px 10px;
  border: 1px solid #d4d4d8;
  border-radius: 8px;
  background: #fff;
  color: #202124;
  font: inherit;
  outline: none;
}
#xpert-officecli-inline-editor textarea:focus { border-color: #e5484d; box-shadow: 0 0 0 2px rgba(229, 72, 77, .14); }
#xpert-officecli-inline-editor .xpert-officecli-editor-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;
  margin-top: 9px;
}
#xpert-officecli-inline-editor button {
  min-height: 32px;
  padding: 6px 11px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  color: #202124;
  font: inherit;
  cursor: pointer;
}
#xpert-officecli-inline-editor button[data-primary] { border-color: #e5484d; background: #e5484d; color: #fff; }
#xpert-officecli-inline-editor button:disabled { cursor: wait; opacity: .55; }
#xpert-officecli-inline-editor .xpert-officecli-editor-status { min-height: 17px; margin-top: 7px; color: #71717a; font-size: 11px; }
[data-xpert-officecli-selected] { outline: 3px solid #e5484d !important; outline-offset: -2px; }
</style>
<div id="xpert-officecli-inline-editor" data-xpert-officecli-editor hidden>
  <div class="xpert-officecli-editor-title">直接编辑</div>
  <div class="xpert-officecli-editor-path"></div>
  <textarea aria-label="编辑所选内容" placeholder="输入新的内容"></textarea>
  <div class="xpert-officecli-editor-actions">
    <button type="button" data-cancel>取消</button>
    <button type="button" data-primary data-save>保存</button>
  </div>
  <div class="xpert-officecli-editor-status">保存后将更新原生 Office 文件。</div>
</div>
<script>
(function () {
  var editor = document.getElementById('xpert-officecli-inline-editor');
  var pathLabel = editor.querySelector('.xpert-officecli-editor-path');
  var textarea = editor.querySelector('textarea');
  var status = editor.querySelector('.xpert-officecli-editor-status');
  var saveButton = editor.querySelector('[data-save]');
  var cancelButton = editor.querySelector('[data-cancel]');
  var selectedNode = null;
  var selectedPath = '';
  var saving = false;

  function closeEditor() {
    if (saving) return;
    editor.hidden = true;
    if (selectedNode) selectedNode.removeAttribute('data-xpert-officecli-selected');
    selectedNode = null;
    selectedPath = '';
  }

  function positionEditor(node) {
    editor.hidden = false;
    editor.style.left = '12px';
    editor.style.top = '12px';
    requestAnimationFrame(function () {
      var rect = node.getBoundingClientRect();
      var editorRect = editor.getBoundingClientRect();
      var left = Math.max(12, Math.min(rect.left, window.innerWidth - editorRect.width - 12));
      var top = rect.bottom + 8;
      if (top + editorRect.height > window.innerHeight - 12) {
        top = Math.max(12, rect.top - editorRect.height - 8);
      }
      editor.style.left = left + 'px';
      editor.style.top = top + 'px';
    });
  }

  function openEditor(node) {
    document.querySelectorAll('[data-xpert-officecli-selected]').forEach(function (item) {
      item.removeAttribute('data-xpert-officecli-selected');
    });
    selectedNode = node;
    selectedPath = node.getAttribute('data-path') || '';
    var text = (node.textContent || '').trim().slice(0, 500);
    node.setAttribute('data-xpert-officecli-selected', 'true');
    pathLabel.textContent = selectedPath;
    textarea.value = text;
    status.textContent = '修改后点击“保存”，或按 Ctrl/⌘ + Enter。';
    saving = false;
    saveButton.disabled = false;
    cancelButton.disabled = false;
    positionEditor(node);
    textarea.focus();
    textarea.select();
    window.parent.postMessage({
      channel: 'xpert.officecli.preview',
      type: 'selection',
      path: selectedPath,
      text: text
    }, '*');
  }

  function save() {
    if (saving || !selectedPath) return;
    saving = true;
    saveButton.disabled = true;
    cancelButton.disabled = true;
    status.textContent = '正在保存…';
    window.parent.postMessage({
      channel: 'xpert.officecli.preview',
      type: 'save',
      path: selectedPath,
      text: textarea.value
    }, '*');
  }

  document.addEventListener('click', function (event) {
    if (event.target && event.target.closest && event.target.closest('[data-xpert-officecli-editor]')) return;
    var node = event.target && event.target.closest ? event.target.closest('[data-path]') : null;
    if (!node) {
      closeEditor();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    openEditor(node);
  }, true);

  saveButton.addEventListener('click', save);
  cancelButton.addEventListener('click', closeEditor);
  textarea.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeEditor();
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      save();
    }
  });
  window.addEventListener('message', function (event) {
    var message = event.data;
    if (!message || message.channel !== 'xpert.officecli.preview' || message.type !== 'save-result') return;
    if (message.success) {
      status.textContent = '保存成功，正在刷新预览…';
      return;
    }
    saving = false;
    saveButton.disabled = false;
    cancelButton.disabled = false;
    status.textContent = message.message || '保存失败，请重试。';
  });
}());
</script>`
  return html.includes('</body>') ? html.replace('</body>', `${bridge}</body>`) : `${html}${bridge}`
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function extensionFromFileName(fileName: string) {
  const extension = extname(fileName).slice(1).toLowerCase()
  if (extension === 'docx' || extension === 'xlsx' || extension === 'pptx') {
    return extension
  }
  throw new Error('OfficeCLI supports only .docx, .xlsx, and .pptx files.')
}
