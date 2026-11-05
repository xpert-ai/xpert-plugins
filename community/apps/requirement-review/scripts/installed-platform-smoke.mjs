#!/usr/bin/env node

import assert from 'node:assert/strict'
import { access, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const workspaceRoot = resolve(packageRoot, '..', '..', '..', '..')
const defaultStatePath = resolve(
  workspaceRoot,
  '.xpert-local-environment',
  'reqtrace-playwright-state.json'
)
const cliArgs = process.argv.slice(2)
if (cliArgs[0] === '--') cliArgs.shift()
const command = cliArgs[0] ?? 'run'

if (command === '--help' || command === '-h' || command === 'help') {
  printHelp()
  process.exit(0)
}

if (!['run', 'capture-auth'].includes(command)) {
  fail(`未知命令：${command}。使用 --help 查看用法。`)
}

const url = requiredEnv('REQTRACE_E2E_URL')
const storageStatePath = resolve(
  process.env.REQTRACE_E2E_STORAGE_STATE || defaultStatePath
)

if (command === 'capture-auth') {
  const { chromium } = loadPlaywright()
  await captureAuth({ chromium, url, storageStatePath })
} else {
  if (process.env.REQTRACE_E2E_ALLOW_MODEL !== '1') {
    fail(
      '真实闭环会创建评审并调用已绑定模型。确认目标是测试环境后，设置 REQTRACE_E2E_ALLOW_MODEL=1 再运行。'
    )
  }
  const { chromium } = loadPlaywright()
  await runSmoke({ chromium, url, storageStatePath })
}

async function captureAuth({ chromium, url, storageStatePath }) {
  await mkdir(dirname(storageStatePath), { recursive: true })
  const browser = await launchChromium(chromium, false)
  const context = await browser.newContext()
  const page = await context.newPage()
  const prompt = createInterface({ input: stdin, output: stdout })

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await prompt.question(
      '请在打开的浏览器中完成 Xpert 登录并进入 ReqTrace 工作台，然后回到终端按 Enter：'
    )
    await findWorkbenchFrame(page, 30_000)
    await context.storageState({ path: storageStatePath })
    console.log(`登录态已保存到 ${storageStatePath}`)
  } finally {
    prompt.close()
    await browser.close()
  }
}

