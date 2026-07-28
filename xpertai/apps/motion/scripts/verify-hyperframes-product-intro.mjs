import assert from 'node:assert/strict'
import { openComposition } from '@hyperframes/sdk'
import {
  createProductIntroHyperframesComposition,
  XPERT_AI_PRODUCT_INTRO
} from '../dist/lib/hyperframes-product-intro.js'

const html = createProductIntroHyperframesComposition(XPERT_AI_PRODUCT_INTRO)
const composition = await openComposition(html)

try {
  assert.ok(composition.getElement('scene-brand'), 'brand scene should be addressable')
  assert.ok(composition.getElement('scene-cta'), 'CTA scene should be addressable')
  assert.ok(composition.getElements().length > 40, 'composition should expose editable elements')
  assert.equal(
    [...html.matchAll(/data-scene-title=/g)].length,
    6,
    'composition should contain six storyboard scenes'
  )
  assert.ok(
    [...html.matchAll(/@keyframes\s+/g)].length > 5,
    'composition should contain finite CSS animations'
  )

  await composition.batch(async () => {
    composition.setText('brand-title', 'Xpert AI — Agents at work')
    composition.setTiming('brand-title', { start: 0.75, duration: 4.2 })
    composition.setStyle('brand-title', { left: '24px', opacity: '0.95' })
  })

  const edited = composition.serialize()
  assert.match(edited, /Xpert AI — Agents at work/)
  assert.match(edited, /data-start="0.75"/)
  assert.match(edited, /data-duration="4.2"/)
  assert.match(edited, /left:\s*24px/)
  assert.match(edited, /opacity:\s*0.95/)

  console.log(
    `Hyperframes product intro verified: ${composition.getElements().length} editable elements, six scenes, SDK edits serialized.`
  )
} finally {
  composition.dispose()
}
