import readline from 'node:readline'
const send = (value) => process.stdout.write(`${JSON.stringify(value)}\n`)
const mode = process.argv[2]
for await (const line of readline.createInterface({ input: process.stdin })) {
  const request = JSON.parse(line)
  if (mode === 'codex') {
    if (request.method === 'initialize') send({ id: request.id, result: {} })
    if (request.method === 'thread/start') send({ id: request.id, result: { thread: { id: 'thread-fixture' } } })
    if (request.method === 'turn/start') {
      send({ id: request.id, result: { turn: { id: 'turn-fixture', status: 'inProgress' } } })
      send({
        id: 91,
        method: 'item/commandExecution/requestApproval',
        params: {
          threadId: 'thread-fixture',
          turnId: 'turn-fixture',
          itemId: 'item-1',
          command: 'fixture',
          reason: 'Test approval'
        }
      })
    }
    if (request.id === 91) {
      send({ method: 'item/agentMessage/delta', params: { delta: 'approved result 中文' } })
      send({ method: 'turn/completed', params: { turn: { id: 'turn-fixture', status: 'completed' } } })
    }
    if (request.method === 'turn/interrupt') {
      send({ id: request.id, result: {} })
      setTimeout(
        () => send({ method: 'turn/completed', params: { turn: { id: 'turn-fixture', status: 'interrupted' } } }),
        30
      )
    }
  } else {
    send({ id: request.id, type: 'response', command: request.type, success: true })
    if (request.type === 'prompt') {
      send({ type: 'message_end', message: { role: 'assistant', content: [], stopReason: 'error' } })
      send({ type: 'agent_end' })
      setTimeout(() => {
        send({
          type: 'message_end',
          message: { role: 'assistant', content: [{ type: 'text', text: 'retry completed 中文' }], stopReason: 'stop' }
        })
        send({ type: 'agent_settled' })
      }, 40)
    }
  }
}
