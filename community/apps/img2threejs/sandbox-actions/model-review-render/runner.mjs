#!/usr/bin/env node
import { chmod, mkdir, readFile, realpath, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const bundleRoot = path.dirname(fileURLToPath(import.meta.url))
const runtimeModules = path.join(bundleRoot, 'runtime-modules')
const nodeModules = path.join(bundleRoot, 'node_modules')
const allowedViews = new Set(['front', 'back', 'left', 'right', 'top', 'bottom', 'three-quarter'])

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`${classify(message)}: ${message}\n`)
  process.exit(1)
})

async function main() {
  const requestPath = argument('--request')
  const outputDir = argument('--output')
  const request = parseRequest(JSON.parse(await readFile(requestPath, 'utf8')))
  const inputRoot = path.dirname(requestPath)
  const modelPath = path.join(inputRoot, 'model', 'model.ts')
  const modelSource = await readBounded(modelPath, 4 * 1024 * 1024)
  const entryPath = path.join(outputDir, 'browser-entry.ts')
  const browserBundlePath = path.join(outputDir, 'browser-model.js')
  await mkdir(outputDir, { recursive: true })
  await exposeBundledDependencies()
  await writeFile(entryPath, browserEntry(modelPath, request.payload.referenceCamera), 'utf8')

  progress(0.1, 'compiling', 'Compiling the generated TypeScript factory.')
  const esbuild = await import(pathToFileURL(path.join(nodeModules, 'esbuild', 'lib', 'main.js')).href)
  await esbuild.build({
    entryPoints: [entryPath],
    outfile: browserBundlePath,
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
    legalComments: 'none',
    nodePaths: [nodeModules],
    logLevel: 'silent'
  })

  const references = []
  for (const reference of request.payload.references) {
    const content = await readBounded(path.join(inputRoot, reference.path), 25 * 1024 * 1024)
    references.push({
      ...reference,
      dataUrl: `data:${reference.mimeType};base64,${content.toString('base64')}`
    })
  }

  const { chromium } = await import('playwright-core')
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  })
  const rendered = []
  const viewMetrics = []
  let referenceAlignment = null
  try {
    const context = await browser.newContext({
      viewport: { width: 960, height: 720 },
      deviceScaleFactor: 1,
      colorScheme: 'light'
    })
    const page = await context.newPage()
    await page.route('**/*', (route) => route.abort('blockedbyclient'))
    await page.setContent('<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#eef2f7}canvas{display:block}</style></head><body></body></html>')
    await page.addScriptTag({ path: browserBundlePath })
    progress(0.16, 'exporting', 'Exporting the validated procedural model as GLB.')
    const glb = Buffer.from(
      await page.evaluate(async () => globalThis.__xpertImg2ThreeJs.exportGlb()),
      'base64'
    )
    validateGlb(glb)
    await writeFile(path.join(outputDir, 'model.glb'), glb)
    for (let index = 0; index < request.payload.views.length; index += 1) {
      const view = request.payload.views[index]
      progress(0.2 + (index / request.payload.views.length) * 0.55, 'rendering', `Rendering ${view}.`, index + 1, request.payload.views.length)
      const metrics = await page.evaluate(async (selectedView) => globalThis.__xpertImg2ThreeJs.render(selectedView), view)
      viewMetrics.push({ view, ...metrics })
      const fileName = `render-${view}.png`
      const filePath = path.join(outputDir, fileName)
      await page.screenshot({ path: filePath, type: 'png' })
      const png = await readFile(filePath)
      validatePng(png)
      rendered.push({ view, fileName, dataUrl: `data:image/png;base64,${png.toString('base64')}` })
    }
    const fixedReference = references.find(
      (reference) => reference.evidenceId === request.payload.referenceCamera.evidenceId
    )
    if (fixedReference) {
      await page.evaluate(
        async (selectedView) => globalThis.__xpertImg2ThreeJs.render(selectedView),
        request.payload.referenceCamera.view
      )
    }
    referenceAlignment = fixedReference
      ? await page.evaluate(
          async ({ dataUrl, review }) => globalThis.__xpertImg2ThreeJs.compare(dataUrl, review),
          {
            dataUrl: fixedReference.dataUrl,
            review: {
              minimumReferenceMaskConfidence: request.payload.quality.minimumReferenceMaskConfidence,
              minimumSilhouetteIoU: request.payload.quality.minimumSilhouetteIoU,
              minimumScaleScore: request.payload.quality.minimumScaleScore,
              minimumEdgeScore: request.payload.quality.minimumEdgeScore,
              minimumPerceptualScore: request.payload.quality.minimumPerceptualScore,
              featureReviewTargets: request.payload.featureReviewTargets.filter(
                (target) => target.evidenceId === fixedReference.evidenceId &&
                  target.view === request.payload.referenceCamera.view
              )
            }
          }
        )
      : null
    await context.close()

    progress(0.82, 'comparing', 'Building reference-versus-render evidence.')
    const comparison = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 })
    await comparison.route('**/*', (route) => route.abort('blockedbyclient'))
    await comparison.setContent(comparisonHtml(request.payload.projectName, references, rendered), { waitUntil: 'load' })
    const comparisonPath = path.join(outputDir, 'comparison.png')
    await comparison.screenshot({ path: comparisonPath, type: 'png', fullPage: true })
    validatePng(await readFile(comparisonPath))
    await comparison.close()
  } finally {
    await browser.close()
  }

  const maximumVisiblePixelRatio = Math.max(0, ...viewMetrics.map((item) => item.visibility?.visiblePixelRatio ?? 0))
  const silhouetteRetention = maximumVisiblePixelRatio > 0
    ? Math.min(...viewMetrics.map((item) => item.visibility?.visiblePixelRatio ?? 0)) / maximumVisiblePixelRatio
    : 0
  const boundsSize = viewMetrics[0]?.bounds?.size ?? [0, 0, 0]
  const maximumAxis = Math.max(...boundsSize, 0)
  const volumeAxisRatio = maximumAxis > 0 ? Math.min(...boundsSize) / maximumAxis : 0
  const multiAngle = {
    minimumSilhouetteRetention: request.payload.quality.minimumMultiAngleSilhouetteRetention,
    minimumVolumeAxisRatio: request.payload.quality.minimumVolumeAxisRatio,
    silhouetteRetention,
    volumeAxisRatio,
    degenerateView:
      silhouetteRetention < request.payload.quality.minimumMultiAngleSilhouetteRetention ||
      volumeAxisRatio < request.payload.quality.minimumVolumeAxisRatio,
    passed:
      silhouetteRetention >= request.payload.quality.minimumMultiAngleSilhouetteRetention &&
      volumeAxisRatio >= request.payload.quality.minimumVolumeAxisRatio
  }
  const fixedReference = references.find(
    (reference) => reference.evidenceId === request.payload.referenceCamera.evidenceId
  )
  const failureCodes = []
  if (!fixedReference) failureCodes.push('reference_view_missing')
  if (referenceAlignment) {
    if (!referenceAlignment.hardGateEligible) failureCodes.push('reference_mask_low_confidence')
    if (referenceAlignment.hardGateEligible && referenceAlignment.silhouetteIoU < request.payload.quality.minimumSilhouetteIoU) {
      failureCodes.push('reference_camera_alignment_failed')
    }
    if (referenceAlignment.hardGateEligible && referenceAlignment.scaleScore < request.payload.quality.minimumScaleScore) {
      failureCodes.push('reference_scale_gate_failed')
    }
    if (
      referenceAlignment.edgeScore < request.payload.quality.minimumEdgeScore &&
      referenceAlignment.perceptualScore < request.payload.quality.minimumPerceptualScore
    ) {
      failureCodes.push('reference_appearance_gate_failed')
    }
    if (referenceAlignment.featureResults.some((feature) => feature.criticality === 'critical' && !feature.passed)) {
      failureCodes.push('critical_feature_gate_failed')
    }
  }
  if (!multiAngle.passed) failureCodes.push('degenerate_multi_angle_geometry')
  const triangles = Math.max(0, ...viewMetrics.map((item) => item.triangles ?? 0))
  const drawCalls = Math.max(0, ...viewMetrics.map((item) => item.drawCalls ?? 0))
  const runtimeMeshCount = Math.min(...viewMetrics.map((item) => item.runtimeMeshCount ?? 0))
  const visiblePixelRatio = Math.min(1, ...viewMetrics.map((item) => item.visibility?.visiblePixelRatio ?? 0))
  const silhouetteFillRatio = Math.min(1, ...viewMetrics.map((item) => item.visibility?.silhouetteFillRatio ?? 0))
  if (triangles > request.payload.quality.maximumTriangles) failureCodes.push('triangle_budget_failed')
  if (drawCalls > request.payload.quality.maximumDrawCalls) failureCodes.push('draw_call_budget_failed')
  if (runtimeMeshCount < request.payload.quality.minimumRuntimeMeshCount) {
    failureCodes.push('runtime_mesh_count_failed')
  }
  if (visiblePixelRatio < 0.02) failureCodes.push('render_visibility_failed')
  if (silhouetteFillRatio < 0.12) failureCodes.push('silhouette_fill_failed')
  const quality = {
    triangles,
    drawCalls,
    runtimeMeshCount,
    minimumRuntimeMeshCount: request.payload.quality.minimumRuntimeMeshCount,
    maximumTriangles: request.payload.quality.maximumTriangles,
    maximumDrawCalls: request.payload.quality.maximumDrawCalls,
    minimumVisiblePixelRatio: 0.02,
    minimumSilhouetteFillRatio: 0.12,
    visiblePixelRatio,
    silhouetteFillRatio,
    views: viewMetrics.map((item) => ({
      view: item.view,
      visiblePixelRatio: item.visibility?.visiblePixelRatio ?? 0,
      silhouetteFillRatio: item.visibility?.silhouetteFillRatio ?? 0,
      silhouetteWidthRatio: item.visibility?.silhouetteWidthRatio ?? 0,
      silhouetteHeightRatio: item.visibility?.silhouetteHeightRatio ?? 0
    })),
    referenceAlignment: referenceAlignment
      ? {
          evidenceId: request.payload.referenceCamera.evidenceId,
          view: request.payload.referenceCamera.view,
          maskConfidence: referenceAlignment.maskConfidence,
          silhouetteIoU: referenceAlignment.silhouetteIoU,
          scaleScore: referenceAlignment.scaleScore,
          edgeScore: referenceAlignment.edgeScore,
          perceptualScore: referenceAlignment.perceptualScore,
          hardGateEligible: referenceAlignment.hardGateEligible,
          passed: referenceAlignment.passed
        }
      : undefined,
    featureResults: referenceAlignment?.featureResults ?? [],
    multiAngle,
    failureCodes
  }
  const passed =
    quality.triangles <= quality.maximumTriangles &&
    quality.drawCalls <= quality.maximumDrawCalls &&
    quality.runtimeMeshCount >= quality.minimumRuntimeMeshCount &&
    quality.visiblePixelRatio >= quality.minimumVisiblePixelRatio &&
    quality.silhouetteFillRatio >= quality.minimumSilhouetteFillRatio &&
    failureCodes.length === 0
  await writeFile(path.join(outputDir, 'render-report.json'), `${JSON.stringify({
    contractVersion: '1',
    action: 'img2threejs.review-render',
    actionVersion: '1.0.0',
    projectName: request.payload.projectName,
    codeSha256: request.payload.codeSha256,
    views: rendered.map(({ view, fileName }) => ({ view, fileName })),
    references: references.map(({ label, view, path: relativePath, mimeType }) => ({ label, view, path: relativePath, mimeType })),
    quality: { ...quality, passed },
    bounds: viewMetrics[0]?.bounds ?? null
  }, null, 2)}\n`)
  progress(1, 'complete', 'Browser render evidence completed.')
}

