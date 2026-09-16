import { readFileSync } from 'fs'
import { join } from 'path'

describe('scrape task intake remote component', () => {
  function readAppScript() {
    return readFileSync(join(__dirname, 'remote-components', 'scrape-task-intake', 'app.js'), 'utf8')
  }

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