async function runSmoke({ chromium, url, storageStatePath }) {
  await access(storageStatePath).catch(() => {
    fail(
      `找不到登录态文件 ${storageStatePath}。请先运行 pnpm smoke:installed -- capture-auth。`
    )
  })

  const timeoutMs = positiveInteger(
    process.env.REQTRACE_E2E_TIMEOUT_MS,
    180_000,
    'REQTRACE_E2E_TIMEOUT_MS'
  )
  const headed = process.env.REQTRACE_E2E_HEADED === '1'
  const browser = await launchChromium(chromium, !headed)
  const context = await browser.newContext({ storageState: storageStatePath })
  const page = await context.newPage()
  page.setDefaultTimeout(15_000)
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
  const reviewTitle = `ReqTrace E2E ${stamp}`
  const auditMarker = ` [E2E 人工核对 ${stamp}]`
  const sourceText = [
    '产品经理：登录后的用户需要查看自己的待办需求列表。',
    '用户：列表必须支持按高、中、低优先级筛选。',
    '产品经理：筛选条件改变后，列表应在两秒内刷新。'
  ].join('\n')

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    let frame = await findWorkbenchFrame(page, timeoutMs)
    await assertAuthenticated(page, frame)

    await frame
      .getByRole('button', { name: /^(新建评审|New review)$/ })
      .click()
    const createForm = frame.locator('form')
    await createForm
      .getByRole('textbox', { name: /^(评审标题|Review title)$/ })
      .fill(reviewTitle)
    await createForm
      .getByRole('textbox', {
        name: /^(访谈原文|Interview transcript)$/
      })
      .fill(sourceText)
    await createForm
      .getByRole('button', { name: /^(创建评审|Create review)$/ })
      .click()
    await frame.getByRole('heading', { name: reviewTitle }).waitFor()
    console.log(`[1/6] 已创建评审：${reviewTitle}`)

    await frame
      .getByRole('button', { name: /^(分析需求|Analyze requirements)$/ })
      .click()
    const detailHeader = frame
      .getByRole('heading', { name: reviewTitle })
      .locator('..')
    await waitForAnalysis(detailHeader, timeoutMs)
    console.log('[2/6] 模型已提交可核对草稿')

    const articles = frame.locator('article')
    const requirementCount = await articles.count()
    assert.ok(requirementCount > 0, '模型成功后没有生成需求卡片。')
    const first = articles.first()
    await setCheckbox(
      first.getByRole('checkbox', {
        name: /^(纳入确认|Include in confirmation)$/
      }),
      true
    )
    for (let index = 1; index < requirementCount; index += 1) {
      await setCheckbox(
        articles.nth(index).getByRole('checkbox', {
          name: /^(纳入确认|Include in confirmation)$/
        }),
        false
      )
    }

    const description = first.getByRole('textbox', {
      name: /^(需求描述|Requirement description)$/
    })
    const originalDescription = await description.inputValue()
    const reviewedDescription = `${originalDescription}${auditMarker}`
    await description.fill(reviewedDescription)
    await first
      .getByRole('textbox', {
        name: /^(待澄清问题（每行一个）|Open questions \(one per line\))$/
      })
      .fill('')

    let acceptance = first.getByRole('textbox', {
      name: /^(验收条件|Acceptance criteria) 1$/
    })
    if ((await acceptance.count()) === 0) {
      await first
        .getByRole('button', {
          name: /^(添加验收条件|Add acceptance criterion)$/
        })
        .click()
      acceptance = first.getByRole('textbox', {
        name: /^(验收条件|Acceptance criteria) 1$/
      })
    }
    if (!(await acceptance.inputValue()).trim()) {
      await acceptance.fill('用户可以完成该需求描述的核心流程。')
    }

    await frame
      .getByRole('button', { name: /^(保存草稿|Save draft)$/ })
      .click()
    await frame
      .getByText(/^(已保存|Saved)$/, { exact: true })
      .waitFor({ state: 'visible' })
    console.log('[3/6] 人工修改已保存')

    const confirmButton = frame
      .getByRole('button', { name: /^(确认保存|Confirm and save)$/ })
      .first()
    await waitUntilEnabled(confirmButton, 15_000)
    await confirmButton.click()
    const dialog = frame.getByRole('alertdialog')
    await dialog.waitFor({ state: 'visible' })
    await dialog
      .getByRole('button', { name: /^(确认保存|Confirm and save)$/ })
      .click()
    await detailHeader
      .getByText(/^(已确认|Confirmed)$/, { exact: true })
      .waitFor({ state: 'visible' })
    console.log('[4/6] 已生成只读确认快照')

    await page.reload({ waitUntil: 'domcontentloaded' })
    frame = await findWorkbenchFrame(page, timeoutMs)
    const search = frame.getByRole('textbox', {
      name: /^(搜索评审|Search reviews)$/
    })
    await search.fill(reviewTitle)
    const reviewButton = frame
      .getByRole('button', { name: new RegExp(escapeRegExp(reviewTitle)) })
      .first()
    await reviewButton.waitFor({ state: 'visible' })
    await reviewButton.click()
    await frame.getByRole('heading', { name: reviewTitle }).waitFor()
    const restoredHeader = frame
      .getByRole('heading', { name: reviewTitle })
      .locator('..')
    await restoredHeader
      .getByText(/^(已确认|Confirmed)$/, { exact: true })
      .waitFor({ state: 'visible' })
    const restoredDescription = await frame
      .locator('article')
      .first()
      .getByRole('textbox', {
        name: /^(需求描述|Requirement description)$/
      })
      .inputValue()
    assert.equal(
      restoredDescription,
      reviewedDescription,
      '刷新后没有恢复人工修改后的确认快照。'
    )
    console.log('[5/6] 完整刷新后已从持久化数据恢复')

    await frame
      .getByText(/^(分析历史|Analysis history)/)
      .waitFor({ state: 'visible' })
    await frame
      .getByText(/^(审计差异|Review audit)/)
      .waitFor({ state: 'visible' })
    const screenshotPath = process.env.REQTRACE_E2E_SCREENSHOT
    if (screenshotPath) {
      await mkdir(dirname(resolve(screenshotPath)), { recursive: true })
      await page.screenshot({ path: resolve(screenshotPath), fullPage: true })
    }
    console.log('[6/6] 分析历史与审计差异入口可见')
    console.log(`PASS ${reviewTitle}`)
  } finally {
    await browser.close()
  }
}

async function findWorkbenchFrame(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      const heading = frame.getByRole('heading', {
        name: /^ReqTrace · (需求评审|Requirement review)$/
      })
      if ((await heading.count()) > 0 && (await heading.isVisible())) return frame
    }
    await page.waitForTimeout(250)
  }
  throw new Error('未找到 ReqTrace 工作台 iframe；请检查 URL、登录态和插件安装状态。')
}

async function assertAuthenticated(page, frame) {
  const loginUrl = page.url()
  assert.ok(
    !/\/auth\/(login|signin)|\/login/i.test(loginUrl),
    `登录态已失效，当前页面为 ${loginUrl}`
  )
  await frame
    .getByRole('button', { name: /^(新建评审|New review)$/ })
    .waitFor({ state: 'visible' })
}