async function exposeBundledDependencies() {
  await mkdir(path.join(nodeModules, '@esbuild'), { recursive: true })
  for (const packageName of [
    'esbuild',
    '@esbuild/linux-x64',
    '@esbuild/linux-arm64',
    '@esbuild/darwin-arm64',
    'three'
  ]) {
    const target = path.join(runtimeModules, ...packageName.split('/'))
    const link = path.join(nodeModules, ...packageName.split('/'))
    await symlink(target, link, 'dir').catch(async (error) => {
      if (error?.code !== 'EEXIST' || (await realpath(link).catch(() => '')) !== (await realpath(target))) throw error
    })
  }
  for (const platformPackage of [
    '@esbuild/linux-x64',
    '@esbuild/linux-arm64',
    '@esbuild/darwin-arm64'
  ]) {
    await chmod(path.join(runtimeModules, ...platformPackage.split('/'), 'bin', 'esbuild'), 0o755)
  }
}

function parseRequest(value) {
  if (!isObject(value) || value.contractVersion !== '1' || value.action !== 'img2threejs.review-render' || value.actionVersion !== '1.0.0') {
    throw new Error('EXPORT_INPUT_INVALID: Sandbox Action contract or version does not match.')
  }
  const payload = value.payload
  if (!isObject(payload) || typeof payload.projectName !== 'string' || !payload.projectName.trim()) {
    throw new Error('EXPORT_INPUT_INVALID: payload.projectName is required.')
  }
  if (typeof payload.codeSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(payload.codeSha256)) {
    throw new Error('EXPORT_INPUT_INVALID: payload.codeSha256 must be a SHA-256.')
  }
  if (!Array.isArray(payload.views) || payload.views.length < 2 || payload.views.length > 7 || payload.views.some((view) => !allowedViews.has(view))) {
    throw new Error('EXPORT_INPUT_INVALID: payload.views is invalid.')
  }
  if (!Array.isArray(payload.references) || payload.references.length < 1 || payload.references.length > 20) {
    throw new Error('EXPORT_INPUT_INVALID: payload.references is invalid.')
  }
  for (const reference of payload.references) {
    if (!isObject(reference) || typeof reference.evidenceId !== 'string' ||
      typeof reference.label !== 'string' || !allowedInputPath(reference.path) ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(reference.mimeType) || typeof reference.view !== 'string') {
      throw new Error('EXPORT_INPUT_INVALID: reference descriptor is invalid.')
    }
  }
  if (!isReferenceCamera(payload.referenceCamera) ||
    !Array.isArray(payload.featureReviewTargets) ||
    payload.featureReviewTargets.length < 1 ||
    payload.featureReviewTargets.length > 40 ||
    payload.featureReviewTargets.some((target) => !isFeatureReviewTarget(target))) {
    throw new Error('EXPORT_INPUT_INVALID: reference review contract is invalid.')
  }
  if (!isObject(payload.quality) || !Number.isSafeInteger(payload.quality.maximumTriangles) ||
    !Number.isSafeInteger(payload.quality.maximumDrawCalls) ||
    !Number.isSafeInteger(payload.quality.minimumRuntimeMeshCount) ||
    payload.quality.minimumRuntimeMeshCount < 1 || payload.quality.minimumRuntimeMeshCount > 5000 ||
    ![
      'minimumSilhouetteIoU',
      'minimumScaleScore',
      'minimumEdgeScore',
      'minimumPerceptualScore',
      'minimumReferenceMaskConfidence',
      'minimumMultiAngleSilhouetteRetention',
      'minimumVolumeAxisRatio'
    ].every((key) => finiteUnit(payload.quality[key]))) {
    throw new Error('EXPORT_INPUT_INVALID: payload.quality is invalid.')
  }
  return value
}

