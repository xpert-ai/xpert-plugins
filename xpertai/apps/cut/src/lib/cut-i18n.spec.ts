import { createCutTranslator } from './remote-components/cut-workbench/src/cut-i18n.js'

describe('Cut task i18n', () => {
  it('localizes task statuses and render stages in English', () => {
    const t = createCutTranslator('en_US')
    expect([
      t('taskStatusQueued'), t('taskStatusRunning'), t('taskStatusSucceeded'), t('taskStatusFailed'), t('taskStatusCancelled'),
      t('taskStageSandboxStarting'), t('taskStageRendering'), t('taskStageRetrying'), t('taskStageComplete')
    ]).toEqual(['Queued', 'Running', 'Succeeded', 'Failed', 'Cancelled', 'Starting Sandbox', 'Rendering', 'Waiting to retry', 'Complete'])
  })

  it('localizes task statuses and render stages in Chinese', () => {
    const t = createCutTranslator('zh_CN')
    expect([
      t('taskStatusQueued'), t('taskStatusRunning'), t('taskStatusSucceeded'), t('taskStatusFailed'), t('taskStatusCancelled'),
      t('taskStageSandboxStarting'), t('taskStageRendering'), t('taskStageRetrying'), t('taskStageComplete')
    ]).toEqual(['等待中', '进行中', '已完成', '失败', '已取消', '正在启动沙箱', '正在渲染', '等待重试', '已完成'])
  })
})
