import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { serializeTextEstimate, parseTextEstimate, estimateFromText } from '../textLogParser'
import type { TextEstimateResult } from '../types'

// Mock window.agent
const mockChatCompletions = vi.fn()
vi.stubGlobal('window', {
  agent: {
    chatCompletions: mockChatCompletions,
  },
})

// Mock localStorage for settings
const mockLocalStorage = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()
vi.stubGlobal('localStorage', mockLocalStorage)

// Mock the auditLog module
vi.mock('../auditLog', () => ({
  writeAuditEntry: vi.fn().mockResolvedValue({ id: 1, actor: 'agent', action: 'text_estimate_success', payload: {}, timestamp: new Date().toISOString() }),
}))

// Mock Dexie (needed by stores/planning.ts)
vi.mock('dexie', () => {
  const mockTable = {
    add: vi.fn().mockResolvedValue(1),
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
    orderBy: vi.fn().mockReturnThis(),
    reverse: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    toArray: vi.fn().mockResolvedValue([]),
    where: vi.fn().mockReturnThis(),
    equals: vi.fn().mockReturnThis(),
  }
  return {
    default: class Dexie {
      constructor() {
        return new Proxy(this, {
          get: (target, prop) => {
            if (prop === 'version') return () => ({ stores: () => {} })
            if (typeof prop === 'string' && !prop.startsWith('_')) return mockTable
            return Reflect.get(target, prop)
          },
        })
      }
      version() { return { stores: () => ({ version: () => ({ stores: () => {} }) }) } }
    },
    type: {},
  }
})

describe('serializeTextEstimate', () => {
  const validResult: TextEstimateResult = {
    name: '午餐',
    servings: 1,
    calories: 550,
    protein: 30,
    carbs: 60,
    fat: 20,
    confidence: 0.78,
    items: [
      {
        name: '红烧牛肉面',
        servings: 1,
        calories: 450,
        protein: 25,
        carbs: 50,
        fat: 15,
        confidence: 0.8,
      },
      {
        name: '茶叶蛋',
        servings: 1,
        calories: 100,
        protein: 5,
        carbs: 10,
        fat: 5,
        confidence: 0.9,
        recipeId: 'tea-egg-001',
      },
    ],
  }

  it('serializes a valid TextEstimateResult to JSON', () => {
    const json = serializeTextEstimate(validResult)
    const parsed = JSON.parse(json)

    expect(parsed.name).toBe('午餐')
    expect(parsed.servings).toBe(1)
    expect(parsed.calories).toBe(550)
    expect(parsed.protein).toBe(30)
    expect(parsed.carbs).toBe(60)
    expect(parsed.fat).toBe(20)
    expect(parsed.confidence).toBe(0.78)
    expect(parsed.items).toHaveLength(2)
  })

  it('includes recipeId only when present', () => {
    const json = serializeTextEstimate(validResult)
    const parsed = JSON.parse(json)

    expect(parsed.items[0].recipeId).toBeUndefined()
    expect(parsed.items[1].recipeId).toBe('tea-egg-001')
  })

  it('preserves items order', () => {
    const json = serializeTextEstimate(validResult)
    const parsed = JSON.parse(json)

    expect(parsed.items[0].name).toBe('红烧牛肉面')
    expect(parsed.items[1].name).toBe('茶叶蛋')
  })
})

