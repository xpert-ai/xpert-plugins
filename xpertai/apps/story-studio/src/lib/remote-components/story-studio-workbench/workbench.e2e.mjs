import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { startRemoteViewPreview } from '../../../../../../../../xpert/tools/remote-view-preview/preview-host.mjs'
import previewConfig, { platformRoot } from './preview.config.mjs'

const componentRoot = dirname(fileURLToPath(import.meta.url))
const screenshotRoot = resolve(componentRoot, '../../../../qa/e2e')
const takePreviewFixture = resolve(
  componentRoot,
  '../../../../qa/fixtures/storyboard-take-preview.mp4'
)
const requireFromPlatform = createRequire(resolve(platformRoot, 'package.json'))
const { chromium } = requireFromPlatform('playwright')

test('persists script CRUD, Assistant suggestions, detailed assets, storyboard controls, and Cut handoff', { timeout: 90_000 }, async (context) => {
  const { preview, browser, page, frame, pageErrors, consoleErrors } = await harness(context)
  await mkdir(screenshotRoot, { recursive: true })
  await assertVisible(frame.getByTestId('director-storyboard-page'))
  await assertVisible(frame.getByText('已自动采用', { exact: true }))
  const panelHandles = frame.getByRole('separator')
  assert.equal(await panelHandles.count(), 2)
  const leftPanelWidth = Number(await panelHandles.nth(0).getAttribute('aria-valuenow'))
  await panelHandles.nth(0).press('ArrowRight')
  assert.equal(Number(await panelHandles.nth(0).getAttribute('aria-valuenow')), leftPanelWidth + 16)
  await waitFor(() =>
    frame.getByTestId('director-main-video-preview').evaluate(
      (video) => video.readyState >= 2 && video.currentTime > 0.05
    )
  )
  await page.screenshot({ path: resolve(screenshotRoot, 'storyboard.png'), fullPage: false })

  await frame.getByRole('button', { name: '剧本', exact: true }).click()
  await assertVisible(frame.getByTestId('director-script-page'))
  await assertVisible(frame.getByTestId('adaptation-suggestion-card'))
  await page.screenshot({ path: resolve(screenshotRoot, 'script.png'), fullPage: false })

  await frame.getByRole('button', { name: '请求 Assistant 建议', exact: true }).click()
  await waitFor(() => preview.state.assistantMessages.length === 1)
  assert.match(preview.state.assistantMessages[0].text, /story_create_adaptation_suggestion/)
  assert.match(preview.state.assistantMessages[0].text, /Do not rewrite or accept/)

  const revisionBeforeAccept = preview.state.projects[0].revision
  await frame.getByRole('button', { name: '接受建议', exact: true }).click()
  await waitFor(() => preview.state.projects[0].revision === revisionBeforeAccept + 1)
  assert.match(preview.state.productionByProject['project-1'].episodes[0].script, /湿透的相机背带收紧/)
  assert.equal(preview.state.productionByProject['project-1'].storyPlan.adaptationSuggestions[0].status, 'accepted')

  await frame.getByRole('button', { name: '新增分集', exact: true }).click()
  await fillDialog(frame, { '标题': '第二集：反光里的人', '摘要': '林晚发现一段被剪掉的画面。', '剧本': '内景·夜·影棚\n林晚打开旧相机。' })
  await frame.getByRole('button', { name: '保存修改', exact: true }).click()
  await waitFor(() => preview.state.productionByProject['project-1'].episodes.length === 2)
  assert.equal(preview.state.productionByProject['project-1'].episodes[1].title, '第二集：反光里的人')
  await frame.getByRole('button', { name: '删除', exact: true }).first().click()
  await assertVisible(frame.getByRole('alertdialog'))
  await frame.getByRole('alertdialog').getByRole('button', { name: '删除', exact: true }).click()
  await waitFor(() => preview.state.productionByProject['project-1'].episodes.length === 1)

  const addButtons = frame.getByRole('button', { name: '添加', exact: true })
  await addButtons.nth(0).click()
  await fillDialog(frame, { '标题': '走廊闪回', '摘要': '雨声中插入旧片场的走廊记忆。', '场景': '旧影棚走廊', '时间': '深夜' })
  await frame.getByRole('button', { name: '保存修改', exact: true }).click()
  await waitFor(() => preview.state.productionByProject['project-1'].scenes.length === 4)
  await frame.getByRole('button', { name: '添加', exact: true }).nth(1).click()
  await fillDialog(frame, { '标题': '相机指示灯特写', '构图': '相机红色指示灯位于画面中心。', '动作': '林晚的手指悬在回放键上。', '机位 / 运镜': '微距固定机位' })
  await frame.getByRole('button', { name: '保存修改', exact: true }).click()
  await waitFor(() => preview.state.productionByProject['project-1'].scenes.at(-1).shots.length === 2)
  assert.equal(preview.state.productionByProject['project-1'].scenes.at(-1).shots.at(-1).title, '相机指示灯特写')
  const addedShotRow = frame.getByText('相机指示灯特写', { exact: true }).locator('xpath=ancestor::div[contains(@class,"group")][1]')
  await addedShotRow.getByRole('button', { name: '删除', exact: true }).click()
  await frame.getByRole('alertdialog').getByRole('button', { name: '删除', exact: true }).click()
  await waitFor(() => preview.state.productionByProject['project-1'].scenes.at(-1).shots.length === 1)
  const addedSceneCard = frame.getByText('走廊闪回', { exact: true }).locator('xpath=ancestor::article[1]')
  await addedSceneCard.getByRole('button', { name: '删除', exact: true }).click()
  await frame.getByRole('alertdialog').getByRole('button', { name: '删除', exact: true }).click()
  await waitFor(() => preview.state.productionByProject['project-1'].scenes.length === 3)

  await frame.getByRole('button', { name: '资产', exact: true }).click()
  await assertVisible(frame.getByTestId('director-assets-page'))
  await assertVisible(frame.getByText('角色视图', { exact: true }))
  await assertVisible(frame.getByText('表情参考', { exact: true }))
  assert.equal(
    await frame.getByTestId('director-assets-page').locator('aside').first().evaluate(
      (element) => element.scrollWidth <= element.clientWidth
    ),
    true
  )
  await assertVisible(frame.getByText('尚未添加图片', { exact: true }).first())
  assert.equal(await frame.getByTestId('director-assets-page').locator('img').count(), 0)
  await page.screenshot({ path: resolve(screenshotRoot, 'assets.png'), fullPage: false })
  await frame.getByRole('button', { name: /^场景/ }).click()
  await assertVisible(frame.getByText('尚未添加图片', { exact: true }).first())
  assert.equal(await frame.getByTestId('director-assets-page').locator('img').count(), 0)
  await frame.getByRole('button', { name: /^道具/ }).click()
  await frame.getByRole('button', { name: '新增资产', exact: true }).click()
  await fillDialog(frame, { '名称': '带裂纹的镜头盖', '描述': '顾沉遗留在事故现场的镜头盖。', '材质': '黑色 ABS，金属卡扣', '状态': '边缘裂纹，表面带雨水', '故事功能': '证明顾沉曾回到现场', '提示词': '电影级道具设定，黑色裂纹镜头盖，湿润表面。' })
  await frame.getByRole('button', { name: '保存修改', exact: true }).click()
  await waitFor(() => preview.state.productionByProject['project-1'].assets.some((asset) => asset.name === '带裂纹的镜头盖'))
  const prop = preview.state.productionByProject['project-1'].assets.find((asset) => asset.name === '带裂纹的镜头盖')
  assert.equal(prop.categoryDetails.material, '黑色 ABS，金属卡扣')
  await frame.getByRole('button', { name: '编辑', exact: true }).click()
  await frame.getByLabel('名称').fill('带裂纹的镜头盖 V2')
  await frame.getByRole('button', { name: '保存修改', exact: true }).click()
  await waitFor(() => preview.state.productionByProject['project-1'].assets.some((asset) => asset.name.endsWith('V2')))
  await frame.getByRole('button', { name: '删除', exact: true }).click()
  await frame.getByRole('alertdialog').getByRole('button', { name: '删除', exact: true }).click()
  await waitFor(() => !preview.state.productionByProject['project-1'].assets.some((asset) => asset.name.endsWith('V2')))

  await frame.getByRole('button', { name: '分镜', exact: true }).click()
  await assertVisible(frame.getByTestId('director-storyboard-page'))
  await frame.getByRole('button', { name: /S13.*两人对峙/ }).click()
  const prompt = frame.getByLabel('补充创作要求')
  await prompt.fill('雨夜中景双人，顾沉停步，林晚收紧相机背带，缓慢推近。')
  assert.equal((await frame.getByLabel('候选镜头数量').innerText()).trim(), '2')
  assert.equal((await frame.getByLabel('分辨率 / 画幅').innerText()).trim(), '1080p')
  assert.equal((await frame.getByLabel('画面形状').innerText()).trim(), '16:9')
  assert.equal((await frame.getByLabel('帧率').innerText()).trim(), '30')
  await frame.getByRole('button', { name: /S12.*雨夜旧影棚重逢/ }).click()
  assert.equal((await frame.getByLabel('候选镜头数量').innerText()).trim(), '1')
  assert.equal((await frame.getByLabel('分辨率 / 画幅').innerText()).trim(), '720p')
  assert.equal((await frame.getByLabel('画面形状').innerText()).trim(), '9:16')
  assert.equal((await frame.getByLabel('帧率').innerText()).trim(), '24')
  await frame.getByRole('button', { name: /S13.*两人对峙/ }).click()
  await prompt.fill('雨夜中景双人，顾沉停步，林晚收紧相机背带，缓慢推近。')
  await chooseSelect(frame, '生成模型', 'Veo 3.1')
  await chooseSelect(frame, '帧率', '30')
  await chooseSelect(frame, '候选镜头数量', '2')
  const takeVideos = frame.locator('[data-testid^="director-take-video-"]')
  assert.equal(await takeVideos.count(), 2)
  assert.match(
    (await takeVideos.nth(0).getAttribute('src')) ?? '',
    /s13\.mp4$/
  )
  assert.match(
    (await takeVideos.nth(1).getAttribute('src')) ?? '',
    /s13-take-2\.mp4$/
  )
  await frame.getByRole('button', { name: '候选镜头 2', exact: true }).click()
  assert.match(
    (await frame.getByTestId('director-main-video-preview').getAttribute('src')) ?? '',
    /s13-take-2\.mp4$/
  )
  const takeRevision = preview.state.projects[0].revision
  await frame.getByRole('button', { name: '锁定候选镜头', exact: true }).click()
  await waitFor(() => preview.state.projects[0].revision === takeRevision + 1)
  assert.equal(preview.state.productionByProject['project-1'].scenes[0].shots[2].candidates[2].selected, true)
  const storyboardRevision = preview.state.projects[0].revision
  await frame.getByRole('button', { name: '保存修改', exact: true }).click()
  await waitFor(() => preview.state.projects[0].revision === storyboardRevision + 1)
  assert.match(preview.state.productionByProject['project-1'].scenes[0].shots[2].generationPrompt, /顾沉停步/)
  const assistantBeforeGenerate = preview.state.assistantMessages.length
  const generateActionsBeforeRedo = preview.state.actions.filter((action) => action.actionKey === 'generate_shot_takes').length
  await frame.getByRole('button', { name: '局部重做', exact: true }).click()
  await waitFor(() => preview.state.actions.filter((action) => action.actionKey === 'generate_shot_takes').length === generateActionsBeforeRedo + 1)
  assert.equal(preview.state.actions.filter((action) => action.actionKey === 'generate_shot_takes').at(-1).takeCount, 2)
  assert.equal(preview.state.assistantMessages.length, assistantBeforeGenerate)
  const fullDataRequestsBeforeGenerate = preview.state.requestDataCount
  const generateActionsBeforeBatch = preview.state.actions.filter((action) => action.actionKey === 'generate_shot_takes').length
  await frame.getByRole('button', { name: '生成 2 个候选镜头', exact: true }).last().click()
  await waitFor(() => preview.state.actions.filter((action) => action.actionKey === 'generate_shot_takes').length === generateActionsBeforeBatch + 1)
  await waitFor(() => preview.state.actions.some((action) => action.actionKey === 'list_shot_video_tasks'))
  assert.deepEqual(
    preview.state.actions.filter((action) => action.actionKey === 'generate_shot_takes').at(-1).referenceAssetIds,
    ['asset-linwan', 'asset-guchen']
  )
  assert.equal(preview.state.requestDataCount, fullDataRequestsBeforeGenerate)
  assert.equal(preview.state.assistantMessages.length, assistantBeforeGenerate)

  await frame.getByRole('button', { name: '装配', exact: true }).click()
  await assertVisible(frame.getByTestId('director-assembly-page'))
  await frame.getByTestId('director-assembly-shot-shot-s13').click()
  await waitFor(() =>
    frame.getByTestId('director-assembly-main-video').evaluate(
      (video) => video.readyState >= 2 && video.currentTime > 0.05
    )
  )
  assert.match(
    (await frame.getByTestId('director-assembly-main-video').getAttribute('src')) ?? '',
    /s13-take-2\.mp4$/
  )
  assert.match(
    (await frame.getByTestId('director-assembly-clip-video-shot-s13').getAttribute('src')) ?? '',
    /s13-take-2\.mp4$/
  )
  const assemblyText = await frame.getByTestId('director-assembly-page').innerText()
  assert.doesNotMatch(assemblyText, /StoryCutHandoff|Workspace|SHA-256|MP4|\bfps\b|\bR\d+\b|\bTake\b/)
  await page.screenshot({ path: resolve(screenshotRoot, 'assembly.png'), fullPage: false })
  await frame.getByRole('button', { name: '送往剪辑台', exact: true }).click()
  await waitFor(() => Boolean(preview.state.handoffByProject['project-1']))
  await waitFor(() => preview.state.assistantMessages.some((message) => message.text?.includes('Accept StoryCutHandoff')))
  assert.equal(preview.state.handoffByProject['project-1'].status, 'delivered')

  assert.deepEqual(pageErrors, [])
  assert.deepEqual(consoleErrors, [])
})

