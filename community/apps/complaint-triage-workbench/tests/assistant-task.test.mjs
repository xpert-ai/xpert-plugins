import 'reflect-metadata'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ServiceUnavailableException } from '@nestjs/common'
import {
  ComplaintAssistantTaskService,
  ComplaintTriageViewProvider,
  COMPLAINT_TRIAGE_TOOL_NAME,
  COMPLAINT_TRIAGE_WORKBENCH_VIEW_KEY,
  COMPLAINT_TRIAGE_RUNTIME_PROBE_VIEW_KEY
} from '../dist/index.js'

test('starts an Assistant Task runtime probe against the host Xpert', async () => {
  const calls = []
  const service = new ComplaintAssistantTaskService(
    {
      require() {
        return {
          async startTask(input) {
            calls.push(input)
            return {
              status: 'running',
              taskId: 'task-1',
              executionId: 'execution-1',
              conversationId: 'conversation-1'
            }
          }
        }
      }
    },
    {}
  )

  const result = await service.startRuntimeProbe('xpert-1')

  assert.equal(result.status, 'running')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].xpertId, 'xpert-1')
  assert.match(calls[0].clientMessageId, /^complaint-runtime-probe:/)
  assert.equal(calls[0].correlation.namespace, 'complaint_triage_runtime_probe')
})

test('resolves runtime probe status through the platform capability', async () => {
  const service = new ComplaintAssistantTaskService(
    {
      require() {
        return {
          async startTask() {
            throw new Error('not used')
          },
          async getTaskStatus(input) {
            return { status: 'succeeded', executionId: input.executionId }
          }
        }
      }
    },
    {}
  )

  const result = await service.getRuntimeProbeStatus({ executionId: 'execution-1' })
  assert.deepEqual(result, { status: 'succeeded', executionId: 'execution-1' })
})

test('view action uses the resolved host Xpert instead of accepting a target id', async () => {
  const calls = []
  const provider = new ComplaintTriageViewProvider(
    {
      async startRuntimeProbe(xpertId) {
        calls.push(xpertId)
        return { status: 'running', executionId: 'execution-1' }
      }
    },
    {}
  )
  const context = { hostType: 'agent', hostId: 'published-xpert-1' }

  const result = await provider.executeViewAction(
    context,
    COMPLAINT_TRIAGE_RUNTIME_PROBE_VIEW_KEY,
    'start_runtime_probe',
    { input: { xpertId: 'untrusted-xpert' } }
  )

  assert.equal(result.success, true)
  assert.deepEqual(calls, ['published-xpert-1'])
})

