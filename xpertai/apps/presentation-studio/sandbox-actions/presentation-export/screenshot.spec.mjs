import assert from 'node:assert/strict';
import test from 'node:test';
import {
  screenshotClip,
  screenshotPreparedSlide,
} from '../../assets/upstream/dashiai-ppt/project/packages/html-deck-to-pptx/src/screenshot.mjs';

test('captures the prepared slide with a page clip instead of an element screenshot', async () => {
  let elementScreenshotCalls = 0;
  let screenshotOptions;
  const page = {
    locator(selector) {
      assert.equal(selector, '#deck > .slide.active');
      return {
        boundingBox: async () => ({ x: -2, y: 3, width: 1922, height: 1077 }),
        screenshot: async () => {
          elementScreenshotCalls += 1;
          throw new Error('element screenshot must not be used');
        },
      };
    },
    viewportSize: () => ({ width: 1920, height: 1080 }),
    screenshot: async (options) => {
      screenshotOptions = options;
      return Buffer.from('png');
    },
  };

  const result = await screenshotPreparedSlide(page, 12_345);

  assert.equal(result.toString(), 'png');
  assert.equal(elementScreenshotCalls, 0);
  assert.deepEqual(screenshotOptions, {
    type: 'png',
    animations: 'disabled',
    captureBeyondViewport: false,
    clip: { x: 0, y: 3, width: 1920, height: 1077 },
    timeout: 12_345,
  });
});

test('rejects screenshot bounds that do not intersect the viewport', () => {
  assert.throws(
    () => screenshotClip({ x: 2000, y: 0, width: 100, height: 100 }, { width: 1920, height: 1080 }),
    /outside the viewport/,
  );
});
