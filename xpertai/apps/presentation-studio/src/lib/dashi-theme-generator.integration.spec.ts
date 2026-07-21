import { spawnSync } from 'node:child_process'
import { access, copyFile, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import JSZip from 'jszip'

describe('bundled dashi-theme-generator image evidence workflow', () => {
  let root: string

  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'dashi-theme-source-')) })
  afterEach(async () => { await rm(root, { recursive: true, force: true }) })

  it('extracts an 8-page image archive and selects the image-evidence adapter', async () => {
    const archivePath = join(root, 'evidence.zip')
    const evidenceDir = join(root, 'evidence')
    const inventoryPath = join(root, 'inventory.json')
    const planPath = join(root, 'plan.json')
    const zip = new JSZip()
    for (let index = 0; index < 8; index += 1) zip.file(`slides/${index + 1}.png`, png())
    await writeFile(archivePath, await zip.generateAsync({ type: 'nodebuffer' }))

    run('extract-theme-source.mjs', ['--input', archivePath, '--source-type', 'images', '--out', evidenceDir])
    run('inspect-external-template.mjs', ['--input', evidenceDir, '--out', inventoryPath])
    run('recommend-adapter.mjs', ['--inventory', inventoryPath, '--out', planPath])

    await expect(readJson(join(evidenceDir, 'evidence-index.json'))).resolves.toMatchObject({
      imageCount: 8,
      analysis: {
        policy: 'single-primary-pass',
        maxPrimaryBatchCalls: 3,
        batches: [
          { id: 'batch-01', images: ['page-01.png', 'page-02.png', 'page-03.png'] },
          { id: 'batch-02', images: ['page-04.png', 'page-05.png', 'page-06.png'] },
          { id: 'batch-03', images: ['page-07.png', 'page-08.png'] }
        ]
      }
    })
    await expect(readJson(inventoryPath)).resolves.toMatchObject({ type: 'images', totals: { assets: 8 } })
    await expect(readJson(planPath)).resolves.toMatchObject({ selected: 'image-evidence', adapterMode: 'visual-archetype' })
  })

  it('reuses matching output and stops when extraction output is passed back as input', async () => {
    const source = join(root, 'images')
    const evidenceDir = join(root, 'evidence')
    const forbiddenRetryDir = join(root, 'evidence-v2')
    await mkdir(source)
    await Promise.all(Array.from({ length: 8 }, (_, index) => writeFile(join(source, `${index + 1}.png`), png())))

    run('extract-theme-source.mjs', ['--input', source, '--source-type', 'images', '--out', evidenceDir])
    const reused = run('extract-theme-source.mjs', ['--input', source, '--source-type', 'images', '--out', evidenceDir])
    const alreadyPrepared = run('extract-theme-source.mjs', [
      '--input', evidenceDir, '--source-type', 'images', '--out', forbiddenRetryDir
    ])

    expect(JSON.parse(reused.stdout)).toMatchObject({ status: 'reused', evidenceDirectory: evidenceDir })
    expect(JSON.parse(alreadyPrepared.stdout)).toMatchObject({
      status: 'already-prepared',
      evidenceDirectory: evidenceDir,
      nextAction: expect.stringContaining('Do not run extract-theme-source again')
    })
    await expect(access(forbiddenRetryDir)).rejects.toThrow()
  })

  it('recovers a shell-split input path containing spaces', async () => {
    const source = join(root, 'images with spaces')
    const evidenceDir = join(root, 'evidence with spaces')
    await mkdir(source)
    await Promise.all(Array.from({ length: 8 }, (_, index) => writeFile(join(source, `${index + 1}.png`), png())))

    const result = run('extract-theme-source.mjs', [
      '--input', ...source.split(' '), '--source-type', 'images', '--out', ...evidenceDir.split(' ')
    ])

    expect(JSON.parse(result.stdout)).toMatchObject({ status: 'prepared', evidenceDirectory: evidenceDir, imageCount: 8 })
  })

  it('promotes one image member to its complete collection and repairs matching incomplete output', async () => {
    const source = join(root, 'parsed-pages')
    const evidenceDir = join(root, 'evidence')
    await mkdir(source)
    await mkdir(evidenceDir)
    for (let index = 0; index < 10; index += 1) {
      const name = `page-${String(index + 1).padStart(4, '0')}.png`
      await writeFile(join(source, name), png(index))
      if (index < 8) await copyFile(join(source, name), join(evidenceDir, name))
    }

    const result = run('extract-theme-source.mjs', [
      '--input', join(source, 'page-0001.png'), '--source-type', 'images', '--out', evidenceDir
    ])

    expect(JSON.parse(result.stdout)).toMatchObject({ status: 'prepared', imageCount: 10 })
    await expect(readJson(join(evidenceDir, 'evidence-index.json'))).resolves.toMatchObject({ imageCount: 10 })
    expect((await readdir(evidenceDir)).sort()).toEqual([
      'evidence-index.json',
      ...Array.from({ length: 10 }, (_, index) => `page-${String(index + 1).padStart(2, '0')}.png`)
    ])
  })

  it('reports a platform-aware PDF renderer action without suggesting blind apt-get retries', async () => {
    const source = join(root, 'template with spaces.pdf')
    await writeFile(source, Buffer.from('%PDF-1.7\n'))

    const result = run('extract-theme-source.mjs', [
      '--input', ...source.split(' '), '--source-type', 'pdf', '--out', join(root, 'pdf-evidence')
    ], false, { env: { ...process.env, PATH: '' } })

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('Do not retry extraction or run a guessed package-manager command')
    expect(result.stderr).toContain('sourceType=images and sourceMode=image_files')
  })

  it('reuses Xpert parsed PDF page images without requiring pdftoppm', async () => {
    const assetDirectory = join(root, 'file asset with spaces')
    const pagesDirectory = join(assetDirectory, 'pages')
    const source = join(assetDirectory, 'template with spaces.pdf')
    const evidenceDir = join(root, 'pdf-evidence')
    await mkdir(pagesDirectory, { recursive: true })
    await writeFile(source, Buffer.from('%PDF-1.7\n'))
    await Promise.all(Array.from({ length: 10 }, (_, index) =>
      writeFile(join(pagesDirectory, `page-${String(index + 1).padStart(4, '0')}.png`), png())
    ))

    const result = run('extract-theme-source.mjs', [
      '--input', ...source.split(' '), '--source-type', 'pdf', '--out', evidenceDir
    ], true, { env: { ...process.env, PATH: '' } })

    expect(JSON.parse(result.stdout)).toMatchObject({ status: 'prepared', imageCount: 10 })
    await expect(readJson(join(evidenceDir, 'evidence-index.json'))).resolves.toMatchObject({
      sourceType: 'pdf',
      imageCount: 10,
      sources: expect.arrayContaining([expect.objectContaining({ evidenceSource: 'xpert-parsed-page' })]),
      analysis: { maxPrimaryBatchCalls: 4 }
    })
  })

  it('rejects image evidence with fewer than 8 pages', async () => {
    const source = join(root, 'images')
    const output = join(root, 'out')
    await mkdir(source)
    await Promise.all(Array.from({ length: 7 }, (_, index) => writeFile(join(source, `${index + 1}.png`), png())))

    const result = run('extract-theme-source.mjs', ['--input', source, '--source-type', 'images', '--out', output], false)

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('must contain 8-30 pages')
    await expect(access(output)).rejects.toThrow()
  })

  it('reports all missing external spec contract sections before planning', async () => {
    const specPath = join(root, 'external-spec.json')
    await writeFile(specPath, JSON.stringify({
      key: 'theme15',
      displayName: 'Incomplete theme',
      references: Array.from({ length: 8 }, (_, index) => `page-${index + 1}.png`),
      target: { pageCount: 84, scenario: ['sales', 'analysis'], audience: ['leaders', 'analysts'] },
      sourceThemes: ['theme07', 'theme09'],
      visualEvidence: {
        palette: ['#ffffff', '#111111', '#55bfb4', '#7355cc'],
        typography: [{ role: 'heading', weight: 700 }],
        composition: ['split layout', 'card grid'],
        surfaces: ['rounded cards', 'flat canvas'],
        imageTreatment: ['rounded crop', 'clean background'],
        motifs: ['circular arrow', 'diagonal sweep'],
        signatureRules: ['use large titles', 'keep generous whitespace'],
        forbidden: ['no neon', 'no glassmorphism']
      }
    }))

    const result = runProject('prepare-external-theme.mjs', ['--spec', specPath], false)

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('External theme spec does not satisfy the authoring contract')
    expect(result.stderr).toContain('visualEvidence.typography[0] must be a non-empty evidence string, not an object')
    expect(result.stderr).toContain('visualImplementation is required')
    expect(result.stderr).toContain('archetypes is required')
    expect(result.stderr).toContain('references/external-theme-spec-contract.md')
  })

  it('keeps the canonical external theme spec compatible with the planner', () => {
    const output = join(root, 'theme-plan.json')
    runProject('prepare-external-theme.mjs', [
      '--spec', resolve('skills/dashi-theme-generator/project/theme-evidence/theme13-commercial-plan-spec.json'),
      '--out', output
    ])

    return expect(readJson(output)).resolves.toMatchObject({ moduleSources: { observed: 8, inferred: 8 } })
  })

  it('keeps the bundled reuse-first example compatible with the planner', () => {
    const output = join(root, 'reuse-first-example-plan.json')
    runProject('prepare-external-theme.mjs', [
      '--spec', resolve('skills/dashi-theme-generator/project/theme-evidence/reuse-first-example-spec.json'),
      '--out', output
    ])

    return expect(readJson(output)).resolves.toMatchObject({
      generationMode: 'reuse-first',
      moduleSources: { observed: 2, inferred: 0 },
      recipe: { ownModuleMinimum: 2, pinnedModules: [expect.any(Object), expect.any(Object)] }
    })
  })

  it('supports a reuse-first evidence contract and pins complete original components', async () => {
    const specPath = join(root, 'reuse-first-spec.json')
    const output = join(root, 'reuse-first-plan.json')
    const canonical = JSON.parse(await readFile(resolve(
      'skills/dashi-theme-generator/project/theme-evidence/theme13-commercial-plan-spec.json'
    ), 'utf8'))
    const byFamily = new Map(canonical.archetypes.map((item: Record<string, unknown>) => [item.family, item]))
    const archetypes = ['cover', 'general', 'metrics', 'media'].map((family, index) => {
      const item = structuredClone(byFamily.get(family)) as Record<string, unknown>
      return {
        ...item,
        strategy: index < 2 ? 'new' : 'reuse',
        notes: (item.notes as string[]).slice(0, 1),
        ...(index < 2 ? {} : { reuseJustification: [`${family} page capability closure matches`] })
      }
    })
    await writeFile(specPath, JSON.stringify({
      ...canonical,
      key: 'theme15',
      generationMode: 'reuse-first',
      references: canonical.references.slice(0, 4),
      target: { ...canonical.target, derivedModuleCount: 0 },
      archetypes
    }))

    runProject('prepare-external-theme.mjs', ['--spec', specPath, '--out', output])

    await expect(readJson(output)).resolves.toMatchObject({
      generationMode: 'reuse-first',
      moduleSources: { observed: 2, inferred: 0 },
      recipe: {
        ownModuleMinimum: 2,
        pinnedModules: [
          expect.objectContaining({ family: 'metrics', sourceTheme: expect.stringMatching(/^theme(?:0[1-9]|1[0-2])$/), sourcePageKey: expect.stringMatching(/^theme\d{2}_page/) }),
          expect.objectContaining({ family: 'media', sourceTheme: expect.stringMatching(/^theme(?:0[1-9]|1[0-2])$/), sourcePageKey: expect.stringMatching(/^theme\d{2}_page/) })
        ]
      }
    })
  })

  it('caps reuse-first owned modules and converts excess proposals to pinned reuse', async () => {
    const specPath = join(root, 'reuse-first-overplanned.json')
    const output = join(root, 'reuse-first-overplanned-plan.json')
    const canonical = JSON.parse(await readFile(resolve(
      'skills/dashi-theme-generator/project/theme-evidence/theme13-commercial-plan-spec.json'
    ), 'utf8'))
    await writeFile(specPath, JSON.stringify({
      ...canonical,
      key: 'theme15',
      generationMode: 'reuse-first',
      references: canonical.references.slice(0, 4),
      target: { ...canonical.target, derivedModuleCount: 0 },
      archetypes: canonical.archetypes.map((item: Record<string, unknown>) => ({
        ...item,
        strategy: 'new',
        notes: (item.notes as string[]).slice(0, 1)
      }))
    }))

    runProject('prepare-external-theme.mjs', ['--spec', specPath, '--out', output])

    const plan = await readJson(output)
    expect(plan).toMatchObject({
      policyVersion: 2,
      generationMode: 'reuse-first',
      moduleSources: { observed: 2, inferred: 0 },
      recipe: { ownModuleMinimum: 2 }
    })
    expect(plan.planDigest).toMatch(/^[0-9a-f]{64}$/)
    expect(plan.recipe.pinnedModules).toHaveLength(6)
    expect(plan.moduleMappings.filter((item: Record<string, unknown>) => item.strategy === 'reuse')).toEqual(
      expect.arrayContaining([expect.objectContaining({
        requestedStrategy: 'new',
        strategyResolution: 'converted-to-reuse-by-owned-budget',
        reuseJustification: expect.arrayContaining([expect.stringContaining('复用完整')])
      })])
    )
  })

  it('materializes modify migration declarations from the source capability closure', async () => {
    const specPath = join(root, 'reuse-first-modify.json')
    const output = join(root, 'reuse-first-modify-plan.json')
    const spec = JSON.parse(await readFile(resolve(
      'skills/dashi-theme-generator/project/theme-evidence/reuse-first-example-spec.json'
    ), 'utf8'))
    spec.archetypes[0].strategy = 'modify'
    await writeFile(specPath, JSON.stringify(spec))

    runProject('prepare-external-theme.mjs', ['--spec', specPath, '--out', output])

    const plan = await readJson(output)
    const proposal = plan.ownedModuleProposals.find((item: Record<string, unknown>) => item.strategy === 'modify')
    expect(proposal).toMatchObject({
      preservedCapabilities: expect.arrayContaining(['defaultProps', 'runtimeSafe']),
      changedStructure: ['page-composition'],
      structurePatch: { kind: 'layout', operation: 'rebuild-from-evidence' },
      sourceContract: {
        sourceDefaultProps: expect.any(Object),
        sourceControlDefinitions: expect.any(Array),
        sourceCountBindingDefinitions: expect.any(Array),
        sourceMediaSlotDefinitions: expect.any(Array)
      }
    })
  })

  it('scaffolds a writable-media proposal with a real typed media slot contract', async () => {
    const planPath = join(root, 'media-plan.json')
    const themeDir = join(root, 'theme15-media')
    await writeFile(planPath, JSON.stringify({
      qualityVersion: 3,
      generationMode: 'reuse-first',
      policyVersion: 2,
      planDigest: 'a'.repeat(64),
      theme: { key: 'theme15', displayName: 'Media theme' },
      styleGrammar: { rules: [], primitives: [] },
      moduleSources: { observed: 1, inferred: 0 },
      ownedModuleProposals: [{
        id: 'theme15_signature_media',
        archetypeId: 'media-case',
        componentName: 'SignatureMediaCase',
        family: 'media',
        strategy: 'new',
        evidenceMode: 'observed',
        evidenceRefs: ['page-01.png'],
        styleSignals: ['矩形媒体与数据卡对齐'],
        sourceContract: null,
        requiredCapabilities: { contentShape: ['title', 'images', 'caption', 'facts'], controls: true, writableMedia: true }
      }]
    }))

    runProject('scaffold-theme-owned-modules.mjs', ['--plan', planPath, '--theme-dir', themeDir])

    const source = await readFile(join(themeDir, 'signature-pages.jsx'), 'utf8')
    expect(source).toContain('"images":[]')
    expect(source).toContain('"imageCount":1')
    expect(source).toContain('"mediaSlots":[{"field":"images"')
    await expect(readJson(join(themeDir, 'signature-modules.json'))).resolves.toMatchObject({
      policyVersion: 2,
      planDigest: 'a'.repeat(64)
    })
  })

  it('registers reuse-first thresholds and pinned modules in generated theme definitions', async () => {
    const definition = JSON.parse(await readFile(resolve(
      'skills/dashi-theme-generator/project/src/components/themes/theme14/definition.json'
    ), 'utf8'))
    const specPath = join(root, 'reuse-first-definition.json')
    await writeFile(specPath, JSON.stringify({
      qualityVersion: 3,
      generationMode: 'reuse-first',
      key: 'theme15',
      displayName: 'Reusable medical analysis',
      scenario: ['medical sales', 'regional review'],
      audience: ['sales leaders', 'analysts'],
      tokens: { ...definition.tokens, motif: 'medical-sales-analysis' },
      profile: definition.profile,
      baselineTheme: 'theme09',
      sourceThemes: ['theme09', 'theme05'],
      pageCount: 84,
      ownModuleMinimum: 2,
      pinnedModules: [{
        archetypeId: 'medical-dashboard', family: 'metrics', sourceTheme: 'theme05', sourcePageKey: 'theme05_page042'
      }]
    }))

    const result = runProject('prepare-new-theme.mjs', ['--spec', specPath])
    const output = JSON.parse(result.stdout)

    expect(output).toMatchObject({
      ok: true,
      generationMode: 'reuse-first',
      ownModuleMinimum: 2,
      pinnedModules: [expect.objectContaining({ sourceTheme: 'theme05', sourcePageKey: 'theme05_page042' })]
    })
    expect(output.entries.recipe).toContain('pinnedModules')
    expect(output.entries.definition).toContain('"generationMode":"reuse-first"')
  })

  it('materializes mode, policy, digest, pins, and capability targets directly from the external plan', async () => {
    const planPath = join(root, 'materialized-plan.json')
    runProject('prepare-external-theme.mjs', [
      '--spec', resolve('skills/dashi-theme-generator/project/theme-evidence/reuse-first-example-spec.json'),
      '--out', planPath
    ])
    const definition = JSON.parse(await readFile(resolve(
      'skills/dashi-theme-generator/project/src/components/themes/theme14/definition.json'
    ), 'utf8'))
    const specPath = join(root, 'materialized-definition.json')
    await writeFile(specPath, JSON.stringify({
      qualityVersion: 3,
      tokens: { ...definition.tokens, motif: 'medical-sales-analysis' },
      profile: definition.profile
    }))

    const result = runProject('prepare-new-theme.mjs', ['--spec', specPath, '--plan', planPath])
    const output = JSON.parse(result.stdout)

    expect(output).toMatchObject({
      generationMode: 'reuse-first',
      policyVersion: 2,
      planDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
      ownModuleMinimum: 2,
      pinnedModules: [expect.any(Object), expect.any(Object)],
      externalPlan: planPath
    })
    expect(output.entries.recipe).toContain('"minimumAverageLeaves":22')
    expect(output.entries.recipe).toContain('"generationMode":"reuse-first"')
  })

  it('selects pinned original modules into the composed page library', () => {
    const moduleUrl = pathToFileURL(resolve(
      'skills/dashi-theme-generator/project/src/components/themes/generated-theme-module-composer.mjs'
    )).href
    const source = `
      import { composeThemeModules, MODULE_FAMILIES } from ${JSON.stringify(moduleUrl)};
      const makePages = themeKey => MODULE_FAMILIES.flatMap((family, familyIndex) =>
        Array.from({length: 8}, (_, index) => ({
          key: themeKey + '_page' + String(familyIndex * 8 + index + 1).padStart(3, '0'),
          slot: family + '-' + index,
          label: family + ' ' + index,
          roles: [family],
          moduleFamily: family
        }))
      );
      const pinned = 'theme02_page017';
      const selected = composeThemeModules({
        key: 'theme15',
        recipe: {
          pageCount: 76,
          sources: ['theme01', 'theme02'],
          pinnedModules: [{sourceTheme: 'theme02', sourcePageKey: pinned, family: 'metrics'}]
        }
      }, [
        {themeKey: 'theme01', pages: makePages('theme01')},
        {themeKey: 'theme02', pages: makePages('theme02')}
      ]);
      console.log(JSON.stringify({count: selected.length, selected: selected.some(item => item.sourceTheme === 'theme02' && item.page.key === pinned)}));
    `
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', source], { encoding: 'utf8' })

    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({ count: 76, selected: true })
  })

  it('replaces weak composed pages with richer same-family candidates before validation', () => {
    const moduleUrl = pathToFileURL(resolve(
      'skills/dashi-theme-generator/project/src/components/themes/generated-theme-module-composer.mjs'
    )).href
    const source = `
      import { generatedThemeCompositionInternals as internals } from ${JSON.stringify(moduleUrl)};
      const weak = {sourceTheme:'theme01',kind:'original',family:'general',pinned:false,page:{key:'weak',defaultProps:{title:'A'},controls:[]}};
      const fixed = {sourceTheme:'theme01',kind:'owned',family:'cover',pinned:false,page:{key:'fixed',defaultProps:{title:'B'},controls:[]}};
      const rich = {sourceTheme:'theme02',kind:'original',family:'general',pinned:false,page:{key:'rich',defaultProps:{title:'C',items:[{title:'1',body:'1'},{title:'2',body:'2'},{title:'3',body:'3'}]},controls:[{key:'itemsCount'}]}};
      const selected = internals.optimizeCapabilityRichness([weak,fixed],[weak,fixed,rich],{capabilityTargets:{minimumAverageLeaves:3,minimumAverageArrays:.5}},'theme15');
      console.log(JSON.stringify({keys:selected.map(item=>item.page.key),metrics:internals.averageCapability(selected)}));
    `
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', source], { encoding: 'utf8' })

    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({ keys: ['rich', 'fixed'], metrics: { leaves: 4, arrays: 0.5 } })
  })

  it('marks owned-module scaffolding as a non-terminal agent action', async () => {
    const planPath = join(root, 'theme15-plan.json')
    const themeDir = join(root, 'theme15')
    runProject('prepare-external-theme.mjs', [
      '--spec', resolve('skills/dashi-theme-generator/project/theme-evidence/theme13-commercial-plan-spec.json'),
      '--out', planPath
    ])
    const plan = await readJson(planPath)
    plan.theme.key = 'theme15'
    plan.ownedModuleProposals = plan.ownedModuleProposals.map((item: Record<string, unknown>) => ({
      ...item,
      id: String(item.id).replace(/^theme13_/, 'theme15_')
    }))
    await writeFile(planPath, JSON.stringify(plan))

    const result = runProject('scaffold-theme-owned-modules.mjs', ['--plan', planPath, '--theme-dir', themeDir])

    expect(JSON.parse(result.stdout)).toMatchObject({
      status: 'scaffolded',
      terminal: false,
      deliverable: false,
      userActionRequired: false,
      agentActionRequired: true,
      themeKey: 'theme15',
      moduleCount: 16,
      nextAction: {
        action: 'implement-theme-owned-modules',
        instruction: expect.stringContaining('Do not ask the user to implement JSX manually')
      }
    })
    await expect(readJson(join(themeDir, 'signature-modules.json'))).resolves.toMatchObject({
      generationMode: 'fidelity',
      themeKey: 'theme15',
      modules: expect.arrayContaining([expect.objectContaining({ implementationStatus: 'scaffold' })])
    })
    const source = await readFile(join(themeDir, 'signature-pages.jsx'), 'utf8')
    expect(source).toContain("moduleFamily:'transition'")
    expect(source).toContain('sectionNumber')
  })

  it('rejects finalization while owned modules are still scaffolds with an agent-actionable error', async () => {
    const project = join(root, 'project')
    const themeDir = join(project, 'src', 'components', 'themes', 'theme15')
    await mkdir(themeDir, { recursive: true })
    await writeFile(join(project, 'package.json'), JSON.stringify({ name: 'theme-authoring-test' }))
    await writeFile(join(themeDir, 'signature-modules.json'), JSON.stringify({
      themeKey: 'theme15',
      modules: [{ id: 'theme15_signature_cover', implementationStatus: 'scaffold' }]
    }))

    const result = run('finalize-plugin-theme.mjs', [
      '--project', project,
      '--theme', 'theme15',
      '--source-type', 'images',
      '--adapter-mode', 'visual-archetype',
      '--out', join(root, 'theme15.xpert-theme.zip')
    ], false)

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('non-terminal agent-authoring state')
    expect(result.stderr).toContain('Continue implementing signature-pages.jsx')
    expect(result.stderr).not.toContain('manual implementation by the user')
  })

  it('skips only the strict opposite-canvas audit for adaptive themes', () => {
    const moduleUrl = pathToFileURL(resolve(
      'skills/dashi-theme-generator/project/scripts/workflow/theme-palette-policy.mjs'
    )).href
    const source = `
      import { resolveThemePaletteValidation } from ${JSON.stringify(moduleUrl)};
      const definitions = [
        { key: 'theme15', profile: { paletteMode: 'adaptive' } },
        { key: 'theme16', profile: { paletteMode: 'strict' } }
      ];
      console.log(JSON.stringify({
        adaptive: resolveThemePaletteValidation(definitions, 'theme15'),
        strict: resolveThemePaletteValidation(definitions, 'theme16')
      }));
    `
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', source], { encoding: 'utf8' })

    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({
      adaptive: {
        mode: 'skip',
        definitions: [],
        message: expect.stringContaining('strict opposite-canvas audit is not applicable')
      },
      strict: {
        mode: 'strict',
        definitions: [expect.objectContaining({ key: 'theme16' })]
      }
    })
  })

  it('does not treat a standalone decorative glyph as unsafe body copy', () => {
    const moduleUrl = pathToFileURL(resolve(
      'skills/dashi-theme-generator/scripts/layout-quality-text.mjs'
    )).href
    const source = `
      import { isSymbolOnlyText } from ${JSON.stringify(moduleUrl)};
      console.log(JSON.stringify({arrow:isSymbolOnlyText('↗'),number:isSymbolOnlyText('2026'),copy:isSymbolOnlyText('销售分析')}));
    `
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', source], { encoding: 'utf8' })

    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({ arrow: true, number: false, copy: false })
  })
})

function run(script: string, args: string[], checked = true, options: { env?: NodeJS.ProcessEnv } = {}) {
  const result = spawnSync(process.execPath, [resolve('skills/dashi-theme-generator/scripts', script), ...args], {
    encoding: 'utf8',
    ...options
  })
  if (checked && result.status !== 0) throw new Error(result.stderr || result.stdout)
  return result
}

function runProject(script: string, args: string[], checked = true) {
  const result = spawnSync(process.execPath, [resolve('skills/dashi-theme-generator/project/scripts', script), ...args], { encoding: 'utf8' })
  if (checked && result.status !== 0) throw new Error(result.stderr || result.stdout)
  return result
}

async function readJson(file: string) { return JSON.parse(await readFile(file, 'utf8')) }
function png(seed = 0) { return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, seed]) }
