import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { createService, JPEG_DATA_URL, newCase, PNG_DATA_URL, scope } from './fixtures.js'

test('a created case is saved with its photo and listed for its owner', async () => {
  const { db, service } = await createService()
  try {
    const created = await service.createCase(scope, { ...newCase(), title: '  Water dripping in room 3  ' })
    assert.equal(created.title, 'Water dripping in room 3')
    assert.equal(created.status, 'draft')
    assert.equal(created.revision, 1)
    assert.equal(created.canAnalyze, true)
    assert.equal(created.canConfirm, true)

    assert.deepEqual((await service.listCases(scope)).map(item => item.id), [created.id])
    const detail = await service.getCaseDetail(scope, created.id)
    assert.equal(detail.photoDataUrl, JPEG_DATA_URL)
    assert.equal(detail.suggestion, null)
    assert.equal(detail.confirmedCategoryId, null)
  } finally {
    await db.destroy()
  }
})

test('repeating a request with the same key does not create a second case or photo', async () => {
  const { db, service, photos } = await createService()
  try {
    const input = newCase('Broken lock')
    const first = await service.createCase(scope, input)
    const repeated = await service.createCase(scope, input)
    assert.equal(repeated.id, first.id)
    assert.equal((await service.listCases(scope)).length, 1)
    assert.equal(await photos.count(), 1)
  } finally {
    await db.destroy()
  }
})

test('another user cannot list, read or open the photo of the case', async () => {
  const { db, service } = await createService()
  try {
    const created = await service.createCase(scope, newCase('Flickering light'))
    const other = { ...scope, userId: 'user-2' }
    assert.deepEqual(await service.listCases(other), [])
    await assert.rejects(service.getCaseDetail(other, created.id), /not_found/)
    await assert.rejects(service.startAnalysis(other, created.id), /not_found/)
  } finally {
    await db.destroy()
  }
})

test('bad input is rejected before anything is saved', async () => {
  const { db, service, cases, photos } = await createService()
  try {
    await assert.rejects(service.createCase(scope, { ...newCase(), title: '   ' }))
    await assert.rejects(service.createCase(scope, { ...newCase(), requestKey: 'not-a-uuid' }))
    // A PNG body declared as JPEG, a non-image type, and text that is not base64.
    const disguised = PNG_DATA_URL.replace('image/png', 'image/jpeg')
    await assert.rejects(service.createCase(scope, { ...newCase(), photo: { dataUrl: disguised } }), /invalid_photo|does not match/)
    await assert.rejects(service.createCase(scope, { ...newCase(), photo: { dataUrl: 'data:image/gif;base64,R0lGOD' } }))
    await assert.rejects(service.createCase(scope, { ...newCase(), photo: { dataUrl: 'data:image/jpeg;base64,***' } }))
    assert.equal(await cases.count(), 0)
    assert.equal(await photos.count(), 0)
  } finally {
    await db.destroy()
  }
})

test('a PNG photo is accepted as well', async () => {
  const { db, service } = await createService()
  try {
    const created = await service.createCase(scope, { requestKey: randomUUID(), title: 'Cracked tile', photo: { dataUrl: PNG_DATA_URL } })
    assert.equal((await service.getCaseDetail(scope, created.id)).photoDataUrl, PNG_DATA_URL)
  } finally {
    await db.destroy()
  }
})
