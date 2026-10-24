import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { BadRequestException } from '@nestjs/common'
import { wav } from '../src/audio.js'
import { sha256 } from '../src/file-store.js'
import { Meetings } from '../src/meetings.js'
import { Processing } from '../src/processing.js'
import { saveSummary } from '../src/summary-store.js'
import type { Scope } from '../src/domain.js'
import { TestFileStore, join } from './storage-fixture.js'

const scope: Scope = {
  tenantId: 'tenant',
  organizationId: 'org',
  userId: 'alice',
  assistantId: 'assistant'
}
const empty = () => {
  throw new BadRequestException('speech_to_text_transcription_empty')
}
const code = (expected: string) => (error: unknown) => error instanceof Error && error.message === expected
const chunkBytes = 240044

async function fixture(t: TestContext, count: number) {
  const root = await mkdtemp(join(tmpdir(), 'meetings-empty-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const store = new TestFileStore(root)
  const service = new Meetings(store, async () => {})
  const input = {
    id: randomUUID(),
    sessionId: randomUUID(),
    title: 'Speech with pauses'
  }
  await service.create(scope, input)
  await service.start(scope, input.id, input.sessionId)
  for (const track of ['microphone', 'system'] as const) {
    for (let sequence = 0; sequence < count; sequence++) {
      const pcm = Buffer.alloc(chunkBytes - 44)
      if (track === 'microphone') {
        for (let i = 0; i < pcm.length; i += 2) pcm.writeInt16LE((sequence + 1) * 1000, i)
      }
      const audio = wav(pcm)
      await service.upload(
        scope,
        {
          meetingId: input.id,
          sessionId: input.sessionId,
          track,
          sequence,
          startMs: sequence * 5000,
          endMs: (sequence + 1) * 5000,
          sha256: sha256(audio)
        },
        audio
      )
    }
  }
  let summaries = 0
  return {
    store,
    service,
    id: input.id,
    summaries: () => summaries,
    finish: () =>
      service.finish(scope, {
        meetingId: input.id,
        sessionId: input.sessionId,
        durationMs: count * 5000,
        reason: 'user',
        chunks: { microphone: count, system: count }
      }),
    worker: (transcribe: (audio: Buffer) => Promise<string>) =>
      new Processing(
        store,
        { transcribe: (_scope, audio) => transcribe(audio) },
        {
          live: async () => {},
          finish: async (scope, meeting) => {
            summaries++
            await saveSummary(store, scope, input.id, meeting, {
              overview: 'Recorded speech',
              decisions: [],
              actions: [],
              questions: []
            })
          }
        }
      )
  }
}

for (const live of [true, false]) {
  test(`${live ? 'live' : 'sealed tail'} transcription continues past an empty fragment`, async (t) => {
    const f = await fixture(t, 3)
    const recognized: number[] = []
    const worker = f.worker(async (audio) => {
      if (audio.length > chunkBytes) return 'First sentence. Last sentence.'
      const sequence = audio.readInt16LE(44) / 1000 - 1
      recognized.push(sequence)
      if (sequence === 1) return empty()
      return sequence === 0 ? 'First sentence.' : 'Last sentence.'
    })
    if (live) {
      await worker.live(scope, f.id)
      const record = await f.store.read(scope, f.id)
      assert.equal(record.liveTranscription.status, 'listening')
      assert.equal(record.liveTranscription.errorCode, null)
      assert.deepEqual(
        record.transcript.filter((s) => s.track === 'microphone').map((s) => s.text),
        ['First sentence.', '', 'Last sentence.']
      )
      await worker.live(scope, f.id)
    }
    await f.finish()
    await worker.run(scope, f.id)
    assert.deepEqual(recognized, [0, 1, 2])
    const record = await f.store.read(scope, f.id)
    assert.equal(record.processing, 'ready')
    assert.equal(record.transcript.find((s) => s.track === 'microphone')?.text, 'First sentence. Last sentence.')
    assert.equal(f.summaries(), 1)
    await assert.rejects(stat(join(f.store.directory(scope, f.id), 'audio')))
  })
}

test('an empty contextual batch does not block later speech or final minutes', async (t) => {
  const f = await fixture(t, 13)
  let contextualCalls = 0
  const worker = f.worker(async (audio) => {
    if (audio.length > chunkBytes) {
      contextualCalls++
      return empty()
    }
    return audio.readInt16LE(44) === 13000 ? 'Later speech.' : ''
  })
  await f.finish()
  await worker.run(scope, f.id)
  const record = await f.store.read(scope, f.id)
  assert.equal(record.processing, 'ready')
  assert.equal(contextualCalls, 1)
  assert.deepEqual(
    record.transcript.filter((s) => s.track === 'microphone').map((s) => [s.startMs, s.endMs, s.text, s.final]),
    [
      [0, 60000, '', true],
      [60000, 65000, 'Later speech.', true]
    ]
  )
  assert.equal(f.summaries(), 1)
})

for (const result of ['host empty error', 'inline whitespace'] as const) {
  test(`a wholly empty recording (${result}) retains audio and can be retried with a working model`, async (t) => {
    const f = await fixture(t, 2)
    let recovered = false
    let calls = 0
    const worker = f.worker(async () => {
      calls++
      if (recovered) return 'Recovered speech.'
      return result === 'host empty error' ? empty() : ' \n '
    })
    await f.finish()
    await assert.rejects(worker.run(scope, f.id), code('transcript_empty'))
    const failed = await f.store.read(scope, f.id)
    assert.equal(failed.processing, 'failed')
    assert.equal(failed.errorCode, 'transcript_empty')
    assert.ok(failed.transcript.every((s) => s.final && s.text === ''))
    assert.equal(f.summaries(), 0)
    assert.ok((await stat(join(f.store.directory(scope, f.id), 'audio'))).isDirectory())
    const failedCalls = calls
    recovered = true
    await f.service.retry(scope, f.id)
    assert.deepEqual((await f.store.read(scope, f.id)).transcript, [])
    assert.deepEqual(JSON.parse(await readFile(join(f.store.directory(scope, f.id), 'transcript.json'), 'utf8')), [])
    await worker.run(scope, f.id)
    assert.ok(calls > failedCalls)
    assert.equal((await f.store.read(scope, f.id)).processing, 'ready')
    assert.equal(f.summaries(), 1)
  })
}

test('provider failures during contextual refinement remain retryable errors', async (t) => {
  const f = await fixture(t, 2)
  const failure = new Error('provider_timeout')
  const worker = f.worker(async (audio) => {
    if (audio.length > chunkBytes) throw failure
    return 'Valid live speech.'
  })
  await f.finish()
  await assert.rejects(worker.run(scope, f.id), (error) => error === failure)
  const record = await f.store.read(scope, f.id)
  assert.equal(record.processing, 'failed')
  assert.equal(record.errorCode, 'processing_failed')
  assert.equal(f.summaries(), 0)
  assert.ok((await stat(join(f.store.directory(scope, f.id), 'audio'))).isDirectory())
})
