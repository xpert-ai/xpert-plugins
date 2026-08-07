import { normalizeMoonshotJsonSchema } from './moonshot-json-schema.js'

describe('normalizeMoonshotJsonSchema', () => {
  it('moves local property references into root definitions', () => {
    const schema = {
      type: 'object',
      properties: {
        audience: {
          type: 'string',
          enum: ['admins_only', 'workspace_all', 'custom', 'public_link']
        },
        accessMode: {
          $ref: '#/properties/audience'
        }
      }
    }

    const normalized = normalizeMoonshotJsonSchema(schema)

    expect(normalized).toEqual({
      type: 'object',
      properties: {
        audience: {
          type: 'string',
          enum: ['admins_only', 'workspace_all', 'custom', 'public_link']
        },
        accessMode: {
          $ref: '#/$defs/moonshot_ref_1'
        }
      },
      $defs: {
        moonshot_ref_1: {
          type: 'string',
          enum: ['admins_only', 'workspace_all', 'custom', 'public_link']
        }
      }
    })
    expect(schema.properties.accessMode.$ref).toBe('#/properties/audience')
  })

  it('rewrites recursive local references without expanding them infinitely', () => {
    const schema = {
      type: 'object',
      properties: {
        node: {
          type: 'object',
          properties: {
            children: {
              type: 'array',
              items: {
                $ref: '#/properties/node'
              }
            }
          }
        }
      }
    }

    expect(normalizeMoonshotJsonSchema(schema)).toMatchObject({
      properties: {
        node: {
          properties: {
            children: {
              items: {
                $ref: '#/$defs/moonshot_ref_1'
              }
            }
          }
        }
      },
      $defs: {
        moonshot_ref_1: {
          properties: {
            children: {
              items: {
                $ref: '#/$defs/moonshot_ref_1'
              }
            }
          }
        }
      }
    })
  })

  it('keeps schemas that already use root definitions unchanged', () => {
    const schema = {
      type: 'object',
      properties: {
        accessMode: {
          $ref: '#/$defs/accessMode'
        }
      },
      $defs: {
        accessMode: {
          type: 'string',
          enum: ['admins_only']
        }
      }
    }

    expect(normalizeMoonshotJsonSchema(schema)).toBe(schema)
  })

  it('does not interpret annotation values as nested schemas', () => {
    const schema = {
      type: 'object',
      properties: {
        payload: {
          type: 'object',
          default: {
            $ref: 'literal-default'
          },
          const: {
            $ref: 'literal-const'
          },
          enum: [
            {
              $ref: 'literal-enum'
            }
          ],
          examples: [
            {
              $ref: 'literal-example'
            }
          ]
        }
      }
    }

    expect(normalizeMoonshotJsonSchema(schema)).toBe(schema)
  })

  it('preserves annotation values while normalizing nested schema references', () => {
    const schema = {
      type: 'object',
      properties: {
        audience: {
          type: 'string'
        },
        payload: {
          type: 'array',
          default: {
            $ref: 'literal-default'
          },
          items: {
            $ref: '#/properties/audience'
          }
        }
      }
    }

    expect(normalizeMoonshotJsonSchema(schema)).toMatchObject({
      properties: {
        payload: {
          default: {
            $ref: 'literal-default'
          },
          items: {
            $ref: '#/$defs/moonshot_ref_1'
          }
        }
      }
    })
  })

  it('resolves escaped JSON pointer segments', () => {
    const schema = {
      type: 'object',
      properties: {
        'access/mode': {
          type: 'string'
        },
        selected: {
          $ref: '#/properties/access~1mode'
        }
      }
    }

    expect(normalizeMoonshotJsonSchema(schema)).toMatchObject({
      properties: {
        selected: {
          $ref: '#/$defs/moonshot_ref_1'
        }
      },
      $defs: {
        moonshot_ref_1: {
          type: 'string'
        }
      }
    })
  })

  it.each([
    ['external', 'https://example.com/schema.json'],
    ['unresolved', '#/properties/missing']
  ])('rejects %s references explicitly', (_label, reference) => {
    expect(() =>
      normalizeMoonshotJsonSchema({
        type: 'object',
        properties: {
          value: {
            $ref: reference
          }
        }
      })
    ).toThrow(`Cannot normalize Moonshot JSON schema reference "${reference}"`)
  })
})
