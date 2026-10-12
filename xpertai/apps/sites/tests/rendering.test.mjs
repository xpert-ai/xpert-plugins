import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'
import { buildPreviewHtml } from '../.artifacts/sites-spec/lib/sites-bundle.js'

test('classic scripts keep global functions, variables and cross-script callers', async () => {
  const html = await buildPreviewHtml([
    { path: 'index.html', content: '<button onclick="increment()">Increment</button><script src="./state.js"></script><script src="./actions.js"></script><script>increment()</script>' },
    { path: 'state.js', content: 'var count = 0; function increment() { count++; document.querySelector("button").textContent = String(count); }' },
    { path: 'actions.js', content: 'increment()' }
  ])
  const dom = new JSDOM(html, { runScripts: 'dangerously' })
  try {
    assert.equal(dom.window.count, 2)
    dom.window.document.querySelector('button').click()
    assert.equal(dom.window.count, 3)
    assert.equal(dom.window.document.querySelector('button').textContent, '3')
  } finally { dom.window.close() }
})

test('embedded local stylesheets preserve cascade order and media attributes', async () => {
  const html = await buildPreviewHtml([
    { path: 'index.html', content: '<head><style>body{color:green}</style><link id="theme" rel="stylesheet" href="theme.css"><style>body{color:blue}</style><link rel="stylesheet" href="print.css" media="print" title="Print"></head><body>Fixture</body>' },
    { path: 'theme.css', content: 'body{color:red}' },
    { path: 'print.css', content: 'body{font-size:10pt}' }
  ])
  const dom = new JSDOM(html)
  try {
    assert.equal(dom.window.getComputedStyle(dom.window.document.body).color, 'rgb(0, 0, 255)')
    assert.equal(dom.window.document.querySelector('#theme').tagName, 'STYLE')
    const print = dom.window.document.querySelector('style[media="print"]')
    assert.equal(print?.getAttribute('title'), 'Print')
    assert.match(print.textContent, /10pt/)
    assert.equal(dom.window.document.querySelectorAll('link[rel="stylesheet"]').length, 0)
  } finally { dom.window.close() }
})
