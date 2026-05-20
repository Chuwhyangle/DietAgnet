import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { serializePhotoEstimate, parsePhotoEstimate, estimateFromPhoto } from '../photoLogParser'
import type { PhotoEstimateResult } from '../types'

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
  writeAuditEntry: vi.fn().mockResolvedValue({ id: 1, actor: 'agent', action: 'photo_estimate_success', payload: {}, timestamp: new Date().toISOString() }),
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

describe('serializePhotoEstimate', () => {
  const validResult: PhotoEstimateResult = {
    name: '红烧肉套餐',
    servings: 1,
    calories: 650,
    protein: 35,
    carbs: 45,
    fat: 38,
    confidence: 0.85,
    items: [
      {
        name: '红烧肉',
        servings: 1,
        calories: 450,
        protein: 25,
        carbs: 10,
        fat: 35,
        confidence: 0.9,
      },
      {
        name: '米饭',
        servings: 1,
        calories: 200,
        protein: 10,
        carbs: 35,
        fat: 3,
        confidence: 0.95,
        recipeId: 'rice-001',
      },
    ],
  }

  it('serializes a valid PhotoEstimateResult to JSON', () => {
    const json = serializePhotoEstimate(validResult)
    const parsed = JSON.parse(json)

    expect(parsed.name).toBe('红烧肉套餐')
    expect(parsed.servings).toBe(1)
    expect(parsed.calories).toBe(650)
    expect(parsed.protein).toBe(35)
    expect(parsed.carbs).toBe(45)
    expect(parsed.fat).toBe(38)
    expect(parsed.confidence).toBe(0.85)
    expect(parsed.items).toHaveLength(2)
  })

  it('includes recipeId only when present', () => {
    const json = serializePhotoEstimate(validResult)
    const parsed = JSON.parse(json)

    expect(parsed.items[0].recipeId).toBeUndefined()
    expect(parsed.items[1].recipeId).toBe('rice-001')
  })

  it('preserves items order', () => {
    const json = serializePhotoEstimate(validResult)
    const parsed = JSON.parse(json)

    expect(parsed.items[0].name).toBe('红烧肉')
    expect(parsed.items[1].name).toBe('米饭')
  })
})

describe('parsePhotoEstimate', () => {
  it('parses a valid JSON envelope', () => {
    const json = JSON.stringify({
      name: '沙拉',
      servings: 1,
      calories: 250,
      protein: 12,
      carbs: 20,
      fat: 14,
      confidence: 0.8,
      items: [
        {
          name: '生菜',
          servings: 1,
          calories: 50,
          protein: 2,
          carbs: 8,
          fat: 1,
          confidence: 0.9,
        },
      ],
    })

    const result = parsePhotoEstimate(json)
    expect('code' in result).toBe(false)
    const estimate = result as PhotoEstimateResult
    expect(estimate.name).toBe('沙拉')
    expect(estimate.items).toHaveLength(1)
    expect(estimate.items[0].name).toBe('生菜')
  })

  it('returns error for invalid JSON', () => {
    const result = parsePhotoEstimate('not json at all')
    expect('code' in result).toBe(true)
    if ('code' in result) {
      expect(result.code).toBe('schemaValidationFailed')
      expect(result.offendingPath).toBe('$')
    }
  })

  it('returns error when root is not an object', () => {
    const result = parsePhotoEstimate('"just a string"')
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
    const result = parsePhotoEstimate(json)
    expect('code' in result).toBe(true)
    if ('code' in result) {
      expect(result.offendingPath).toBe('$.name')
    }
  })

  it('returns error when a number field is missing', () => {
    const json = JSON.stringify({
      name: 'test', servings: 1, protein: 5, carbs: 10, fat: 5, confidence: 0.8, items: [],
    })
    const result = parsePhotoEstimate(json)
    expect('code' in result).toBe(true)
    if ('code' in result) {
      expect(result.offendingPath).toBe('$.calories')
    }
  })

  it('returns error when items is not an array', () => {
    const json = JSON.stringify({
      name: 'test', servings: 1, calories: 100, protein: 5, carbs: 10, fat: 5, confidence: 0.8, items: 'not array',
    })
    const result = parsePhotoEstimate(json)
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
    const result = parsePhotoEstimate(json)
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
    const result = parsePhotoEstimate(json)
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
    const result = parsePhotoEstimate(json)
    expect('code' in result).toBe(false)
    const estimate = result as PhotoEstimateResult
    expect(estimate.items[0].recipeId).toBe('abc')
  })

  it('returns error for NaN number fields', () => {
    const json = JSON.stringify({
      name: 'test', servings: NaN, calories: 100, protein: 5, carbs: 10, fat: 5, confidence: 0.8, items: [],
    })
    // JSON.stringify converts NaN to null
    const result = parsePhotoEstimate(json)
    expect('code' in result).toBe(true)
  })
})

