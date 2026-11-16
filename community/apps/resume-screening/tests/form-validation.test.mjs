import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { runInNewContext } from 'node:vm'
import { fileURLToPath } from 'node:url'

const { outputFiles } = await build({ entryPoints: [fileURLToPath(new URL('../src/lib/remote-components/resume_screening__remote/src/screening-form.ts', import.meta.url))],
  bundle: true, write: false, format: 'iife', globalName: 'form' })
const runtime = {}
runInNewContext(outputFiles[0].text, runtime)
const valid = { title: 'Fictional screening', jobTitle: 'Java engineer', jdText: 'Fictional job', minYears: '5', skills: 'Java' }

test('missing fields identify what must be corrected and clear as the form is completed', () => {
  const errors = runtime.form.screeningFormErrors({ title: '', jobTitle: ' ', jdText: '', minYears: '', skills: '' })
  assert.equal(errors.title, 'fieldTitleRequired')
  assert.equal(errors.jobTitle, 'fieldJobRequired')
  assert.equal(errors.jdText, 'fieldJdRequired')
  assert.equal(errors.skills, 'fieldSkillsRequired')
  assert.equal(errors.minYears, 'fieldYearsInvalid')
  assert.ok(Object.values(runtime.form.screeningFormErrors(valid)).every((value) => value === null))
})

test('year boundaries and invalid values give a specific correction instead of silent disabling', () => {
  for (const minYears of ['-1', '51', '1.5', 'abc', ' ']) {
    assert.equal(runtime.form.screeningFormErrors({ ...valid, minYears }).minYears, 'fieldYearsInvalid')
  }
  for (const minYears of ['0', '50']) {
    assert.equal(runtime.form.screeningFormErrors({ ...valid, minYears }).minYears, null)
  }
})
