import { readFileSync } from 'fs'
import { join } from 'path'
import * as vm from 'vm'

describe('scrape task intake remote component', () => {
  function readAppScript() {
    return readFileSync(join(__dirname, 'remote-components', 'scrape-task-intake', 'app.js'), 'utf8')
  }

  it('parses as valid JavaScript', () => {
    new vm.Script(readAppScript(), { filename: 'app.js' })
  })

  it('delivers the post() payload in a single bridge message', () => {
    const script = readAppScript()
    const lines = script.split('\n')
    const postIndex = lines.findIndex((line) => line.startsWith('  function post('))
    expect(postIndex).toBeGreaterThanOrEqual(0)
    // Include the lines following the function until its closing brace at column 2.
    let end = postIndex + 1
    while (end < lines.length && !lines[end].startsWith('  }')) {
      end++
    }
    const slice = lines.slice(postIndex, end + 1).join('\n')

    const sent: Array<{ msg: Record<string, unknown>; origin: unknown; transfer?: unknown[] }> = []
    const sandbox: Record<string, unknown> = {
      window: { parent: { postMessage: (msg: unknown, origin: unknown, transfer: unknown[]) => sent.push({ msg, origin, transfer } as never) } },
      instanceId: null
    }
    sandbox.CHANNEL = 'xpertai.remote_component'
    sandbox.VERSION = 1
    vm.createContext(sandbox)
    vm.runInContext(`${slice}\ninstanceId = 'inst-1'; post('resize', { height: 600 }, ['x'])`, sandbox)

    expect(sent).toHaveLength(1)
    expect(sent[0].origin).toBe('*')
    expect(sent[0].msg).toMatchObject({ type: 'resize', height: 600, instanceId: 'inst-1', channel: 'xpertai.remote_component' })
    expect(sent[0].transfer).toEqual(['x'])
  })

  it('drops bridge messages sent before the host assigns an instanceId, except ready', () => {
    const script = readAppScript()
    const lines = script.split('\n')
    const postIndex = lines.findIndex((line) => line.startsWith('  function post('))
    expect(postIndex).toBeGreaterThanOrEqual(0)
    let end = postIndex + 1
    while (end < lines.length && !lines[end].startsWith('  }')) {
      end++
    }
    const slice = lines.slice(postIndex, end + 1).join('\n')

    const sent: Array<Record<string, unknown>> = []
    const sandbox: Record<string, unknown> = {
      window: { parent: { postMessage: (msg: unknown) => sent.push(msg as Record<string, unknown>) } },
      instanceId: null
    }
    sandbox.CHANNEL = 'xpertai.remote_component'
    sandbox.VERSION = 1
    vm.createContext(sandbox)
    // Resize fires from the ResizeObserver and every render, so it can happen before `init`.
    vm.runInContext(
      `${slice}\npost('resize', { height: 600 })\npost('ready')\ninstanceId = 'inst-1'\npost('resize', { height: 601 })`,
      sandbox
    )

    expect(sent).toHaveLength(2)
    expect(sent[0]).toMatchObject({ type: 'ready', instanceId: null })
    expect(sent[1]).toMatchObject({ type: 'resize', height: 601, instanceId: 'inst-1' })
  })

  it('never touches localStorage or sessionStorage inside the sandboxed iframe', () => {
    const script = readAppScript()

    expect(script).not.toMatch(/localStorage/)
    expect(script).not.toMatch(/sessionStorage/)
  })

  it('speaks the remote component bridge protocol and unwraps host responses', () => {
    const script = readAppScript()

    expect(script).toContain("'xpertai.remote_component'")
    expect(script).toContain('requestData')
    expect(script).toContain('executeAction')
    expect(script).toContain('invokeClientCommand')
    expect(script).toContain('unwrapResponse')
    expect(script).toContain("message.type === 'hostEvent'")
  })

  it('sends the report to the assistant chat instead of saving a task directly from the form', () => {
    const script = readAppScript()

    expect(script).toContain('prepare_report_chat_message')
    expect(script).toContain('assistant.chat.send_message')
    expect(script).not.toContain("executeAction('save_generated_task'")
  })

  it('polls view data after sending an agent task and stops when a new task appears', () => {
    const script = readAppScript()

    expect(script).toContain('startAgentPolling')
    expect(script).toContain('AGENT_RESULT_POLL_INTERVAL_MS')
    expect(script).toContain('AGENT_RESULT_POLL_MAX_ATTEMPTS')
    expect(script).toContain('已发送给 Assistant，正在生成任务书…')
  })

  it('renders statuses, empty states and retry-friendly load errors', () => {
    const script = readAppScript()

    expect(script).toContain('pending_confirmation')
    expect(script).toContain('needs_supplement')
    expect(script).toContain('已驳回')
    expect(script).toContain('暂无任务。切换到「提交需求」标签页')
    expect(script).toContain('刷新被中断，请稍后重试。')
    expect(script).toContain('formatLoadError')
  })

  it('supports one-click supplement draft fill and human confirmation actions', () => {
    const script = readAppScript()

    expect(script).toContain('applySupplementDraft')
    expect(script).toContain('一键填入')
    expect(script).toContain('confirm_task')
    expect(script).toContain('start_processing')
    expect(script).toContain('complete_task')
    expect(script).toContain('reject_and_close')
  })

  it('uses confirmation dialogs for reject and complete instead of native confirms', () => {
    const script = readAppScript()

    expect(script).not.toContain('window.confirm')
    expect(script).toContain('sti-dialog-mask')
    expect(script).toContain('驳回关闭任务')
    expect(script).toContain('标记完成')
  })

  it('reports iframe height from its own shell content instead of the parent-sized body', () => {
    const script = readAppScript()

    expect(script).not.toContain('document.body.scrollHeight')
    expect(script).toContain('shell.getBoundingClientRect().height')
  })
})