describe('estimateFromPhoto', () => {
  beforeEach(() => {
    mockChatCompletions.mockReset()
    mockLocalStorage.clear()
    // Set up settings with a vision-capable model
    mockLocalStorage.setItem('diet-agent-settings', JSON.stringify({
      agent: {
        provider: 'qwen',
        apiBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        model: 'qwen-vl-plus',
        toolCompatibility: 'auto',
      },
    }))
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns visionUnsupported when model is not vision-capable', async () => {
    mockLocalStorage.setItem('diet-agent-settings', JSON.stringify({
      agent: {
        provider: 'deepseek',
        apiBaseUrl: 'https://api.deepseek.com',
        model: 'deepseek-chat',
        toolCompatibility: 'auto',
      },
    }))

    const result = await estimateFromPhoto('base64imagedata')
    expect(result).toHaveProperty('code', 'visionUnsupported')
  })

  it('returns PhotoEstimateResult on successful response', async () => {
    const mockResponse = {
      content: JSON.stringify({
        name: '鸡蛋炒饭',
        servings: 1,
        calories: 400,
        protein: 15,
        carbs: 55,
        fat: 14,
        confidence: 0.82,
        items: [
          { name: '炒饭', servings: 1, calories: 350, protein: 12, carbs: 50, fat: 12, confidence: 0.85 },
          { name: '煎蛋', servings: 1, calories: 50, protein: 3, carbs: 5, fat: 2, confidence: 0.9 },
        ],
      }),
      model: 'qwen-vl-plus',
      usage: { promptTokens: 500, completionTokens: 200, totalTokens: 700 },
    }
    mockChatCompletions.mockResolvedValue(mockResponse)

    const result = await estimateFromPhoto('base64imagedata')
    expect(result).not.toHaveProperty('code')
    const estimate = result as PhotoEstimateResult
    expect(estimate.name).toBe('鸡蛋炒饭')
    expect(estimate.items).toHaveLength(2)
    expect(estimate.confidence).toBe(0.82)
  })

  it('handles markdown-wrapped JSON in response', async () => {
    const jsonContent = JSON.stringify({
      name: '面条',
      servings: 1,
      calories: 300,
      protein: 10,
      carbs: 45,
      fat: 8,
      confidence: 0.75,
      items: [{ name: '面条', servings: 1, calories: 300, protein: 10, carbs: 45, fat: 8, confidence: 0.75 }],
    })
    mockChatCompletions.mockResolvedValue({
      content: '```json\n' + jsonContent + '\n```',
      model: 'qwen-vl-plus',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    })

    const result = await estimateFromPhoto('base64imagedata')
    expect(result).not.toHaveProperty('code')
    const estimate = result as PhotoEstimateResult
    expect(estimate.name).toBe('面条')
  })

  it('returns parseError when response content is empty', async () => {
    mockChatCompletions.mockResolvedValue({
      content: '',
      model: 'qwen-vl-plus',
      usage: { promptTokens: 100, completionTokens: 0, totalTokens: 100 },
    })

    const result = await estimateFromPhoto('base64imagedata')
    expect(result).toHaveProperty('code', 'parseError')
  })

  it('returns parseError when response is invalid JSON', async () => {
    mockChatCompletions.mockResolvedValue({
      content: 'I cannot identify the food in this image.',
      model: 'qwen-vl-plus',
      usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
    })

    const result = await estimateFromPhoto('base64imagedata')
    expect(result).toHaveProperty('code', 'parseError')
  })

  it('returns parseError when chatCompletions throws a generic error', async () => {
    mockChatCompletions.mockRejectedValue(new Error('Network timeout'))

    const result = await estimateFromPhoto('base64imagedata')
    expect(result).toHaveProperty('code', 'parseError')
    if ('code' in result) {
      expect(result.reason).toContain('Network timeout')
    }
  })

  it('returns visionUnsupported when chatCompletions throws a vision-related error', async () => {
    mockChatCompletions.mockRejectedValue(new Error('This model does not support vision inputs'))

    const result = await estimateFromPhoto('base64imagedata')
    expect(result).toHaveProperty('code', 'visionUnsupported')
  })

  it('recognizes various vision-capable model names', async () => {
    const visionModels = ['qwen-vl-plus', 'gpt-4o', 'gpt-4-turbo-2024', 'claude-3-sonnet', 'deepseek-vl-7b', 'gemini-pro-vision']

    for (const model of visionModels) {
      mockLocalStorage.setItem('diet-agent-settings', JSON.stringify({
        agent: { provider: 'custom', apiBaseUrl: 'http://localhost', model, toolCompatibility: 'auto' },
      }))

      mockChatCompletions.mockResolvedValue({
        content: JSON.stringify({
          name: 'test', servings: 1, calories: 100, protein: 5, carbs: 10, fat: 5, confidence: 0.8,
          items: [],
        }),
        model,
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      })

      const result = await estimateFromPhoto('base64data')
      expect(result).not.toHaveProperty('code', 'visionUnsupported')
    }
  })
})
