export interface MoonshotJsonSchema {
  [key: string]: unknown
}

const MoonshotDefinitionPrefix = '#/$defs/'
const SchemaMapKeywords = ['$defs', 'definitions', 'properties', 'patternProperties', 'dependentSchemas'] as const
const SchemaValueKeywords = [
  'additionalItems',
  'additionalProperties',
  'contains',
  'contentSchema',
  'else',
  'if',
  'not',
  'propertyNames',
  'then',
  'unevaluatedItems',
  'unevaluatedProperties'
] as const
const SchemaArrayKeywords = ['allOf', 'anyOf', 'oneOf', 'prefixItems'] as const

export function normalizeMoonshotJsonSchema(schema: MoonshotJsonSchema): MoonshotJsonSchema {
  if (!hasReferenceNeedingNormalization(schema)) {
    return schema
  }

  const sourceRoot = structuredClone(schema)
  const normalizedRoot = structuredClone(schema)
  const definitionNames = new Map<string, string>()
  const visited = new WeakSet<object>()
  let nextDefinitionId = 1

  function ensureDefinitions(): MoonshotJsonSchema {
    const existingDefinitions = normalizedRoot['$defs']
    if (existingDefinitions === undefined) {
      const definitions: MoonshotJsonSchema = {}
      normalizedRoot['$defs'] = definitions
      return definitions
    }
    if (!isSchemaObject(existingDefinitions)) {
      throw new Error('Cannot normalize Moonshot JSON schema because root "$defs" is not an object')
    }
    return existingDefinitions
  }

  function materializeDefinition(reference: string): string {
    const existingName = definitionNames.get(reference)
    if (existingName) {
      return existingName
    }
    if (!reference.startsWith('#')) {
      throw cannotNormalizeReference(reference, 'external references are unsupported')
    }

    const target = resolveLocalReference(sourceRoot, reference)
    const definitions = ensureDefinitions()
    let definitionName = `moonshot_ref_${nextDefinitionId++}`
    while (Object.hasOwn(definitions, definitionName)) {
      definitionName = `moonshot_ref_${nextDefinitionId++}`
    }

    definitionNames.set(reference, definitionName)
    const definition: unknown = structuredClone(target)
    definitions[definitionName] = definition
    normalizeValue(definition)
    return definitionName
  }

  function normalizeValue(value: unknown): void {
    if (!isSchemaObject(value) || visited.has(value)) {
      return
    }
    visited.add(value)

    const reference = value['$ref']
    if (reference !== undefined) {
      if (typeof reference !== 'string') {
        throw new Error('Cannot normalize Moonshot JSON schema reference because "$ref" is not a string')
      }
      if (!reference.startsWith(MoonshotDefinitionPrefix)) {
        value['$ref'] = `${MoonshotDefinitionPrefix}${materializeDefinition(reference)}`
      }
    }

    forEachChildSchema(value, normalizeValue)
  }

  normalizeValue(normalizedRoot)
  return normalizedRoot
}

function hasReferenceNeedingNormalization(value: unknown, visited = new WeakSet<object>()): boolean {
  if (!isSchemaObject(value) || visited.has(value)) {
    return false
  }
  visited.add(value)

  const reference = value['$ref']
  if (reference !== undefined && (typeof reference !== 'string' || !reference.startsWith(MoonshotDefinitionPrefix))) {
    return true
  }

  let hasReference = false
  forEachChildSchema(value, (child) => {
    if (!hasReference && hasReferenceNeedingNormalization(child, visited)) {
      hasReference = true
    }
  })
  return hasReference
}

function forEachChildSchema(schema: MoonshotJsonSchema, visit: (child: unknown) => void): void {
  for (const keyword of SchemaMapKeywords) {
    const schemas = schema[keyword]
    if (isSchemaObject(schemas)) {
      Object.values(schemas).forEach(visitSchema)
    }
  }

  const dependencies = schema['dependencies']
  if (isSchemaObject(dependencies)) {
    Object.values(dependencies).forEach((dependency) => {
      if (!Array.isArray(dependency)) {
        visitSchema(dependency)
      }
    })
  }

  for (const keyword of SchemaValueKeywords) {
    visitSchema(schema[keyword])
  }

  const items = schema['items']
  if (Array.isArray(items)) {
    items.forEach(visitSchema)
  } else {
    visitSchema(items)
  }

  for (const keyword of SchemaArrayKeywords) {
    const schemas = schema[keyword]
    if (Array.isArray(schemas)) {
      schemas.forEach(visitSchema)
    }
  }

  function visitSchema(value: unknown): void {
    if (isSchemaObject(value) || typeof value === 'boolean') {
      visit(value)
    }
  }
}

function resolveLocalReference(root: MoonshotJsonSchema, reference: string): unknown {
  const segments = parseLocalReference(reference)
  let current: unknown = root

  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = Number(segment)
      if (!Number.isInteger(index) || index < 0 || String(index) !== segment || index >= current.length) {
        throw cannotNormalizeReference(reference, 'array index does not exist')
      }
      current = current[index]
      continue
    }
    if (!isSchemaObject(current) || !Object.hasOwn(current, segment)) {
      throw cannotNormalizeReference(reference, 'target does not exist')
    }
    current = current[segment]
  }

  return current
}

function parseLocalReference(reference: string): string[] {
  let pointer: string
  try {
    pointer = decodeURIComponent(reference.slice(1))
  } catch {
    throw cannotNormalizeReference(reference, 'URI fragment is invalid')
  }
  if (pointer === '') {
    return []
  }
  if (!pointer.startsWith('/')) {
    throw cannotNormalizeReference(reference, 'JSON pointer is invalid')
  }

  return pointer
    .slice(1)
    .split('/')
    .map((segment) => {
      if (/~(?:[^01]|$)/.test(segment)) {
        throw cannotNormalizeReference(reference, 'JSON pointer escape is invalid')
      }
      return segment.replace(/~1/g, '/').replace(/~0/g, '~')
    })
}

function isSchemaObject(value: unknown): value is MoonshotJsonSchema {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cannotNormalizeReference(reference: string, reason: string): Error {
  return new Error(`Cannot normalize Moonshot JSON schema reference "${reference}": ${reason}`)
}