test('keeps the four primary tabs and project switcher keyboard-accessible', { timeout: 30_000 }, async (context) => {
  const { frame } = await harness(context, { width: 1280, height: 820 })
  await assertVisible(frame.getByTestId('director-storyboard-page'))
  for (const tab of ['剧本', '资产', '分镜', '装配']) assert.equal(await frame.getByRole('button', { name: tab, exact: true }).count(), 1)
  await frame.getByRole('button', { name: '《逆光重逢》 · 第1集', exact: true }).click()
  await assertVisible(frame.getByText('最后一班列车', { exact: true }))
  await frame.getByText('最后一班列车', { exact: true }).click()
  await assertVisible(frame.getByTestId('director-storyboard-page'))
  await assertVisible(frame.getByText('手工制作草稿', { exact: true }))
  for (const tab of ['剧本', '资产', '分镜', '装配']) {
    assert.equal(await frame.getByRole('button', { name: tab, exact: true }).isEnabled(), true)
  }
})

test('creates and persists a fully editable manual production without Assistant input', { timeout: 60_000 }, async (context) => {
  const { preview, page, frame, pageErrors, consoleErrors } = await harness(context)
  await frame.getByRole('button', { name: '《逆光重逢》 · 第1集', exact: true }).click()
  await frame.getByRole('button', { name: '新建项目', exact: true }).last().click()
  await fillDialog(frame, {
    '标题': '测试2',
    '描述': '测试2',
    '故事前提': '阿收到发生地方'
  })
  await frame.getByRole('button', { name: '创建项目', exact: true }).click()
  await assertVisible(frame.getByTestId('director-script-page'))
  await waitFor(() => Boolean(preview.state.productionByProject[preview.state.projects[0].id]))
  const created = preview.state.projects[0]
  assert.equal(created.title, '测试2')
  assert.equal(created.revision, 2)
  assert.equal(preview.state.productionByProject[created.id].episodes.length, 1)
  assert.equal(preview.state.productionByProject[created.id].scenes.length, 1)
  assert.equal(preview.state.productionByProject[created.id].scenes[0].shots.length, 1)

  const sceneTitle = frame.getByLabel('编辑场景标题')
  const sceneSummary = frame.getByLabel('编辑场景概要')
  const firstAction = frame.getByLabel('编辑第1镜动作')
  await sceneTitle.fill('雨夜站台')
  await sceneSummary.fill('林晚在末班车前发现顾沉留下的旧相机。')
  await firstAction.fill('林晚收紧湿透的相机背带，望向空荡站台。')
  await waitFor(() => preview.state.productionByProject[created.id].scenes[0].title === '雨夜站台')
  assert.match(preview.state.productionByProject[created.id].episodes[0].script, /湿透的相机背带/)
  await assertVisible(frame.getByText('已保存', { exact: true }).first())

  await sceneTitle.fill('临时标题')
  await frame.getByRole('button', { name: '撤销剧本修改', exact: true }).click()
  assert.equal(await sceneTitle.inputValue(), '雨夜站台')
  await frame.getByRole('button', { name: '重做剧本修改', exact: true }).click()
  assert.equal(await sceneTitle.inputValue(), '临时标题')
  await frame.getByRole('button', { name: '撤销剧本修改', exact: true }).click()
  assert.equal(await sceneTitle.inputValue(), '雨夜站台')

  await firstAction.press('Enter')
  await assertVisible(frame.getByLabel('编辑第2镜动作'))
  await chooseSelect(frame, '新增内容块', '对白')
  await frame.getByLabel('编辑第2镜对白').fill('这一次，我不会再错过真相。')
  await waitFor(() =>
    preview.state.productionByProject[created.id].scenes[0].shots[1]?.dialogue ===
    '这一次，我不会再错过真相。'
  )
  assert.equal(preview.state.productionByProject[created.id].scenes[0].shots[1].dialogue, '这一次，我不会再错过真相。')

  await frame.getByLabel('编辑第2镜动作').press('Backspace')
  await waitFor(() => preview.state.productionByProject[created.id].scenes[0].shots.length === 1)
  assert.equal(await frame.getByLabel('编辑第2镜动作').count(), 0)

  const revisionBeforeSnapshot = preview.state.projects[0].revision
  await frame.getByRole('button', { name: '保存版本', exact: true }).click()
  await waitFor(() => preview.state.projects[0].revision === revisionBeforeSnapshot + 1)

  await frame.getByRole('button', { name: '资产', exact: true }).click()
  await assertVisible(frame.getByTestId('director-assets-page'))
  await frame.getByRole('button', { name: '分镜', exact: true }).click()
  await assertVisible(frame.getByTestId('director-storyboard-page'))
  const emptyPreview = frame.getByTestId('director-storyboard-empty-preview')
  await assertVisible(emptyPreview)
  await assertVisible(emptyPreview.getByText('等待生成成片', { exact: true }))
  assert.equal(await emptyPreview.locator('img').count(), 0)
  assert.equal(await frame.getByTestId('director-main-video-preview').count(), 0)
  await page.screenshot({ path: resolve(screenshotRoot, 'storyboard-empty.png'), fullPage: false })
  await frame.getByRole('button', { name: '装配', exact: true }).click()
  await assertVisible(frame.getByTestId('director-assembly-page'))

  await frame.getByLabel('项目菜单').click()
  await frame.locator('.director-account-menu').getByRole('button', { name: '刷新', exact: true }).click()
  await frame.getByRole('button', { name: '剧本', exact: true }).click()
  await assertVisible(frame.getByTestId('director-script-page'))
  assert.equal(await frame.getByLabel('编辑场景标题').inputValue(), '雨夜站台')
  assert.equal(await frame.getByLabel('编辑第1镜动作').inputValue(), '林晚收紧湿透的相机背带，望向空荡站台。')
  assert.match(await frame.getByLabel('所属分集').innerText(), /第1集/)
  assert.deepEqual(pageErrors, [])
  assert.deepEqual(consoleErrors, [])
})

