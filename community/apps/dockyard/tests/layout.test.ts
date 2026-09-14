import test from 'node:test'
import assert from 'node:assert/strict'
import { validateWorkspace } from '../src/lib/domain/layout.js'
import { fixture } from './fixtures.js'

test('saved layout validation preserves valid Dockyard state and rejects malformed layouts', () => {
  const {manager,state} = fixture()
  try {
    assert.deepEqual(validateWorkspace(state),state)
    assert.throws(() => validateWorkspace({...state,layoutJson:'not json'}), /invalid_layout/)
  } finally { manager.Dispose() }
})
