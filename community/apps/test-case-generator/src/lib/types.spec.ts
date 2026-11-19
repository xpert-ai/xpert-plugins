import {
  TEST_CASE_REQUIREMENT_MIN_LENGTH,
  isValidRequirementText,
  validateGeneratedTestCase,
  normalizeTestCaseSteps
} from './types'

describe('isValidRequirementText', () => {
  it('returns false for null/undefined/empty', () => {
    expect(isValidRequirementText(null)).toBe(false)
    expect(isValidRequirementText(undefined)).toBe(false)
    expect(isValidRequirementText('')).toBe(false)
    expect(isValidRequirementText('   ')).toBe(false)
  })

  it('returns false for text shorter than minimum length', () => {
    expect(isValidRequirementText('登录功能')).toBe(false)
    expect(isValidRequirementText('用户登录需要验证密码')).toBe(false)
  })

  it('returns true for text at or above minimum length', () => {
    const valid = '用户登录功能需要验证手机号和密码，密码长度至少8位，包含字母和数字。'
    expect(isValidRequirementText(valid)).toBe(true)
  })

  it('trims whitespace before checking length', () => {
    const padded = '   这是一段足够长的需求描述，包含功能规则和输入输出约束信息。   '
    expect(isValidRequirementText(padded)).toBe(true)
  })
})

describe('validateGeneratedTestCase', () => {
  it('rejects null/undefined/non-object', () => {
    expect(validateGeneratedTestCase(null)).toBe(false)
    expect(validateGeneratedTestCase(undefined)).toBe(false)
    expect(validateGeneratedTestCase('string')).toBe(false)
    expect(validateGeneratedTestCase(123)).toBe(false)
  })

  it('rejects case missing required name', () => {
    expect(
      validateGeneratedTestCase({
        name: '',
        precondition: '前置',
        steps: ['步骤1'],
        expectedResult: '预期',
        priority: 'P1'
      })
    ).toBe(false)
  })

  it('rejects case with empty steps array', () => {
    expect(
      validateGeneratedTestCase({
        name: '用例1',
        precondition: '前置',
        steps: [],
        expectedResult: '预期',
        priority: 'P1'
      })
    ).toBe(false)
  })

  it('rejects case with invalid priority', () => {
    expect(
      validateGeneratedTestCase({
        name: '用例1',
        precondition: '前置',
        steps: ['步骤1'],
        expectedResult: '预期',
        priority: 'P3'
      })
    ).toBe(false)
  })

  it('accepts a valid test case', () => {
    expect(
      validateGeneratedTestCase({
        name: '正常登录',
        precondition: '用户已注册',
        steps: ['输入正确手机号', '输入正确密码', '点击登录'],
        expectedResult: '登录成功，跳转首页',
        priority: 'P0'
      })
    ).toBe(true)
  })
})

describe('normalizeTestCaseSteps', () => {
  it('returns empty array for non-array input', () => {
    expect(normalizeTestCaseSteps(null)).toEqual([])
    expect(normalizeTestCaseSteps(undefined)).toEqual([])
    expect(normalizeTestCaseSteps('not an array')).toEqual([])
  })

  it('trims and filters empty steps', () => {
    expect(normalizeTestCaseSteps(['  步骤1  ', '', '步骤2', '   '])).toEqual(['步骤1', '步骤2'])
  })

  it('converts non-string items to trimmed strings', () => {
    expect(normalizeTestCaseSteps([1, '  step  ', null])).toEqual(['1', 'step'])
  })
})

describe('TEST_CASE_REQUIREMENT_MIN_LENGTH', () => {
  it('is 20', () => {
    expect(TEST_CASE_REQUIREMENT_MIN_LENGTH).toBe(20)
  })
})
