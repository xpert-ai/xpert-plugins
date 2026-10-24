import assert from 'node:assert/strict'
import { test } from 'node:test'
import { requireDorisReadStatement } from '../dist/doris.js'
// SQL validation must never reinterpret quoted text/comments as executable tokens.
test('Doris function exceptions do not admit quoted or qualified stored routines', () => {
  for (const sql of ["SELECT 'CURRENT_USER()' AS x", 'SELECT CURRENT_USER() AS usr', 'SELECT 1 /* CURRENT_USER() */'])
    assert.doesNotThrow(() => requireDorisReadStatement(sql))
  for (const sql of [
    'SELECT evil.CURRENT_USER()',
    'SELECT "CURRENT_USER"()',
    'SELECT CURRENT_USER();CALL x()',
    'SELECT CURRENT_USER() FOR UPDATE',
    'SELECT @secret',
    'SHOW DATA FROM x WHERE 1=1'
  ])
    assert.throws(() => requireDorisReadStatement(sql))
})
