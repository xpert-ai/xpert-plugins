export async function validateDocument(input, browser, hostPath) {
const errors = [], addError = value => { const message = String(value).slice(0, 300); if (errors.length < 16 && !errors.includes(message)) errors.push(message) }
  const loadedResources = new Set()
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' })
  try {
  const page = await context.newPage()
  await page.route('**/*', async route => {
    const request = route.request()
    const allowed = request.method() === 'GET' && await page.evaluate(({ type, url }) =>
      DocumentHost.isDashboardResourceAllowed(type, url), { type: request.resourceType(), url: request.url() })
    if (allowed) await route.continue()
    else await route.abort('blockedbyclient')
  })
  page.on('requestfailed', request => addError(`DOCUMENT_RESOURCE_LOAD_FAILED: ${request.resourceType()} ${request.url().split('?')[0]} (${request.failure()?.errorText ?? 'request failed'})`))
  page.on('response', response => {
    if (response.status() >= 400) addError(`DOCUMENT_RESOURCE_HTTP_ERROR: ${response.status()} ${response.url().split('?')[0]}`)
    else if (response.status() < 300 || response.status() === 304) {
      for (let request = response.request(); request; request = request.redirectedFrom()) loadedResources.add(request.url().split('#')[0])
    }
  })
  page.on('pageerror', error => addError(error.message))
  page.on('console', message => { if (message.type() === 'error') addError(message.text()) })
  await page.setContent('<!doctype html><html><head></head><body><iframe style="width:100%;height:850px"></iframe></body></html>')
  await page.addScriptTag({ path: hostPath })
  await page.evaluate(input => {
    window.validation = { errors: [], requestedBindings: [], controlsByBinding: {} }
    const initialized = new Set()
    DocumentHost.installArtifactDocumentFramePolicy(document)
    window.documentHost = DocumentHost.mountArtifactDocument(document.querySelector('iframe'), {
      html: input.html, context: input.context, dependencies: input.dependencies ?? [],
      query: async request => {
        window.validation.requestedBindings.push(request.bindingId)
        if (!input.datasets[request.bindingId]) {
          window.validation.errors.push('DOCUMENT_BINDING_DENIED')
          throw Error('DOCUMENT_BINDING_DENIED')
        }
        // The document SDK sends page-wide controls; the backend selects parameters per Binding.
        const allParameters = input.parameters ? Object.values(input.parameters).flat() : undefined
        const parameters = input.parameters?.[request.bindingId]
        const defaults = input.context.defaults
        if (!initialized.has(request.bindingId) && (Object.keys(request.controls).length !== Object.keys(defaults).length || Object.entries(defaults).some(([key, value]) => request.controls[key] !== value))) {
          window.validation.errors.push('DOCUMENT_INITIAL_CONTROLS_MISMATCH: initial query controls must match saved controls.defaultValue, including null')
          throw Error('DOCUMENT_INITIAL_CONTROLS_MISMATCH')
        }
        if (allParameters && (!parameters || Object.keys(request.controls).some(key => !allParameters.some(parameter => parameter.controlId === key)) || parameters.some(parameter => {
          // Match platform resolveAnalyticsParameters: missing values use the Binding default,
          // optional null bypasses the scalar allowlist, and only this Binding is evaluated.
          const value = Object.hasOwn(request.controls, parameter.controlId) ? request.controls[parameter.controlId] : parameter.defaultValue
          if (value == null) return parameter.required
          const valid = parameter.type === 'date'
            ? typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
            : typeof value === parameter.type && (typeof value !== 'number' || Number.isFinite(value))
          return !valid || parameter.allowedValues && !parameter.allowedValues.includes(value)
        }))) {
          window.validation.errors.push('DOCUMENT_CONTROL_VALUE_INVALID: select values must match Binding parameter types and allowedValues; fixed enums must not use Dataset fields as options')
          throw Error('DOCUMENT_CONTROL_VALUE_INVALID')
        }
        initialized.add(request.bindingId)
        window.validation.controlsByBinding[request.bindingId] = { ...request.controls }
        return input.datasets[request.bindingId]
      }, onError: code => window.validation.errors.push(code)
    })
  }, input)
  await page.waitForFunction(() => window.validation.requestedBindings.length || window.validation.errors.length, null, { timeout: 15000 }).catch(() => addError('DOCUMENT_INITIAL_QUERY_MISSING'))
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => addError('DOCUMENT_RESOURCE_LOAD_TIMEOUT'))
  await page.waitForTimeout(500)
  await page.waitForFunction(ids => ids.every(id => window.validation.requestedBindings.includes(id)),
    input.context.bindingIds, { timeout: 2000 }).catch(() => {})
  const initiallyRequested = await page.evaluate(() => window.validation.requestedBindings)
  for (const id of input.context.bindingIds) {
    if (!initiallyRequested.includes(id)) addError(`DOCUMENT_INITIAL_BINDING_MISSING: ${id}. Subscribe and query every saved Binding on initial load.`)
  }
  const frame = page.frames().find(frame => frame !== page.mainFrame())
  if (frame) {
    const resources = await frame.locator('script[src], link[rel~="stylesheet"][href]').evaluateAll(elements => elements.map(element =>
      element instanceof HTMLScriptElement ? element.src : element.href))
    for (const url of resources) if (/^https?:/.test(url) && !loadedResources.has(url.split('#')[0]))
      addError(`DOCUMENT_RESOURCE_NOT_LOADED: ${url.split('?')[0]}. Online scripts and styles must load successfully before saving.`)
  }
  // Exercise bounded native selects against the saved parameter contract; data remains the real default preview.
  // This detects invalid filter wiring, not the upstream effect of a filter or arbitrary custom controls.
  if (frame && input.parameters) {
    const selects = frame.locator('select')
    for (let index = 0; index < Math.min(await selects.count(), 24); index++) {
      const select = selects.nth(index)
      if (!(await select.isVisible()) || !(await select.isEnabled())) continue
      const original = await select.inputValue()
      const values = await select.locator('option').evaluateAll(options => options.filter(option => !option.matches(':disabled')).map(option => option.value))
      const alternatives = [...new Set(values)].filter(value => value !== original).slice(0, 3)
      const controlId = await select.getAttribute('data-dashboard-control')
      const presentationOnly = await select.getAttribute('data-dashboard-presentation') !== null
      const declared = Object.values(input.parameters).flat()
      if (controlId && (presentationOnly || !declared.some(parameter => parameter.controlId === controlId))) {
        addError('DOCUMENT_SELECT_BINDING_INVALID: data-dashboard-control must name a declared control and cannot also be presentation-only')
        continue
      }
      if (!controlId && !presentationOnly && declared.length) {
        addError('DOCUMENT_SELECT_BINDING_REQUIRED: mark a data select with data-dashboard-control="<controlId>"; mark a purely visual selector with data-dashboard-presentation. Do not guess from labels.')
        continue
      }
      if (controlId && !values.length) {
        addError(`DOCUMENT_SELECT_OPTIONS_MISSING: ${controlId} has no enabled options. Populate the data select from verified values before interaction, or disable it when no choices are available.`)
        continue
      }
      if (!alternatives.length) continue
      for (const value of [...alternatives, original]) {
        const before = await page.evaluate(() => window.validation.controlsByBinding)
        await select.selectOption(value, { timeout: 1000 }).catch(() => addError(value === original ? 'DOCUMENT_SELECT_RESTORE_FAILED' : 'DOCUMENT_SELECT_INTERACTION_FAILED'))
        await page.waitForTimeout(150)
        if (controlId) await page.waitForFunction(({ before, controlId, parameters }) =>
          Object.entries(window.validation.controlsByBinding).some(([id, controls]) =>
            parameters[id]?.some(parameter => parameter.controlId === controlId) && controls[controlId] !== before[id]?.[controlId]),
        { before, controlId, parameters: input.parameters }, { timeout: 1000 }).catch(() => addError(`DOCUMENT_CONTROL_QUERY_MISSING: ${controlId} changed in the page without querying its Binding. Call live.query for every affected Binding; local row filtering is not a data refresh.`))
        // Allow asynchronous panel handlers to propagate a shared value before reporting a stale panel.
        await page.waitForFunction(({ before, parameters }) => {
          const after = window.validation.controlsByBinding
          return Object.entries(after).every(([bindingId, controls]) => (parameters[bindingId] ?? []).every(parameter => {
            const key = parameter.controlId, selected = controls[key]
            return selected === before[bindingId]?.[key] || Object.entries(parameters).every(([id, entries]) =>
              !entries.some(entry => entry.controlId === key) || after[id]?.[key] === selected)
          }))
        }, { before, parameters: input.parameters }, { timeout: 1000 }).catch(() => {})
        const after = await page.evaluate(() => window.validation.controlsByBinding)
        // A shared control ID denotes one page-wide value. Independent filters need distinct IDs.
        for (const [bindingId, controls] of Object.entries(after)) {
          for (const parameter of input.parameters[bindingId] ?? []) {
            const key = parameter.controlId, selected = controls[key]
            if (selected === before[bindingId]?.[key]) continue
            const missing = Object.entries(input.parameters).filter(([id, parameters]) =>
              parameters.some(parameter => parameter.controlId === key) && after[id]?.[key] !== selected
            ).map(([id]) => id)
            if (missing.length) addError(`DOCUMENT_SHARED_CONTROL_NOT_PROPAGATED: ${key} must query affected Bindings: ${missing.join(', ')}. bindSelect updates one Binding; use a custom select to query every affected Binding.`)
          }
        }
      }
    }
    await page.waitForTimeout(150)
  }
  // Page buttons are untrusted executable UI too. Exercise a bounded set inside
  // the isolated preview; do not guess which button is refresh from its label.
  if (frame) {
    const buttons = frame.locator('button')
    for (let index = 0; index < Math.min(await buttons.count(), 12); index++) {
      const button = buttons.nth(index)
      if (!(await button.isVisible()) || !(await button.isEnabled())) continue
      await button.click({ timeout: 1000 }).catch(() => addError('DOCUMENT_BUTTON_INTERACTION_FAILED'))
      await page.waitForTimeout(200)
    }
  }
  // Exercise the same refresh event as the Workbench. A renderer that fails on its
  // second Dataset must not pass merely because the first query painted a page.
  await page.evaluate(() => window.documentHost.refresh())
  await page.waitForTimeout(300)
  const state = await page.evaluate(() => window.validation)
  state.errors.forEach(addError)
  const renderedTextLength = frame ? (await frame.locator('body').innerText()).trim().length : 0
  if (!renderedTextLength) addError('DOCUMENT_EMPTY_PAGE')
  if (!state.requestedBindings.length) addError('DOCUMENT_INITIAL_QUERY_MISSING')
  return { ok: !errors.length, errors, requestedBindings: [...new Set(state.requestedBindings)], renderedTextLength }
  } finally { await context.close() }
}