function browserEntry(modelPath, referenceCamera) {
  return `import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as MODEL from ${JSON.stringify(modelPath)};
const factoryEntry = Object.entries(MODEL).find(([name, value]) => /^create[A-Za-z0-9_]*Model$/.test(name) && typeof value === 'function');
if (!factoryEntry) throw new Error('EXPORT_INPUT_INVALID: generated module does not export a model factory.');
const factoryResult = factoryEntry[1]();
const model = factoryResult instanceof THREE.Object3D
  ? { root: factoryResult, dispose() {} }
  : factoryResult;
if (!model || !(model.root instanceof THREE.Object3D)) {
  throw new Error('EXPORT_INPUT_INVALID: model factory must return a THREE.Object3D or an object with a THREE.Object3D root.');
}
const lookDevFactoryEntry = Object.entries(MODEL).find(([name, value]) => /^create[A-Za-z0-9_]*LookDevLights$/.test(name) && typeof value === 'function');
const backgroundFactoryEntry = Object.entries(MODEL).find(([name, value]) => /^make(?:Sky|Studio)[A-Za-z0-9_]*(?:Texture|Background)$/.test(name) && typeof value === 'function');
const lookDevLights = lookDevFactoryEntry ? lookDevFactoryEntry[1]() : null;
if (lookDevLights && !(lookDevLights instanceof THREE.Object3D)) {
  throw new Error('EXPORT_INPUT_INVALID: look-dev lights factory must return a THREE.Object3D.');
}
const authoredBackground = backgroundFactoryEntry ? backgroundFactoryEntry[1]() : null;
if (authoredBackground && !(authoredBackground instanceof THREE.Texture) && !(authoredBackground instanceof THREE.Color)) {
  throw new Error('EXPORT_INPUT_INVALID: background factory must return a THREE.Texture or THREE.Color.');
}
const scene = new THREE.Scene();
scene.background = authoredBackground || new THREE.Color('#eef2f7');
scene.add(model.root);
if (lookDevLights) {
  scene.add(lookDevLights);
} else {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 3.2); key.position.set(4, 6, 5); key.castShadow = true; scene.add(key);
  const fill = new THREE.DirectionalLight(0xa5b4fc, 1.4); fill.position.set(-5, 2, -3); scene.add(fill);
}
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(960, 720);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 1;
pmrem.dispose();
const authoredGround = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 30),
  new THREE.ShadowMaterial({ opacity: 0.16 })
);
authoredGround.rotation.x = -Math.PI / 2;
authoredGround.receiveShadow = true;
scene.add(authoredGround);
const box = new THREE.Box3().setFromObject(model.root);
const size = box.getSize(new THREE.Vector3()); const center = box.getCenter(new THREE.Vector3());
const radius = Math.max(size.x, size.y, size.z, 0.1) * 1.65;
const perspectiveCamera = new THREE.PerspectiveCamera(35, 4 / 3, 0.01, Math.max(1000, radius * 20));
const orthographicCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, Math.max(1000, radius * 20));
const fixedCamera = ${JSON.stringify(referenceCamera)};
const positions = {
  front:[0,0,radius], back:[0,0,-radius], left:[-radius,0,0], right:[radius,0,0],
  top:[0,radius,0.001], bottom:[0,-radius,0.001], 'three-quarter':[radius*.72,radius*.4,radius*.72]
};
globalThis.__xpertImg2ThreeJs = { async exportGlb() {
  const bundle = prepareGlbBundle(model.root, lookDevLights, authoredBackground, fixedCamera);
  const exported = await new GLTFExporter().parseAsync(bundle.root, {
    binary: true,
    onlyVisible: false,
    animations: bundle.animations
  });
  if (!(exported instanceof ArrayBuffer)) throw new Error('EXPORT_OUTPUT_INVALID: GLB exporter returned a non-binary payload.');
  const bytes = new Uint8Array(exported);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}, render(view) {
  let camera = perspectiveCamera;
  if (view === fixedCamera.view) {
    camera = fixedCamera.projection === 'orthographic' ? orthographicCamera : perspectiveCamera;
    camera.position.fromArray(fixedCamera.position); camera.up.fromArray(fixedCamera.up);
    if (camera.isPerspectiveCamera) camera.fov = fixedCamera.fovDegrees;
    if (camera.isOrthographicCamera) {
      const halfHeight = fixedCamera.orthographicHeight / 2;
      camera.left = -halfHeight * 4 / 3; camera.right = halfHeight * 4 / 3;
      camera.top = halfHeight; camera.bottom = -halfHeight;
    }
    camera.lookAt(new THREE.Vector3().fromArray(fixedCamera.target));
  } else {
    const p = positions[view]; camera.position.set(center.x+p[0], center.y+p[1], center.z+p[2]); camera.up.set(0,1,0);
    if (view === 'top' || view === 'bottom') camera.up.set(0,0,-1);
    camera.lookAt(center);
  }
  camera.updateProjectionMatrix(); renderer.render(scene, camera);
  let triangles = 0; let runtimeMeshCount = 0; model.root.traverseVisible((object) => { if (object.isMesh) {
    const geometry = object.geometry; const vertexCount = geometry.attributes.position?.count ?? 0;
    if (vertexCount > 0) runtimeMeshCount += object.isInstancedMesh ? Math.max(1, object.count ?? 1) : 1;
    triangles += geometry.index ? geometry.index.count / 3 : vertexCount / 3;
  }});
  const visibility = measureVisibility(renderer.domElement);
  const result = { triangles: Math.round(triangles), drawCalls: renderer.info.render.calls, runtimeMeshCount, visibility,
    bounds: { min: box.min.toArray(), max: box.max.toArray(), size: size.toArray() } };
  globalThis.__xpertImg2ThreeJs.lastRender = result;
  return result;
}, async compare(dataUrl, review) {
  const reference = await loadContainedImage(dataUrl, renderer.domElement.width, renderer.domElement.height);
  const rendered = canvasPixels(renderer.domElement);
  const comparison = compareImages(reference, rendered, review);
  const metrics = globalThis.__xpertImg2ThreeJs.lastRender;
  metrics.comparison = comparison;
  return comparison;
}};
function prepareGlbBundle(sourceRoot, sourceLights, background, camera) {
  sourceRoot.updateWorldMatrix(true, true);
  const sourceNodes = [];
  sourceRoot.traverse((object) => sourceNodes.push(object));
  const exportedRoot = cloneWithoutRuntimeUserData(sourceRoot, sourceNodes);
  exportedRoot.updateWorldMatrix(true, true);
  const exportedNodes = [];
  exportedRoot.traverse((object) => exportedNodes.push(object));
  if (sourceNodes.length !== exportedNodes.length) {
    throw new Error('EXPORT_OUTPUT_INVALID: cloned model hierarchy does not match the source hierarchy.');
  }
  const sampled = sampleProceduralRuntime(sourceRoot, sourceNodes, exportedNodes);
  for (let index = 0; index < exportedNodes.length; index += 1) {
    const object = exportedNodes[index];
    const sourceObject = sourceNodes[index];
    if (!object.isMesh || !object.geometry) continue;
    const sourceMaterials = Array.isArray(sourceObject.material) ? sourceObject.material : [sourceObject.material];
    const rampMaterial = sourceMaterials.find((material) => material?.userData?.img2threejsColorRamp);
    const ramp = rampMaterial?.userData?.img2threejsColorRamp;
    object.geometry = object.geometry.clone();
    object.material = Array.isArray(object.material)
      ? sourceMaterials.map((material) => clonePortableMaterial(material, sampled.materialAnimations))
      : clonePortableMaterial(sourceMaterials[0], sampled.materialAnimations);
    if (!ramp) continue;
    bakeWorldAxisColorRamp(object, ramp);
    const exportedMaterials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of exportedMaterials) {
      if (material.userData?.img2threejsColorRamp) material.vertexColors = true;
    }
  }
  const artifactRoot = new THREE.Group();
  artifactRoot.name = 'img2threejs-artifact';
  artifactRoot.add(exportedRoot);
  if (sourceLights) artifactRoot.add(sourceLights.clone(true));
  artifactRoot.userData.img2threejsPresentation = {
    schemaVersion: '1',
    camera,
    background: portableBackground(background),
    embeddedLights: Boolean(sourceLights),
    environmentIntensity: 1,
    toneMapping: 'aces',
    exposure: 1,
    groundShadow: { enabled: true, opacity: 0.16, size: 30 },
    autoRotate: false
  };
  return { root: artifactRoot, animations: sampled.animations };
}
function cloneWithoutRuntimeUserData(sourceRoot, sourceNodes) {
  const saved = sourceNodes.map((object) => object.userData);
  for (const object of sourceNodes) object.userData = {};
  try {
    return sourceRoot.clone(true);
  } finally {
    for (let index = 0; index < sourceNodes.length; index += 1) sourceNodes[index].userData = saved[index];
  }
}
function sampleProceduralRuntime(sourceRoot, sourceNodes, exportedNodes) {
  const tickers = sourceNodes
    .map((object) => object.userData?.tick)
    .filter((tick) => typeof tick === 'function');
  if (!tickers.length) return { animations: [], materialAnimations: new Map() };
  const durationSeconds = Math.PI * 20;
  const framesPerSecond = 8;
  const frameCount = Math.ceil(durationSeconds * framesPerSecond) + 1;
  const times = [];
  const transforms = sourceNodes.map(() => ({ position: [], quaternion: [], scale: [] }));
  const sourceMaterials = [];
  const seenMaterials = new Set();
  for (const object of sourceNodes) {
    if (!object.isMesh || !object.material) continue;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material || seenMaterials.has(material.uuid)) continue;
      seenMaterials.add(material.uuid);
      sourceMaterials.push(material);
    }
  }
  const materialSamples = new Map(sourceMaterials.map((material) => [material.uuid, {
    material,
    emissiveIntensity: []
  }]));
  for (let frame = 0; frame < frameCount; frame += 1) {
    const elapsed = Math.min(durationSeconds, frame / framesPerSecond);
    times.push(elapsed);
    for (const tick of tickers) tick(frame ? 1 / framesPerSecond : 0, elapsed);
    for (let index = 0; index < sourceNodes.length; index += 1) {
      const object = sourceNodes[index];
      object.position.toArray(transforms[index].position, frame * 3);
      object.quaternion.toArray(transforms[index].quaternion, frame * 4);
      object.scale.toArray(transforms[index].scale, frame * 3);
    }
    for (const sampled of materialSamples.values()) {
      sampled.emissiveIntensity.push(Number(sampled.material.emissiveIntensity ?? 0));
    }
  }
  for (const tick of tickers) tick(0, 0);
  const tracks = [];
  for (let index = 0; index < sourceNodes.length; index += 1) {
    const transform = transforms[index];
    const changedPosition = sampleValuesDiffer(transform.position, 3, 1e-5);
    const changedQuaternion = sampleValuesDiffer(transform.quaternion, 4, 1e-6);
    const changedScale = sampleValuesDiffer(transform.scale, 3, 1e-5);
    if (!changedPosition && !changedQuaternion && !changedScale) continue;
    const exportedNode = exportedNodes[index];
    exportedNode.name = 'img2threejs-animated-node-' + index;
    if (changedPosition) tracks.push(new THREE.VectorKeyframeTrack(exportedNode.name + '.position', times, transform.position));
    if (changedQuaternion) tracks.push(new THREE.QuaternionKeyframeTrack(exportedNode.name + '.quaternion', times, transform.quaternion));
    if (changedScale) tracks.push(new THREE.VectorKeyframeTrack(exportedNode.name + '.scale', times, transform.scale));
  }
  const materialAnimations = new Map();
  for (const sampled of materialSamples.values()) {
    if (!sampleValuesDiffer(sampled.emissiveIntensity, 1, 1e-5)) continue;
    materialAnimations.set(sampled.material.uuid, {
      schemaVersion: '1',
      durationSeconds,
      tracks: [{ property: 'emissiveIntensity', times, values: sampled.emissiveIntensity }]
    });
  }
  return {
    animations: tracks.length ? [new THREE.AnimationClip('img2threejs-procedural-runtime', durationSeconds, tracks)] : [],
    materialAnimations
  };
}
function sampleValuesDiffer(values, stride, epsilon) {
  for (let offset = stride; offset < values.length; offset += stride) {
    for (let component = 0; component < stride; component += 1) {
      if (Math.abs(values[offset + component] - values[component]) > epsilon) return true;
    }
  }
  return false;
}
function clonePortableMaterial(material, materialAnimations) {
  const cloned = material.clone();
  const animation = materialAnimations.get(material.uuid);
  if (animation) cloned.userData.img2threejsAnimation = animation;
  return cloned;
}
function portableBackground(background) {
  if (background instanceof THREE.Color) return { kind: 'color', value: '#' + background.getHexString() };
  const canvas = background?.image;
  if (canvas && typeof canvas.toDataURL === 'function') {
    return { kind: 'data-url', dataUrl: canvas.toDataURL('image/png') };
  }
  return { kind: 'color', value: '#eef2f7' };
}
function bakeWorldAxisColorRamp(mesh, ramp) {
  const position = mesh.geometry.getAttribute('position');
  const axis = ramp.axis === 'x' || ramp.axis === 'z' ? ramp.axis : 'y';
  const minimum = Number(ramp.min);
  const maximum = Number(ramp.max);
  const stops = Array.isArray(ramp.stops)
    ? ramp.stops.map((stop) => ({
        position: Number(stop.position),
        color: new THREE.Color(stop.color).convertSRGBToLinear()
      })).filter((stop) => Number.isFinite(stop.position))
    : [];
  if (!position || !Number.isFinite(minimum) || !Number.isFinite(maximum) || maximum <= minimum || stops.length < 2) {
    throw new Error('EXPORT_OUTPUT_INVALID: portable color-ramp metadata is invalid.');
  }
  stops.sort((a, b) => a.position - b.position);
  const world = new THREE.Vector3();
  const colors = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) {
    world.fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld);
    const sample = THREE.MathUtils.clamp((world[axis] - minimum) / (maximum - minimum), 0, 1);
    const color = stops[0].color.clone();
    for (let stopIndex = 1; stopIndex < stops.length; stopIndex += 1) {
      const previous = stops[stopIndex - 1];
      const current = stops[stopIndex];
      color.lerp(current.color, THREE.MathUtils.smoothstep(sample, previous.position, current.position));
    }
    color.toArray(colors, index * 3);
  }
  mesh.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}
function measureVisibility(source) {
  const snapshot = document.createElement('canvas');
  snapshot.width = source.width; snapshot.height = source.height;
  const context = snapshot.getContext('2d', { willReadFrequently: true });
  context.drawImage(source, 0, 0);
  const { data, width, height } = context.getImageData(0, 0, snapshot.width, snapshot.height);
  const background = [data[0], data[1], data[2]];
  let visible = 0; let minX = width; let minY = height; let maxX = -1; let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const difference = Math.abs(data[offset] - background[0]) +
        Math.abs(data[offset + 1] - background[1]) +
        Math.abs(data[offset + 2] - background[2]);
      if (difference <= 24 || data[offset + 3] < 128) continue;
      visible += 1;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  }
  const canvasPixels = width * height;
  const silhouettePixels = visible
    ? (maxX - minX + 1) * (maxY - minY + 1)
    : canvasPixels;
  return {
    visiblePixelRatio: visible / canvasPixels,
    silhouetteFillRatio: visible / silhouettePixels,
    silhouetteWidthRatio: visible ? (maxX - minX + 1) / width : 0,
    silhouetteHeightRatio: visible ? (maxY - minY + 1) / height : 0
  };
}
function canvasPixels(source) {
  const snapshot = document.createElement('canvas'); snapshot.width = source.width; snapshot.height = source.height;
  const context = snapshot.getContext('2d', { willReadFrequently: true }); context.drawImage(source, 0, 0);
  const pixels = context.getImageData(0, 0, snapshot.width, snapshot.height);
  return { data: pixels.data, width: pixels.width, height: pixels.height, sourceHasAlpha: false };
}
async function loadContainedImage(dataUrl, width, height) {
  const image = new Image(); image.src = dataUrl;
  await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.fillStyle = '#eef2f7'; context.fillRect(0, 0, width, height);
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale; const drawHeight = image.naturalHeight * scale;
  context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  const pixels = context.getImageData(0, 0, width, height);
  return { data: pixels.data, width: pixels.width, height: pixels.height, sourceHasAlpha: dataUrl.startsWith('data:image/png') };
}
function compareImages(reference, rendered, review) {
  const referenceMaskInfo = buildMask(reference, false);
  const renderMaskInfo = buildMask(rendered, true);
  const silhouetteIoU = maskIoU(referenceMaskInfo.mask, renderMaskInfo.mask);
  const scaleScore = boundsScaleScore(referenceMaskInfo.bounds, renderMaskInfo.bounds);
  const referenceEdges = buildEdges(reference);
  const renderEdges = buildEdges(rendered);
  const edgeScore = binaryDice(referenceEdges, renderEdges);
  const perceptualScore = luminanceSimilarity(reference, rendered, unionMask(referenceMaskInfo.mask, renderMaskInfo.mask));
  const featureResults = review.featureReviewTargets.map((target) => ({
    id: target.id,
    label: target.label,
    criticality: target.criticality,
    metric: target.metric,
    score: regionScore(target.metric, target.region, reference, rendered, referenceMaskInfo.mask, renderMaskInfo.mask, referenceEdges, renderEdges),
    threshold: target.threshold
  })).map((result) => ({ ...result, passed: result.score >= result.threshold }));
  const hardGateEligible = referenceMaskInfo.confidence >= review.minimumReferenceMaskConfidence;
  const passed = hardGateEligible &&
    silhouetteIoU >= review.minimumSilhouetteIoU &&
    scaleScore >= review.minimumScaleScore &&
    (edgeScore >= review.minimumEdgeScore || perceptualScore >= review.minimumPerceptualScore) &&
    featureResults.every((feature) => feature.criticality !== 'critical' || feature.passed);
  return {
    maskConfidence: referenceMaskInfo.confidence,
    silhouetteIoU,
    scaleScore,
    edgeScore,
    perceptualScore,
    hardGateEligible,
    featureResults,
    passed
  };
}
function buildMask(image, knownBackground) {
  const { data, width, height } = image;
  const corners = [[0,0],[width-1,0],[0,height-1],[width-1,height-1]].map(([x,y]) => {
    const i = (y * width + x) * 4; return [data[i], data[i+1], data[i+2]];
  });
  const background = [0,1,2].map((channel) => corners.reduce((sum, color) => sum + color[channel], 0) / corners.length);
  const variance = corners.reduce((sum, color) => sum + color.reduce((part, value, channel) => part + Math.abs(value-background[channel]), 0), 0) / 12;
  const mask = new Uint8Array(width * height);
  let count = 0; let minX=width; let minY=height; let maxX=-1; let maxY=-1;
  for (let y=0; y<height; y+=1) for (let x=0; x<width; x+=1) {
    const i=(y*width+x)*4;
    const difference=Math.abs(data[i]-background[0])+Math.abs(data[i+1]-background[1])+Math.abs(data[i+2]-background[2]);
    if (difference > (knownBackground ? 24 : 54) && data[i+3] > 80) {
      mask[y*width+x]=1; count+=1; minX=Math.min(minX,x); minY=Math.min(minY,y); maxX=Math.max(maxX,x); maxY=Math.max(maxY,y);
    }
  }
  const ratio=count/(width*height);
  const plausible=ratio>=0.015&&ratio<=0.9 ? 1 : Math.max(0, Math.min(1, ratio/0.015));
  const uniformity=Math.max(0,1-variance/70);
  return { mask, confidence: knownBackground ? 1 : plausible*(.45+uniformity*.55), bounds: count ? {minX,minY,maxX,maxY,count,width,height} : null };
}
function buildEdges(image) {
  const {data,width,height}=image; const edges=new Uint8Array(width*height);
  for(let y=1;y<height-1;y+=1) for(let x=1;x<width-1;x+=1) {
    const lum=(px,py)=>{const i=(py*width+px)*4;return data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722};
    const gradient=Math.abs(lum(x+1,y)-lum(x-1,y))+Math.abs(lum(x,y+1)-lum(x,y-1));
    if(gradient>38) edges[y*width+x]=1;
  }
  return edges;
}
function maskIoU(a,b){let intersection=0,union=0;for(let i=0;i<a.length;i+=1){if(a[i]||b[i])union+=1;if(a[i]&&b[i])intersection+=1}return union?intersection/union:0}
function binaryDice(a,b){let aa=0,bb=0,both=0;for(let i=0;i<a.length;i+=1){aa+=a[i];bb+=b[i];if(a[i]&&b[i])both+=1}return aa+bb?2*both/(aa+bb):0}
function boundsScaleScore(a,b){if(!a||!b)return 0;const ar=a.count/(a.width*a.height),br=b.count/(b.width*b.height);return Math.exp(-Math.abs(Math.log(Math.max(ar,1e-6)/Math.max(br,1e-6))))}
function unionMask(a,b){const result=new Uint8Array(a.length);for(let i=0;i<a.length;i+=1)result[i]=a[i]||b[i]?1:0;return result}
function luminanceSimilarity(a,b,mask){let difference=0,count=0;for(let i=0;i<mask.length;i+=1){if(!mask[i])continue;const p=i*4;const la=a.data[p]*.2126+a.data[p+1]*.7152+a.data[p+2]*.0722;const lb=b.data[p]*.2126+b.data[p+1]*.7152+b.data[p+2]*.0722;difference+=Math.abs(la-lb);count+=1}return count?Math.max(0,1-difference/(count*255)):0}
function regionScore(metric,region,reference,rendered,referenceMask,renderMask,referenceEdges,renderEdges){
  const width=reference.width,height=reference.height;const x0=Math.floor(region.x*width),y0=Math.floor(region.y*height),x1=Math.ceil((region.x+region.width)*width),y1=Math.ceil((region.y+region.height)*height);
  const indices=[];for(let y=y0;y<Math.min(height,y1);y+=1)for(let x=x0;x<Math.min(width,x1);x+=1)indices.push(y*width+x);
  if(metric==='silhouette')return subsetDice(referenceMask,renderMask,indices);
  if(metric==='edge')return subsetDice(referenceEdges,renderEdges,indices);
  if(metric==='luminance')return subsetLuminance(reference,rendered,indices);
  return subsetColor(reference,rendered,indices);
}
function subsetDice(a,b,indices){let aa=0,bb=0,both=0;for(const i of indices){aa+=a[i];bb+=b[i];if(a[i]&&b[i])both+=1}return aa+bb?2*both/(aa+bb):0}
function subsetLuminance(a,b,indices){let difference=0;for(const i of indices){const p=i*4;const la=a.data[p]*.2126+a.data[p+1]*.7152+a.data[p+2]*.0722;const lb=b.data[p]*.2126+b.data[p+1]*.7152+b.data[p+2]*.0722;difference+=Math.abs(la-lb)}return indices.length?Math.max(0,1-difference/(indices.length*255)):0}
function subsetColor(a,b,indices){let difference=0;for(const i of indices){const p=i*4;difference+=(Math.abs(a.data[p]-b.data[p])+Math.abs(a.data[p+1]-b.data[p+1])+Math.abs(a.data[p+2]-b.data[p+2]))/3}return indices.length?Math.max(0,1-difference/(indices.length*255)):0}
`
}