async function waitForAnalysis(detailHeader, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  const reviewing = detailHeader.getByText(/^(待核对|Needs review)$/, {
    exact: true
  })
  const failed = detailHeader.getByText(/^(分析失败|Analysis failed)$/, {
    exact: true
  })
  const empty = detailHeader.getByText(/^(未发现需求|No requirements found)$/, {
    exact: true
  })
  while (Date.now() < deadline) {
    if ((await visibleCount(reviewing)) > 0) return
    if ((await visibleCount(failed)) > 0) {
      throw new Error('真实分析进入失败状态；请展开分析历史查看错误码。')
    }
    if ((await visibleCount(empty)) > 0) {
      throw new Error('真实分析没有提取到需求。')
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_000))
  }
  throw new Error(`真实分析在 ${timeoutMs} ms 内没有进入待核对状态。`)
}

async function visibleCount(locator) {
  const count = await locator.count()
  let visible = 0
  for (let index = 0; index < count; index += 1) {
    if (await locator.nth(index).isVisible()) visible += 1
  }
  return visible
}

async function waitUntilEnabled(locator, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await locator.isEnabled()) return
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100))
  }
  throw new Error('确认按钮未在预期时间内变为可用。')
}

async function setCheckbox(locator, checked) {
  const ariaChecked = await locator.getAttribute('aria-checked')
  const current =
    ariaChecked === null ? await locator.isChecked() : ariaChecked === 'true'
  if (current !== checked) await locator.click()
  const updatedAriaChecked = await locator.getAttribute('aria-checked')
  const updated =
    updatedAriaChecked === null
      ? await locator.isChecked()
      : updatedAriaChecked === 'true'
  assert.equal(updated, checked, '需求纳入状态没有更新。')
}

async function launchChromium(chromium, headless) {
  const executablePath = await resolveBrowserExecutable(chromium)
  return chromium.launch({
    headless,
    ...(executablePath ? { executablePath } : {})
  })
}

async function resolveBrowserExecutable(chromium) {
  const explicit = process.env.REQTRACE_E2E_BROWSER_EXECUTABLE?.trim()
  if (explicit) {
    const resolved = resolve(explicit)
    await access(resolved).catch(() => {
      fail(`REQTRACE_E2E_BROWSER_EXECUTABLE 指向的文件不存在：${resolved}`)
    })
    return resolved
  }

  try {
    await access(chromium.executablePath())
    return undefined
  } catch {
    // Fall back to a preinstalled browser without downloading software.
  }

  const candidates =
    process.platform === 'win32'
      ? [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
          'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
        ]
      : []
  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch {
      // Continue to the next deterministic local browser path.
    }
  }
  return undefined
}

function loadPlaywright() {
  const candidates = [
    { name: '当前插件依赖', require: createRequire(import.meta.url) },
    process.env.REQTRACE_E2E_PLAYWRIGHT_ROOT
      ? {
          name: 'REQTRACE_E2E_PLAYWRIGHT_ROOT',
          require: createRequire(
            resolve(process.env.REQTRACE_E2E_PLAYWRIGHT_ROOT, 'package.json')
          )
        }
      : null,
    {
      name: '同级 Xpert 工作区',
      require: createRequire(resolve(workspaceRoot, 'xpert', 'package.json'))
    }
  ].filter(Boolean)
  for (const candidate of candidates) {
    try {
      return candidate.require('playwright')
    } catch {
      // Try the next explicitly scoped installation.
    }
  }
  fail(
    `无法加载 Playwright。请先安装 Xpert 开发依赖，或把包含 playwright 的目录设置为 REQTRACE_E2E_PLAYWRIGHT_ROOT。已检查：${candidates.map((item) => item.name).join('、')}。`
  )
}

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) fail(`缺少环境变量 ${name}。使用 --help 查看用法。`)
  return value
}

function positiveInteger(value, fallback, name) {
  if (value === undefined) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    fail(`${name} 必须是正整数。`)
  }
  return parsed
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

function printHelp() {
  console.log(`ReqTrace 已安装平台 smoke test

用法：
  pnpm smoke:installed -- capture-auth
  pnpm smoke:installed -- run

必需环境变量：
  REQTRACE_E2E_URL              已安装 ReqTrace 工作台的完整 Xpert URL

运行真实闭环时还必须设置：
  REQTRACE_E2E_ALLOW_MODEL=1    显式允许创建测试评审并调用已绑定模型

可选环境变量：
  REQTRACE_E2E_STORAGE_STATE    登录态文件；默认写入工作区 .xpert-local-environment
  REQTRACE_E2E_TIMEOUT_MS       等待模型完成的毫秒数；默认 180000
  REQTRACE_E2E_HEADED=1         以可见浏览器运行
  REQTRACE_E2E_SCREENSHOT       成功后保存截图的路径
  REQTRACE_E2E_PLAYWRIGHT_ROOT  包含 playwright 依赖的 Node 项目目录
  REQTRACE_E2E_BROWSER_EXECUTABLE  Chrome/Edge/Chromium 可执行文件路径

capture-auth 只保存浏览器 cookie/localStorage，不调用模型。run 会创建带时间戳的
合成评审，触发真实模型，人工修改并确认，完整刷新后验证数据库恢复、分析历史和审计入口。`)
}