test('starts complaint analysis for the existing case and persists task references', async () => {
  const calls = []
  const service = new ComplaintAssistantTaskService(
    {
      require() {
        return {
          async startTask(input) {
            calls.push(input)
            return {
              status: 'running',
              taskId: 'task-1',
              executionId: 'execution-1',
              conversationId: 'conversation-1'
            }
          }
        }
      }
    },
    {
      async beginAnalysis() {
        return {
          id: 'case-1',
          customerName: 'Alice',
          customerReference: 'ORDER-1',
          complaintContent: 'The product arrived damaged.',
          status: 'PROCESSING',
          attemptId: 'attempt-1'
        }
      },
      async recordTaskReference(_scope, _caseId, _attemptId, task) {
        return { id: 'case-1', status: 'PROCESSING', attemptId: 'attempt-1', ...task }
      },
      async failAnalysis() {
        throw new Error('not used')
      }
    }
  )

  const result = await service.startCaseAnalysis(
    { tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1' },
    'xpert-1',
    'case-1'
  )

  assert.equal(result.case.id, 'case-1')
  assert.equal(calls[0].xpertId, 'xpert-1')
  assert.match(calls[0].prompt, new RegExp(COMPLAINT_TRIAGE_TOOL_NAME))
  assert.equal(calls[0].correlation.subjectId, 'case-1')
  assert.equal(calls[0].correlation.operationId, 'attempt-1')
})

test('marks the current case failed when the Assistant task cannot start', async () => {
  const failures = []
  const service = new ComplaintAssistantTaskService(
    {
      require() {
        return {
          async startTask() {
            throw new Error('provider token=secret-value is unavailable')
          }
        }
      }
    },
    {
      async beginAnalysis() {
        return {
          id: 'case-1',
          customerName: 'Alice',
          complaintContent: 'Damaged product.',
          status: 'PROCESSING',
          attemptId: 'attempt-1'
        }
      },
      async failAnalysis(...args) {
        failures.push(args)
        return { id: 'case-1', status: 'FAILED' }
      }
    }
  )

  await assert.rejects(
    service.startCaseAnalysis(
      { tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1' },
      'xpert-1',
      'case-1'
    ),
    (error) => {
      assert.match(error.message, /provider token=\[redacted\]/)
      assert.doesNotMatch(error.message, /secret-value/)
      return true
    }
  )
  assert.equal(failures.length, 1)
  assert.equal(failures[0][3], 'assistant_task_start_failed')
  assert.doesNotMatch(failures[0][4], /secret-value/)
})

test('sanitizes task status errors returned to the UI', async () => {
  const service = new ComplaintAssistantTaskService({
    require() {
      return { async getTaskStatus() {
        return { status: 'failed', errorMessage: 'token=private-token Bearer private-bearer sk-private-key {"api_key":"private-json-key","refresh_token":"private-refresh"}' }
      } }
    }
  }, {})
  const result = await service.getRuntimeProbeStatus({ taskId: 'task-1' })
  assert.equal(result.status, 'failed')
  assert.doesNotMatch(result.errorMessage, /private-token|private-bearer|sk-private-key|private-json-key|private-refresh/)
  assert.match(result.errorMessage, /redacted/)
})

for (const status of ['failed', 'interrupted']) {
  test(`reconciles a ${status} task into FAILED with a sanitized error`, async () => {
    const processing = { id: 'case-1', status: 'PROCESSING', attemptId: 'attempt-1', assistantTaskId: 'task-1' }
    const service = new ComplaintAssistantTaskService({ require() {
      return { async getTaskStatus() { return { status, errorMessage: 'token=private-task-secret' } } }
    } }, {
      async getCase() { return processing },
      async failAnalysis(_scope, caseId, attemptId, code, message) {
        assert.equal(caseId, processing.id)
        assert.equal(attemptId, processing.attemptId)
        return { ...processing, status: 'FAILED', errorCode: code, errorMessage: message }
      }
    })
    const result = await service.reconcileCaseAnalysis({ tenantId: 'tenant-1' }, 'case-1')
    assert.equal(result.case.status, 'FAILED')
    assert.equal(result.case.errorCode, `assistant_task_${status}`)
    assert.doesNotMatch(JSON.stringify(result), /private-task-secret/)
  })
}

test('returns sanitized failures for both workbench and asynchronous probe actions', async () => {
  const provider = new ComplaintTriageViewProvider({
    async startCaseAnalysis() { throw new Error('api_key=private-key Bearer private-bearer') },
    async startRuntimeProbe() { throw new Error('token=private-token') }
  }, {})
  const context = { hostType: 'agent', hostId: 'host-1', tenantId: 'tenant-1', userId: 'user-1' }
  for (const [view, action, input] of [
    [COMPLAINT_TRIAGE_WORKBENCH_VIEW_KEY, 'analyze_case', { caseId: '8b80993e-5968-4dcf-b4f6-0249fd4f1dc8' }],
    [COMPLAINT_TRIAGE_RUNTIME_PROBE_VIEW_KEY, 'start_runtime_probe', {}]
  ]) {
    const result = await provider.executeViewAction(context, view, action, { input })
    assert.equal(result.success, false)
    assert.match(result.message.en_US, /redacted/)
    assert.doesNotMatch(result.message.en_US, /private-key|private-bearer|private-token/)
  }
})

test('sanitizes HTTP exception responses and caps the visible message length', async () => {
  const provider = new ComplaintTriageViewProvider({
    async startCaseAnalysis() {
      throw new ServiceUnavailableException({ message: 'api_key=private-http-key ' + 'x'.repeat(1000) })
    }
  }, {})
  const result = await provider.executeViewAction(
    { hostType: 'agent', hostId: 'host-1', tenantId: 'tenant-1' },
    COMPLAINT_TRIAGE_WORKBENCH_VIEW_KEY, 'analyze_case',
    { input: { caseId: '8b80993e-5968-4dcf-b4f6-0249fd4f1dc8' } }
  )
  assert.equal(result.success, false)
  assert.doesNotMatch(result.message.en_US, /private-http-key/)
  assert.equal(result.message.en_US.length, 500)
})

test('view create action validates inputs and uses only the trusted host scope', async () => {
  const calls = []
  const provider = new ComplaintTriageViewProvider({}, {
    async createCase(scope, input) { calls.push({ scope, input }); return { id: 'created-1' } }
  })
  const context = {
    hostType: 'agent', hostId: 'host-1', tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1'
  }
  for (const input of [
    { customerName: '', complaintContent: 'Damaged.' },
    { customerName: 'Alice', complaintContent: 'Damaged.', tenantId: 'untrusted-tenant' }
  ]) {
    const result = await provider.executeViewAction(context, COMPLAINT_TRIAGE_WORKBENCH_VIEW_KEY, 'create_case', { input })
    assert.equal(result.success, false)
  }
  assert.equal(calls.length, 0)
  const input = { customerName: 'Alice', complaintContent: 'Damaged.' }
  const result = await provider.executeViewAction(context, COMPLAINT_TRIAGE_WORKBENCH_VIEW_KEY, 'create_case', { input })
  assert.equal(result.success, true)
  assert.equal(result.refresh, true)
  assert.deepEqual(calls, [{ scope: { tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1' }, input }])
})

test('view data reports an empty table without trying to load a nonexistent selection', async () => {
  const provider = new ComplaintTriageViewProvider({}, {
    async listCases(scope) {
      assert.equal(scope.tenantId, 'tenant-1')
      return { items: [], total: 0, page: 1, pageSize: 20 }
    },
    async getCase() { assert.fail('An empty table has no default selected case') }
  })
  const result = await provider.getViewData(
    { hostType: 'agent', hostId: 'host-1', tenantId: 'tenant-1' },
    COMPLAINT_TRIAGE_WORKBENCH_VIEW_KEY, {}
  )
  assert.equal(result.empty, true)
  assert.equal(result.selectedCase, null)
  assert.equal(result.table.total, 0)
  assert.deepEqual(result.table.items, [])
})

test('retry dispatch uses retryAnalysis on the supplied case rather than creating one', async () => {
  const calls = []
  const service = new ComplaintAssistantTaskService({ require() {
    return { async startTask(input) { calls.push(input); return { status: 'running', taskId: 'task-2' } } }
  } }, {
    async retryAnalysis(_scope, caseId) {
      assert.equal(caseId, 'case-original')
      return { id: caseId, customerName: 'Alice', complaintContent: 'Damaged.', attemptId: 'attempt-2' }
    },
    async beginAnalysis() { assert.fail('Retry must not begin a fresh draft analysis') },
    async recordTaskReference(_scope, caseId, attemptId) { return { id: caseId, attemptId } }
  })
  const result = await service.startCaseAnalysis({ tenantId: 'tenant-1' }, 'host-1', 'case-original', true)
  assert.equal(result.case.id, 'case-original')
  assert.equal(calls[0].correlation.subjectId, 'case-original')
  assert.equal(calls[0].correlation.operationId, 'attempt-2')
})

test('reconciles a succeeded task without tool writeback as a retryable failure', async () => {
  const failures = []
  const processing = {
    id: 'case-1',
    status: 'PROCESSING',
    attemptId: 'attempt-1',
    assistantTaskId: 'task-1'
  }
  const service = new ComplaintAssistantTaskService(
    {
      require() {
        return {
          async startTask() {
            throw new Error('not used')
          },
          async getTaskStatus() {
            return { status: 'succeeded', taskId: 'task-1' }
          }
        }
      }
    },
    {
      async getCase() {
        return processing
      },
      async failAnalysis(_scope, _caseId, _attemptId, code, message) {
        failures.push({ code, message })
        return { ...processing, status: 'FAILED', errorCode: code, errorMessage: message }
      }
    }
  )

  const result = await service.reconcileCaseAnalysis(
    { tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1' },
    'case-1'
  )

  assert.equal(result.case.status, 'FAILED')
  assert.equal(failures[0].code, 'analysis_result_missing')
  assert.match(failures[0].message, /without submitting a structured triage result/i)
})
