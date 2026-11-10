// In-memory stand-in for a TypeORM Repository. Implements only the methods
// the resume-screening service actually calls: create, save, find, findOne,
// count. All fixture data is fictional.
import { randomUUID } from 'node:crypto'

function matches(row, where) {
  if (!where) return true
  return Object.entries(where).every(([key, value]) => {
    if (value === undefined) return true
    if (value === null) return row[key] === null || row[key] === undefined
    return row[key] === value
  })
}

export function createFakeRepository(initial = []) {
  const rows = [...initial]
  return {
    rows,
    // Synchronous on purpose: TypeORM Repository.create is sync, and the
    // service calls it without await. An async fake would hand save() a
    // Promise with no enumerable fields.
    create(input) {
      return { ...input, id: randomUUID(), createdAt: new Date(), updatedAt: new Date() }
    },
    async save(entity) {
      const now = new Date()
      if (!entity.id) entity.id = randomUUID()
      const index = rows.findIndex((row) => row.id === entity.id)
      const stored = { ...entity, updatedAt: now }
      if (!stored.createdAt) stored.createdAt = now
      if (index >= 0) rows[index] = stored
      else rows.push(stored)
      return stored
    },
    async find(options = {}) {
      let result = rows.filter((row) => matches(row, options.where))
      if (options.order) {
        const [key, direction] = Object.entries(options.order)[0]
        result = [...result].sort((a, b) => {
          if (a[key] === b[key]) return 0
          return (a[key] < b[key] ? -1 : 1) * (direction === 'DESC' ? -1 : 1)
        })
      }
      if (typeof options.skip === 'number') result = result.slice(options.skip)
      if (typeof options.take === 'number') result = result.slice(0, options.take)
      return result
    },
    async findOne(options = {}) {
      return rows.find((row) => matches(row, options.where)) ?? null
    },
    async count(options = {}) {
      return rows.filter((row) => matches(row, options.where)).length
    }
  }
}

export const SCOPE = {
  tenantId: '00000000-0000-0000-0000-000000000001',
  organizationId: '00000000-0000-0000-0000-000000000002',
  workspaceId: null,
  projectId: null,
  userId: '00000000-0000-0000-0000-000000000003'
}

export const JD = {
  title: 'Java 高级开发筛查（2026 年 11 月）',
  jobTitle: 'Java 高级开发',
  jdText: '负责核心交易系统的 Java 后端开发与性能优化，要求 5 年以上 Java 开发经验，本科及以上学历，熟练掌握 Java、Spring Boot 与 MySQL。',
  minYears: 5,
  minDegree: 'bachelor',
  requiredSkills: ['Java', 'Spring Boot', 'MySQL']
}

// Fictional candidates. Any resemblance to real persons is coincidental.
export const CANDIDATES = {
  senior: {
    name: '陈晓峰',
    yearsOfExperience: 8,
    degree: 'master',
    skills: ['Java', 'Spring Boot', 'MySQL', 'Redis'],
    resumeText: '8 年 Java 开发经验，硕士学历。主导交易系统重构，熟练使用 Java、Spring Boot、MySQL、Redis。'
  },
  junior: {
    name: '林涛',
    yearsOfExperience: 3,
    degree: 'bachelor',
    skills: ['Java'],
    resumeText: '3 年 Java 开发经验，本科学历。做过两个内部管理系统，主要使用 Java。'
  },
  associateDegree: {
    name: '王磊',
    yearsOfExperience: 6,
    degree: 'associate',
    skills: ['Java', 'Spring Boot', 'MySQL'],
    resumeText: '6 年 Java 开发经验，大专学历。熟悉 Java、Spring Boot、MySQL，有电商后台经验。'
  },
  boundary: {
    name: '赵敏',
    yearsOfExperience: 5,
    degree: 'bachelor',
    skills: ['Java', 'Spring Boot', 'MySQL'],
    resumeText: '5 年 Java 开发经验，本科学历。熟悉 Java、Spring Boot、MySQL。'
  }
}

export const DIMENSIONS = [
  { dimension: 'experience', score: 16, reason: '8 年 Java 经验，覆盖交易系统核心模块。' },
  { dimension: 'skills', score: 17, reason: 'Java、Spring Boot、MySQL 均有项目实证。' },
  { dimension: 'project_relevance', score: 15, reason: '主导过交易系统重构，与岗位高度相关。' },
  { dimension: 'stability', score: 14, reason: '近 4 年只换过一家公司，稳定性较好。' },
  { dimension: 'bonus', score: 10, reason: '有 Redis 缓存优化经验，可加分。' }
]