describe('parseTextEstimate', () => {
  it('parses a valid JSON envelope', () => {
    const json = JSON.stringify({
      name: '早餐',
      servings: 1,
      calories: 350,
      protein: 15,
      carbs: 40,
      fat: 12,
      confidence: 0.85,
      items: [
        {
          name: '豆浆',
          servings: 1,
          calories: 150,
          protein: 8,
          carbs: 15,
          fat: 5,
          confidence: 0.9,
        },
      ],
    })

    const result = parseTextEstimate(json)
    expect('code' in result).toBe(false)
    const estimate = result as TextEstimateResult
    expect(estimate.name).toBe('早餐')
    expect(estimate.items).toHaveLength(1)
    expect(estimate.items[0].name).toBe('豆浆')
  })

  it('returns error for invalid JSON', () => {
    const result = parseTextEstimate('not json at all')
    expect('code' in result).toBe(true)
    if ('code' in result) {
      expect(result.code).toBe('schemaValidationFailed')
      expect(result.offendingPath).toBe('$')
    }
  })

  it('returns error when root is not an object', () => {
    const result = parseTextEstimate('"just a string"')
    expect('code' in result).toBe(true)
    if ('code' in result) {
      expect(result.code).toBe('schemaValidationFailed')
      expect(result.offendingPath).toBe('$')
    }
  })

  it('returns error when name is missing', () => {
    const json = JSON.stringify({
      servings: 1, calories: 100, protein: 5, carbs: 10, fat: 5, confidence: 0.8, items: [],
    })
    const result = parseTextEstimate(json)
    expect('code' in result).toBe(true)
    if ('code' in result) {
      expect(result.offendingPath).toBe('$.name')
    }
  })

  it('returns error when a number field is missing', () => {
    const json = JSON.stringify({
      name: 'test', servings: 1, protein: 5, carbs: 10, fat: 5, confidence: 0.8, items: [],
    })
    const result = parseTextEstimate(json)
    expect('code' in result).toBe(true)
    if ('code' in result) {
      expect(result.offendingPath).toBe('$.calories')
    }
  })

  it('returns error when items is not an array', () => {
    const json = JSON.stringify({
      name: 'test', servings: 1, calories: 100, protein: 5, carbs: 10, fat: 5, confidence: 0.8, items: 'not array',
    })
    const result = parseTextEstimate(json)
    expect('code' in result).toBe(true)
    if ('code' in result) {
      expect(result.offendingPath).toBe('$.items')
    }
  })

  it('returns error when an item has invalid fields', () => {
    const json = JSON.stringify({
      name: 'test', servings: 1, calories: 100, protein: 5, carbs: 10, fat: 5, confidence: 0.8,
      items: [{ name: 'item', servings: 1, calories: 'not a number', protein: 5, carbs: 10, fat: 5, confidence: 0.8 }],
    })
    const result = parseTextEstimate(json)
    expect('code' in result).toBe(true)
    if ('code' in result) {
      expect(result.offendingPath).toBe('$.items[0].calories')
    }
  })

  it('returns error when item recipeId is not a string', () => {
    const json = JSON.stringify({
      name: 'test', servings: 1, calories: 100, protein: 5, carbs: 10, fat: 5, confidence: 0.8,
      items: [{ name: 'item', servings: 1, calories: 50, protein: 5, carbs: 10, fat: 5, confidence: 0.8, recipeId: 123 }],
    })
    const result = parseTextEstimate(json)
    expect('code' in result).toBe(true)
    if ('code' in result) {
      expect(result.offendingPath).toBe('$.items[0].recipeId')
    }
  })

  it('accepts items with optional recipeId', () => {
    const json = JSON.stringify({
      name: 'test', servings: 1, calories: 100, protein: 5, carbs: 10, fat: 5, confidence: 0.8,
      items: [{ name: 'item', servings: 1, calories: 50, protein: 5, carbs: 10, fat: 5, confidence: 0.8, recipeId: 'abc' }],
    })
    const result = parseTextEstimate(json)
    expect('code' in result).toBe(false)
    const estimate = result as TextEstimateResult
    expect(estimate.items[0].recipeId).toBe('abc')
  })

  it('returns error for NaN number fields', () => {
    const json = JSON.stringify({
      name: 'test', servings: NaN, calories: 100, protein: 5, carbs: 10, fat: 5, confidence: 0.8, items: [],
    })
    // JSON.stringify converts NaN to null
    const result = parseTextEstimate(json)
    expect('code' in result).toBe(true)
  })

  it('returns error when items array contains non-object', () => {
    const json = JSON.stringify({
      name: 'test', servings: 1, calories: 100, protein: 5, carbs: 10, fat: 5, confidence: 0.8,
      items: [42],
    })
    const result = parseTextEstimate(json)
    expect('code' in result).toBe(true)
    if ('code' in result) {
      expect(result.offendingPath).toBe('$.items[0]')
    }
  })
})