async function harness(context, viewport = { width: 1487, height: 1058 }) {
  const preview = await startRemoteViewPreview({ ...previewConfig, state: structuredClone(previewConfig.state), logStartup: false, logErrors: false }, { port: 0 })
  const browser = await chromium.launch({ headless: true })
  context.after(async () => { await browser.close(); preview.server.closeAllConnections?.(); await preview.close() })
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1, colorScheme: 'light', locale: 'zh-CN' })
  const pageErrors = []
  const consoleErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  const takePreview = await readFile(takePreviewFixture)
  await page.route('**/__story-studio-preview/*.mp4', (route) =>
    fulfillVideoRange(route, takePreview)
  )
  await page.goto(preview.url)
  return { preview, browser, page, frame: page.frameLocator('#remote-view'), pageErrors, consoleErrors }
}

function fulfillVideoRange(route, video) {
  const range = route.request().headers().range
  const match = range?.match(/^bytes=(\d+)-(\d*)$/)
  const start = match ? Number(match[1]) : 0
  const requestedEnd = match?.[2] ? Number(match[2]) : video.length - 1
  const end = Math.min(requestedEnd, video.length - 1)
  const body = video.subarray(start, end + 1)
  return route.fulfill({
    status: match ? 206 : 200,
    contentType: 'video/mp4',
    headers: {
      'Accept-Ranges': 'bytes',
      'Content-Length': String(body.length),
      ...(match
        ? { 'Content-Range': `bytes ${start}-${end}/${video.length}` }
        : {})
    },
    body
  })
}

async function chooseSelect(frame, label, option) {
  await frame.getByLabel(label, { exact: true }).click()
  await frame.getByRole('option', { name: option, exact: true }).click()
}

async function fillDialog(frame, fields) {
  const dialog = frame.getByRole('dialog')
  for (const [label, value] of Object.entries(fields)) {
    const control = dialog.getByLabel(label, { exact: true })
    if (await control.count()) await control.fill(value)
  }
}

async function assertVisible(locator, timeoutMs = 8_000) {
  await locator.waitFor({ state: 'visible', timeout: timeoutMs })
  assert.equal(await locator.isVisible(), true)
}

async function waitFor(predicate, timeoutMs = 8_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) return
    await new Promise((resolveWait) => setTimeout(resolveWait, 50))
  }
  assert.fail(`Condition was not met within ${timeoutMs} ms.`)
}
