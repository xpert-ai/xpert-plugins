import assert from 'node:assert/strict'
import { access, chmod, cp, mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import sharp from 'sharp'
import test from 'node:test'
import { SculptSpecSchema } from '../dist/lib/domain/sculpt-spec.schema.js'
import { generateThreeJsFactory } from '../dist/lib/domain/threejs-generator.js'
import { crownChestSpec } from './fixtures/crown-chest-spec.mjs'

const packageRoot = path.resolve(import.meta.dirname, '..')
const requireFromPackage = createRequire(path.join(packageRoot, 'package.json'))
const actionEvidenceId = '223e4567-e89b-42d3-a456-426614174000'

test('packaged Sandbox Action compiles and renders a Three.js TypeScript factory', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'img2threejs-action-'))
  const input = path.join(root, 'input')
  const output = path.join(root, 'output')
  try {
    await mkdir(path.join(input, 'model'), { recursive: true })
    await mkdir(path.join(input, 'references'), { recursive: true })
    await writeFile(path.join(input, 'model', 'model.ts'), `import * as THREE from 'three';
export function createActionTestModel() {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(
    new THREE.BoxGeometry(1, 1.5, 0.8),
    new THREE.MeshStandardMaterial({ color: '#7c3aed', roughness: 0.7 })
  ));
  return { root, dispose() {} };
}
`)
    await writeFile(
      path.join(input, 'references', '01-reference.png'),
      Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nF0AAAAASUVORK5CYII=', 'base64')
    )
    const requestPath = path.join(input, 'request.json')
    await writeFile(requestPath, JSON.stringify({
      contractVersion: '1',
      action: 'img2threejs.review-render',
      actionVersion: '1.0.0',
      payload: {
        projectName: 'Action Test',
        codeSha256: 'a'.repeat(64),
        views: ['front', 'three-quarter'],
        references: [{
          evidenceId: actionEvidenceId,
          label: 'Front',
          view: 'front',
          mimeType: 'image/png',
          path: 'references/01-reference.png'
        }],
        ...reviewContract(actionEvidenceId, 'front'),
        quality: reviewQuality(10000, 20)
      }
    }))
    const packagedBundle = path.join(
      packageRoot,
      'dist',
      'sandbox-actions',
      'model-review-render',
      'bundle'
    )
    const isolatedBundle = path.join(root, 'runtime', 'action')
    await cp(packagedBundle, isolatedBundle, { recursive: true, dereference: true })
    for (const platformPackage of ['linux-x64', 'darwin-arm64']) {
      await chmod(path.join(isolatedBundle, 'runtime-modules', '@esbuild', platformPackage, 'bin', 'esbuild'), 0o644)
    }
    const playwrightRoot = await realpath(path.dirname(requireFromPackage.resolve('playwright-core/package.json')))
    await mkdir(path.join(isolatedBundle, 'node_modules'), { recursive: true })
    await symlink(playwrightRoot, path.join(isolatedBundle, 'node_modules', 'playwright-core'), 'dir')
    const execution = await runNode(path.join(isolatedBundle, 'runner.mjs'), requestPath, output, root)
    assert.match(execution.stdout, /XPERT_SANDBOX_PROGRESS/)
    assert.equal(execution.stderr, '')
    for (const file of ['render-front.png', 'render-three-quarter.png', 'comparison.png', 'render-report.json']) {
      await access(path.join(output, file))
    }
    const report = JSON.parse(await readFile(path.join(output, 'render-report.json'), 'utf8'))
    assert.equal(report.action, 'img2threejs.review-render')
    assert.equal(report.quality.passed, false)
    assert.ok(report.quality.triangles > 0)
    assert.ok(report.quality.drawCalls > 0)
    assert.ok(report.quality.visiblePixelRatio >= report.quality.minimumVisiblePixelRatio)
    assert.ok(report.quality.silhouetteFillRatio >= report.quality.minimumSilhouetteFillRatio)
    assert.equal(report.quality.views.length, 2)
    assert.ok(report.quality.failureCodes.includes('reference_mask_low_confidence'))
    assert.equal(report.quality.multiAngle.passed, true)

    const verifiedInput = path.join(root, 'verified-input')
    const verifiedOutput = path.join(root, 'verified-output')
    await mkdir(path.join(verifiedInput, 'model'), { recursive: true })
    await mkdir(path.join(verifiedInput, 'references'), { recursive: true })
    await cp(path.join(input, 'model', 'model.ts'), path.join(verifiedInput, 'model', 'model.ts'))
    await cp(path.join(output, 'render-front.png'), path.join(verifiedInput, 'references', '01-reference.png'))
    const verifiedRequestPath = path.join(verifiedInput, 'request.json')
    await writeFile(verifiedRequestPath, JSON.stringify({
      contractVersion: '1',
      action: 'img2threejs.review-render',
      actionVersion: '1.0.0',
      payload: {
        projectName: 'Reference Fidelity Pass',
        codeSha256: 'c'.repeat(64),
        views: ['front', 'three-quarter'],
        references: [{
          evidenceId: actionEvidenceId,
          label: 'Reference-aligned front',
          view: 'front',
          mimeType: 'image/png',
          path: 'references/01-reference.png'
        }],
        ...reviewContract(actionEvidenceId, 'front'),
        quality: reviewQuality(10000, 20)
      }
    }))
    const verifiedExecution = await runNode(
      path.join(isolatedBundle, 'runner.mjs'),
      verifiedRequestPath,
      verifiedOutput,
      root
    )
    assert.equal(verifiedExecution.stderr, '')
    const verifiedReport = JSON.parse(
      await readFile(path.join(verifiedOutput, 'render-report.json'), 'utf8')
    )
    assert.equal(verifiedReport.quality.passed, true, JSON.stringify(verifiedReport.quality))
    assert.equal(verifiedReport.quality.referenceAlignment.hardGateEligible, true)
    assert.ok(verifiedReport.quality.referenceAlignment.silhouetteIoU > 0.95)
    assert.equal(verifiedReport.quality.failureCodes.length, 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('packaged Sandbox Action renders typed Crown Chest geometry and materials', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'img2threejs-crown-action-'))
  const input = path.join(root, 'input')
  const output = path.join(root, 'output')
  try {
    await mkdir(path.join(input, 'model'), { recursive: true })
    await mkdir(path.join(input, 'references'), { recursive: true })
    const evidenceId = '123e4567-e89b-42d3-a456-426614174000'
    const spec = SculptSpecSchema.parse(crownChestSpec(evidenceId))
    await writeFile(path.join(input, 'model', 'model.ts'), generateThreeJsFactory(spec))
    await writeFile(
      path.join(input, 'references', '01-reference.png'),
      Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nF0AAAAASUVORK5CYII=', 'base64')
    )
    const requestPath = path.join(input, 'request.json')
    await writeFile(requestPath, JSON.stringify({
      contractVersion: '1',
      action: 'img2threejs.review-render',
      actionVersion: '1.0.0',
      payload: {
        projectName: spec.projectName,
        codeSha256: 'b'.repeat(64),
        views: ['front', 'three-quarter'],
        references: [{
          evidenceId,
          label: 'Crown chest reference',
          view: 'three-quarter',
          mimeType: 'image/png',
          path: 'references/01-reference.png'
        }],
        referenceCamera: spec.referenceCamera,
        featureReviewTargets: spec.featureReviewTargets,
        quality: {
          ...reviewQuality(
            spec.qualityContract.maximumTriangles,
            spec.qualityContract.maximumDrawCalls
          ),
          minimumSilhouetteIoU: spec.qualityContract.minimumSilhouetteIoU,
          minimumScaleScore: spec.qualityContract.minimumScaleScore,
          minimumEdgeScore: spec.qualityContract.minimumEdgeScore,
          minimumPerceptualScore: spec.qualityContract.minimumPerceptualScore,
          minimumReferenceMaskConfidence: spec.qualityContract.minimumReferenceMaskConfidence,
          minimumMultiAngleSilhouetteRetention: spec.qualityContract.minimumMultiAngleSilhouetteRetention,
          minimumVolumeAxisRatio: spec.qualityContract.minimumVolumeAxisRatio
        }
      }
    }))
    const packagedBundle = path.join(
      packageRoot,
      'dist',
      'sandbox-actions',
      'model-review-render',
      'bundle'
    )
    const isolatedBundle = path.join(root, 'runtime', 'action')
    await cp(packagedBundle, isolatedBundle, { recursive: true, dereference: true })
    for (const platformPackage of ['linux-x64', 'darwin-arm64']) {
      await chmod(path.join(isolatedBundle, 'runtime-modules', '@esbuild', platformPackage, 'bin', 'esbuild'), 0o644)
    }
    const playwrightRoot = await realpath(path.dirname(requireFromPackage.resolve('playwright-core/package.json')))
    await mkdir(path.join(isolatedBundle, 'node_modules'), { recursive: true })
    await symlink(playwrightRoot, path.join(isolatedBundle, 'node_modules', 'playwright-core'), 'dir')
    const execution = await runNode(path.join(isolatedBundle, 'runner.mjs'), requestPath, output, root)
    assert.equal(execution.stderr, '')
    const report = JSON.parse(await readFile(path.join(output, 'render-report.json'), 'utf8'))
    assert.equal(report.quality.passed, false)
    assert.ok(report.quality.triangles > 2_000)
    assert.ok(report.quality.drawCalls >= 4)
    assert.ok(report.quality.visiblePixelRatio >= report.quality.minimumVisiblePixelRatio)
    assert.ok(report.quality.silhouetteFillRatio >= report.quality.minimumSilhouetteFillRatio)
    assert.ok(report.quality.failureCodes.length > 0)
    for (const file of ['render-front.png', 'render-three-quarter.png', 'comparison.png']) {
      await access(path.join(output, file))
    }
    const { data, info } = await sharp(path.join(output, 'render-three-quarter.png'))
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    let enamelPixels = 0
    for (let offset = 0; offset < data.length; offset += info.channels) {
      const red = data[offset]
      const green = data[offset + 1]
      const blue = data[offset + 2]
      const chroma = Math.max(red, green, blue) - Math.min(red, green, blue)
      if (chroma > 35 && (blue > red || green > red)) enamelPixels += 1
    }
    assert.ok(
      enamelPixels > info.width * info.height * 0.01,
      `expected visible teal/blue/purple enamel, found ${enamelPixels} pixels`
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function reviewContract(evidenceId, view) {
  return {
    referenceCamera: {
      evidenceId,
      view,
      projection: 'perspective',
      position: [0, 0.5, 4],
      target: [0, 0.5, 0],
      up: [0, 1, 0],
      fovDegrees: 35,
      orthographicHeight: null,
      framing: { subjectFillRatio: 0.62, tolerance: 0.18 },
      confidence: 0.9
    },
    featureReviewTargets: [{
      id: 'primary_silhouette',
      label: 'Primary silhouette',
      evidenceId,
      componentIds: ['root'],
      view,
      region: { x: 0.05, y: 0.05, width: 0.9, height: 0.9 },
      metric: 'silhouette',
      criticality: 'critical',
      threshold: 0.4,
      confidence: 0.9,
      acceptance: 'Primary silhouette remains aligned.'
    }]
  }
}

function reviewQuality(maximumTriangles, maximumDrawCalls) {
  return {
    maximumTriangles,
    maximumDrawCalls,
    minimumSilhouetteIoU: 0.3,
    minimumScaleScore: 0.65,
    minimumEdgeScore: 0.12,
    minimumPerceptualScore: 0.1,
    minimumReferenceMaskConfidence: 0.2,
    minimumMultiAngleSilhouetteRetention: 0.08,
    minimumVolumeAxisRatio: 0.01
  }
}

function runNode(runner, requestPath, outputDir, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [runner, '--request', requestPath, '--output', outputDir], {
      cwd,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(`Sandbox Action exited ${code}: ${stderr || stdout}`))
    })
  })
}