function comparisonHtml(projectName, references, rendered) {
  const cards = (items, kind) => items.map((item) => `<article><div class="frame"><img src="${item.dataUrl}" alt=""></div><strong>${escapeHtml(item.label ?? item.view)}</strong><small>${escapeHtml(item.view)}</small></article>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;padding:32px;background:#f8fafc;color:#0f172a;font-family:Inter,system-ui,sans-serif}h1{margin:0 0 6px}h2{font-size:16px;margin:24px 0 12px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}article{padding:10px;border:1px solid #cbd5e1;border-radius:14px;background:white}.frame{height:210px;display:grid;place-items:center;overflow:hidden;border-radius:9px;background:#e2e8f0}.frame img{width:100%;height:100%;object-fit:contain}strong,small{display:block;margin-top:7px}small{color:#64748b}
</style></head><body><h1>${escapeHtml(projectName)}</h1><p>Deterministic reference-versus-browser-render evidence</p><h2>References</h2><div class="grid">${cards(references, 'reference')}</div><h2>Browser renders</h2><div class="grid">${cards(rendered, 'render')}</div></body></html>`
}

async function readBounded(filePath, maximum) {
  const content = await readFile(filePath)
  if (!content.length || content.length > maximum) throw new Error('EXPORT_INPUT_INVALID: input is empty or exceeds its size limit.')
  return content
}
function validatePng(buffer) {
  if (buffer.length < 8 || buffer.length > 36 * 1024 * 1024 || !buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
    throw new Error('EXPORT_OUTPUT_INVALID: rendered PNG is invalid or exceeds 36 MiB.')
  }
}
function validateGlb(buffer) {
  if (buffer.length < 20 || buffer.length > 64 * 1024 * 1024 || buffer.toString('ascii', 0, 4) !== 'glTF' || buffer.readUInt32LE(4) !== 2 || buffer.readUInt32LE(8) !== buffer.length) {
    throw new Error('EXPORT_OUTPUT_INVALID: exported GLB is invalid or exceeds 64 MiB.')
  }
}
function allowedInputPath(value) {
  return typeof value === 'string' && value.length <= 240 && !path.isAbsolute(value) && !value.includes('\\') &&
    value.split('/').every((part) => part && part !== '.' && part !== '..')
}
function argument(name) {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : ''
  if (!value || value.includes('\0')) throw new Error(`EXPORT_INPUT_INVALID: ${name} is required.`)
  return path.resolve(value)
}
function progress(value, stage, message, current, total) {
  process.stdout.write(`XPERT_SANDBOX_PROGRESS ${JSON.stringify({ progress: value, stage, message, ...(current ? { current } : {}), ...(total ? { total } : {}) })}\n`)
}
function classify(message) {
  const upper = message.toUpperCase()
  if (upper.includes('EXPORT_OUTPUT_INVALID')) return 'EXPORT_OUTPUT_INVALID'
  if (upper.includes('EXPORT_INPUT_INVALID')) return 'EXPORT_INPUT_INVALID'
  if (upper.includes('TIMEOUT')) return 'EXPORT_TIMEOUT'
  if (upper.includes('BROWSER') || upper.includes('CHROMIUM') || upper.includes('PLAYWRIGHT') || upper.includes('WEBGL')) return 'BROWSER_LAUNCH_FAILED'
  if (upper.includes('ENOMEM') || upper.includes('OUT OF MEMORY') || upper.includes('OOM')) return 'EXPORT_OOM'
  return 'SANDBOX_START_FAILED'
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (character) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character])) }
function isObject(value) { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function finiteUnit(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 }
function isVec3(value) { return Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === 'number' && Number.isFinite(item)) }
function isReferenceCamera(value) {
  return isObject(value) && typeof value.evidenceId === 'string' && allowedViews.has(value.view) &&
    ['perspective', 'orthographic'].includes(value.projection) && isVec3(value.position) &&
    isVec3(value.target) && isVec3(value.up) && typeof value.fovDegrees === 'number' &&
    (value.orthographicHeight === null || typeof value.orthographicHeight === 'number')
}
function isFeatureReviewTarget(value) {
  return isObject(value) && typeof value.id === 'string' && typeof value.label === 'string' &&
    typeof value.evidenceId === 'string' && allowedViews.has(value.view) &&
    ['silhouette', 'edge', 'color', 'luminance'].includes(value.metric) &&
    ['critical', 'important'].includes(value.criticality) && finiteUnit(value.threshold) &&
    isObject(value.region) && ['x','y','width','height'].every((key) => finiteUnit(value.region[key]))
}
