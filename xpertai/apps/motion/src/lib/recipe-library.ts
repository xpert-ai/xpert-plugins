import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import type { MotionRecipeDetail, MotionRecipeSummary, MotionSearchRecipesInput } from './types.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))

type WindowData = {
  window: Record<string, unknown>
}

let recipeCache: MotionRecipeSummary[] | null = null

export function getMotionAssetRoot() {
  const candidates = [
    resolve(moduleDir, '../../../assets/upstream'),
    resolve(moduleDir, '../assets/upstream'),
    resolve(process.cwd(), 'assets/upstream'),
    resolve(process.cwd(), 'xpertai/apps/motion/assets/upstream')
  ]
  const root = candidates.find((candidate) => existsSync(join(candidate, 'MOTION-SPEC.md')))
  if (!root) {
    throw new Error(`Motion upstream assets were not found: ${candidates.join(', ')}`)
  }
  return root
}

export function readMotionSpec() {
  return readFileSync(join(getMotionAssetRoot(), 'MOTION-SPEC.md'), 'utf8')
}

export function loadMotionRecipes() {
  if (recipeCache) {
    return recipeCache
  }
  const context: WindowData = { window: {} }
  const recipesJs = readFileSync(join(getMotionAssetRoot(), 'app/data/recipes.js'), 'utf8')
  runInNewContext(recipesJs, context, { filename: 'recipes.js' })
  const value = context.window.MA_RECIPES
  if (!Array.isArray(value)) {
    throw new Error('Motion recipe index did not expose MA_RECIPES.')
  }
  recipeCache = value.map(normalizeRecipeSummary).filter((recipe): recipe is MotionRecipeSummary => Boolean(recipe))
  return recipeCache
}

export function loadDesignSystemsCount() {
  const context: WindowData = { window: {} }
  const source = readFileSync(join(getMotionAssetRoot(), 'app/data/design-systems.js'), 'utf8')
  runInNewContext(source, context, { filename: 'design-systems.js' })
  return Array.isArray(context.window.MA_DESIGN_SYSTEMS) ? context.window.MA_DESIGN_SYSTEMS.length : 0
}

export function readJsonDataFile(fileName: 'html-templates.json' | 'video-templates.json' | 'reicon-icons.json') {
  return JSON.parse(readFileSync(join(getMotionAssetRoot(), 'app/data', fileName), 'utf8')) as Record<string, unknown>
}

export function searchMotionRecipes(input: MotionSearchRecipesInput) {
  const page = Math.max(1, Math.floor(input.page ?? 1))
  const pageSize = Math.min(100, Math.max(1, Math.floor(input.pageSize ?? 24)))
  const query = normalizeSearch(input.query)
  const category = normalizeSearch(input.category)
  const surface = normalizeSearch(input.surface)
  const target = normalizeSearch(input.target)
  const runtime = normalizeSearch(input.runtime)
  const exportKind = normalizeSearch(input.exportKind)
  const status = normalizeSearch(input.status)
  const filtered = loadMotionRecipes().filter((recipe) => {
    const recipeCategory = normalizeSearch(recipe.category ?? recipe.cat)
    if (category && recipeCategory !== category) return false
    if (surface && !containsToken(recipe.surfaces ?? recipe.canvas, surface)) return false
    if (target && !containsToken(recipe.target, target)) return false
    if (runtime && !containsToken(recipe.runtime, runtime)) return false
    if (exportKind && !containsToken(recipe.export, exportKind)) return false
    if (status && normalizeSearch(recipe.status) !== status) return false
    if (!query) return true
    return recipeHaystack(recipe).includes(query)
  })
  const start = (page - 1) * pageSize
  return {
    items: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page,
    pageSize
  }
}

export function getMotionRecipeDetail(recipeId: string): MotionRecipeDetail {
  const id = normalizeRequiredId(recipeId)
  const summary = loadMotionRecipes().find((recipe) => recipe.id === id)
  if (!summary) {
    throw new Error(`Motion recipe not found: ${id}`)
  }
  const recipeDir = findRecipeDir(id)
  const manifestPath = recipeDir ? join(recipeDir, 'recipe.motion.yaml') : ''
  const skillPath = recipeDir ? join(recipeDir, 'SKILL.md') : ''
  return {
    summary,
    manifestText: manifestPath && existsSync(manifestPath) ? readFileSync(manifestPath, 'utf8') : undefined,
    skillText: skillPath && existsSync(skillPath) ? readFileSync(skillPath, 'utf8') : undefined,
    implementationFiles: recipeDir ? listImplementationFiles(recipeDir) : []
  }
}

function normalizeRecipeSummary(value: unknown): MotionRecipeSummary | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const raw = value as Record<string, unknown>
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string') {
    return null
  }
  const summary: MotionRecipeSummary = {
    id: raw.id,
    name: raw.name,
    category: stringValue(raw.category ?? raw.cat),
    cat: stringValue(raw.cat ?? raw.category),
    surfaces: stringArray(raw.surfaces),
    canvas: stringArray(raw.canvas),
    target: stringArray(raw.target),
    runtime: stringArray(raw.runtime),
    export: stringArray(raw.export),
    tags: stringArray(raw.tags),
    desc: stringValue(raw.desc ?? raw.description),
    description: stringValue(raw.description ?? raw.desc),
    status: stringValue(raw.status),
    preview: typeof raw.preview === 'string' ? raw.preview : null
  }
  return summary
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : undefined
}

function normalizeSearch(value: string | null | undefined) {
  return String(value ?? '').trim().toLowerCase()
}

function containsToken(values: string[] | undefined, token: string) {
  return Boolean(values?.some((value) => normalizeSearch(value) === token))
}

function recipeHaystack(recipe: MotionRecipeSummary) {
  return normalizeSearch(
    [
      recipe.id,
      recipe.name,
      recipe.category,
      recipe.desc,
      recipe.surfaces?.join(' '),
      recipe.target?.join(' '),
      recipe.runtime?.join(' '),
      recipe.export?.join(' '),
      recipe.tags?.join(' ')
    ]
      .filter(Boolean)
      .join(' ')
  )
}

function normalizeRequiredId(value: string) {
  const id = value.trim()
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(id)) {
    throw new Error('Motion recipe id is invalid.')
  }
  return id
}

function findRecipeDir(recipeId: string) {
  const recipesRoot = join(getMotionAssetRoot(), 'recipes')
  const surfaces = readdirSync(recipesRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())
  for (const surface of surfaces) {
    const candidate = join(recipesRoot, surface.name, recipeId)
    if (existsSync(join(candidate, 'recipe.motion.yaml'))) {
      return candidate
    }
  }
  return null
}

function listImplementationFiles(recipeDir: string) {
  return readdirSync(recipeDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(css|js|jsx|json|svg|html)$/i.test(entry.name) && entry.name !== 'preview.html')
    .map((entry) => entry.name)
    .sort()
}