describe('estimateFromText', () => {
  beforeEach(() => {
    mockChatCompletions.mockReset()
    mockLocalStorage.clear()
    // Set up settings with a standard model
    mockLocalStorage.setItem('diet-agent-settings', JSON.stringify({
      agent: {
        provider: 'deepseek',
        apiBaseUrl: 'https://api.deepseek.com',
        model: 'deepseek-chat',
        toolCompatibility: 'auto',
      },
    }))
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns TextEstimateResult on successful response', async () => {
    const mockResponse = {
      content: JSON.stringify({
        name: '牛肉面',
        servings: 1,
        calories: 450,
        protein: 25,
        carbs: 50,
        fat: 15,
        confidence: 0.82,
        items: [
          { name: '牛肉面', servings: 1, calories: 450, protein: 25, carbs: 50, fat: 15, confidence: 0.85 },
        ],
      }),
      model: 'deepseek-chat',
      usage: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
    }
    mockChatCompletions.mockResolvedValue(mockResponse)

    const result = await estimateFromText('一碗牛肉面')
    expect(result).not.toHaveProperty('code')
    const estimate = result as TextEstimateResult
    expect(estimate.name).toBe('牛肉面')
    expect(estimate.items).toHaveLength(1)
    expect(estimate.confidence).toBe(0.82)
  })

  it('returns lowConfidence error when confidence < 0.5', async () => {
    const mockResponse = {
      content: JSON.stringify({
        name: '未知食物',
        servings: 1,
        calories: 200,
        protein: 10,
        carbs: 20,
        fat: 8,
        confidence: 0.3,
        items: [
          { name: '未知', servings: 1, calories: 200, protein: 10, carbs: 20, fat: 8, confidence: 0.25 },
        ],
      }),
      model: 'deepseek-chat',
      usage: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
    }
    mockChatCompletions.mockResolvedValue(mockResponse)

    const result = await estimateFromText('asdfghjkl')
    expect(result).toHaveProperty('code', 'lowConfidence')
    if ('code' in result) {
      expect(result.unrecognizedTokens).toBeDefined()
      expect(result.unrecognizedTokens!.length).toBeGreaterThan(0)
    }
  })

  it('returns lowConfidence with raw text as token when no items have low confidence', async () => {
    const mockResponse = {
      content: JSON.stringify({
        name: '未知',
        servings: 1,
        calories: 100,
        protein: 5,
        carbs: 10,
        fat: 3,
        confidence: 0.4,
        items: [
          { name: '某食物', servings: 1, calories: 100, protein: 5, carbs: 10, fat: 3, confidence: 0.6 },
        ],
      }),
      model: 'deepseek-chat',
      usage: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
    }
    mockChatCompletions.mockResolvedValue(mockResponse)

    const result = await estimateFromText('xyz random text')
    expect(result).toHaveProperty('code', 'lowConfidence')
    if ('code' in result) {
      expect(result.unrecognizedTokens).toEqual(['xyz random text'])
    }
  })

  it('handles markdown-wrapped JSON in response', async () => {
    const jsonContent = JSON.stringify({
      name: '包子',
      servings: 2,
      calories: 400,
      protein: 15,
      carbs: 55,
      fat: 12,
      confidence: 0.75,
      items: [{ name: '肉包子', servings: 2, calories: 400, protein: 15, carbs: 55, fat: 12, confidence: 0.75 }],
    })
    mockChatCompletions.mockResolvedValue({
      content: '```json\n' + jsonContent + '\n```',
      model: 'deepseek-chat',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    })

    const result = await estimateFromText('两个肉包子')
    expect(result).not.toHaveProperty('code')
    const estimate = result as TextEstimateResult
    expect(estimate.name).toBe('包子')
  })

  it('returns parseError when response content is empty', async () => {
    mockChatCompletions.mockResolvedValue({
      content: '',
      model: 'deepseek-chat',
      usage: { promptTokens: 100, completionTokens: 0, totalTokens: 100 },
    })

    const result = await estimateFromText('一碗饭')
    expect(result).toHaveProperty('code', 'parseError')
  })

  it('returns parseError when response is invalid JSON', async () => {
    mockChatCompletions.mockResolvedValue({
      content: 'I cannot understand this food description.',
      model: 'deepseek-chat',
      usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
    })

    const result = await estimateFromText('一碗饭')
    expect(result).toHaveProperty('code', 'parseError')
  })

  it('returns parseError when chatCompletions throws', async () => {
    mockChatCompletions.mockRejectedValue(new Error('Network timeout'))

    const result = await estimateFromText('一碗饭')
    expect(result).toHaveProperty('code', 'parseError')
    if ('code' in result) {
      expect(result.reason).toContain('Network timeout')
    }
  })

  it('does not require vision capability', async () => {
    // Even with a non-vision model, text estimation should work
    mockLocalStorage.setItem('diet-agent-settings', JSON.stringify({
      agent: {
        provider: 'deepseek',
        apiBaseUrl: 'https://api.deepseek.com',
        model: 'deepseek-chat',
        toolCompatibility: 'auto',
      },
    }))

    mockChatCompletions.mockResolvedValue({
      content: JSON.stringify({
        name: '米饭',
        servings: 1,
        calories: 200,
        protein: 4,
        carbs: 45,
        fat: 1,
        confidence: 0.9,
        items: [{ name: '米饭', servings: 1, calories: 200, protein: 4, carbs: 45, fat: 1, confidence: 0.9 }],
      }),
      model: 'deepseek-chat',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    })

    const result = await estimateFromText('一碗白米饭')
    expect(result).not.toHaveProperty('code')
    const estimate = result as TextEstimateResult
    expect(estimate.name).toBe('米饭')
  })
})
