/**
 * Unit tests for the One-Tap Logger orchestrator.
 *
 * Tests the executeOneTapLog function across all four source paths,
 * allergy conflict detection, estimate consistency validation,
 * and trust-mode auto-save logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { OneTapLogRequest, TrustMode } from '../types'
import type { UserMemory } from '../../stores/planning'

// Mock dependencies
vi.mock('../photoLogParser', () => ({
  estimateFromPhoto: vi.fn(),
}))

vi.mock('../textLogParser', () => ({
  estimateFromText: vi.fn(),
}))

vi.mock('../../stores/dietLog', () => ({
  addMealItemToDietLog: vi.fn(() => ({
    date: '2024-01-15',
    meals: [{ type: 'lunch', items: [{ name: 'Test', calories: 300, protein: 20, carbs: 30, fat: 10, servings: 1, recipeId: 'test-1' }] }],
  })),
  getDietLog: vi.fn(),
}))

vi.mock('../../stores/events', () => ({
  DIET_LOG_UPDATED_EVENT: 'diet-agent:diet-log-updated',
}))

vi.mock('../../data/recipes', () => ({
  recipes: [
    {
      id: 'rice-bowl',
      name: '米饭',
      emoji: '🍚',
      category: '主食',
      calories: 200,
      time: 10,
      ingredients: [{ name: '大米', amount: '100g' }],
      steps: ['煮饭'],
      nutrition: { protein: 4, carbs: 44, fat: 0.5 },
    },
    {
      id: 'peanut-dish',
      name: '花生炒菜',
      emoji: '🥜',
      category: '小炒',
      calories: 350,
      time: 15,
      ingredients: [{ name: '花生', amount: '50g' }],
      steps: ['炒'],
      nutrition: { protein: 12, carbs: 20, fat: 22 },
    },
  ],
}))

vi.mock('../trustDial', () => ({
  getCoachingSettings: vi.fn(() => ({
    trustMode: 'autopilot',
    estimateAutoConfidence: 0.7,
  })),
}))

vi.mock('../estimateValidator', () => ({
  validateEstimateConsistency: vi.fn(() => ({
    valid: true,
    derivedCalories: 300,
    reportedCalories: 300,
    deviationPercent: 0,
    itemResults: [],
  })),
}))

import { executeOneTapLog } from '../oneTapLogger'
import { estimateFromPhoto } from '../photoLogParser'
import { estimateFromText } from '../textLogParser'
import { addMealItemToDietLog, getDietLog } from '../../stores/dietLog'
import { validateEstimateConsistency } from '../estimateValidator'

const mockedEstimateFromPhoto = vi.mocked(estimateFromPhoto)
const mockedEstimateFromText = vi.mocked(estimateFromText)
const mockedGetDietLog = vi.mocked(getDietLog)
const mockedAddMealItemToDietLog = vi.mocked(addMealItemToDietLog)
const mockedValidateEstimateConsistency = vi.mocked(validateEstimateConsistency)

function createAllergyMemory(content: string, confidence = 0.8): UserMemory {
  return {
    id: 1,
    type: 'allergy',
    content,
    normalizedContent: content.toLowerCase(),
    tags: [],
    source: 'user_explicit',
    confidence,
    status: 'active',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  }
}

describe('executeOneTapLog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedGetDietLog.mockReturnValue(null)
    mockedAddMealItemToDietLog.mockReturnValue({
      date: '2024-01-15',
      meals: [
        {
          type: 'lunch',
          items: [
            {
              name: 'Test',
              calories: 300,
              protein: 20,
              carbs: 30,
              fat: 10,
              servings: 1,
              recipeId: 'test-1',
            },
          ],
        },
      ],
    })
    mockedValidateEstimateConsistency.mockReturnValue({
      valid: true,
      derivedCalories: 300,
      reportedCalories: 300,
      deviationPercent: 0,
      itemResults: [],
    })
  })

  describe('photo source', () => {
    it('should call estimateFromPhoto and auto-save in autopilot mode with high confidence', async () => {
      mockedEstimateFromPhoto.mockResolvedValue({
        name: '午餐',
        servings: 1,
        calories: 500,
        protein: 30,
        carbs: 50,
        fat: 15,
        confidence: 0.85,
        items: [
          { name: '鸡胸肉', servings: 1, calories: 300, protein: 25, carbs: 5, fat: 8, confidence: 0.9 },
          { name: '米饭', servings: 1, calories: 200, protein: 5, carbs: 45, fat: 1, confidence: 0.8 },
        ],
      })

      const request: OneTapLogRequest = {
        source: 'photo',
        date: '2024-01-15',
        mealType: 'lunch',
        imageBase64: 'base64data',
      }

      const result = await executeOneTapLog(request, 'autopilot', [])

      expect(result.success).toBe(true)
      expect(result.dietLog).toBeDefined()
      expect(mockedEstimateFromPhoto).toHaveBeenCalledWith('base64data')
      expect(mockedAddMealItemToDietLog).toHaveBeenCalledTimes(2)
    })

    it('should return error when photo estimation fails', async () => {
      mockedEstimateFromPhoto.mockResolvedValue({
        code: 'visionUnsupported',
        reason: '当前模型不支持图片识别',
      })

      const request: OneTapLogRequest = {
        source: 'photo',
        date: '2024-01-15',
        mealType: 'lunch',
        imageBase64: 'base64data',
      }

      const result = await executeOneTapLog(request, 'autopilot', [])

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('visionUnsupported')
    })

    it('should not auto-save in precision mode', async () => {
      mockedEstimateFromPhoto.mockResolvedValue({
        name: '午餐',
        servings: 1,
        calories: 500,
        protein: 30,
        carbs: 50,
        fat: 15,
        confidence: 0.9,
        items: [
          { name: '鸡胸肉', servings: 1, calories: 500, protein: 30, carbs: 50, fat: 15, confidence: 0.9 },
        ],
      })

      const request: OneTapLogRequest = {
        source: 'photo',
        date: '2024-01-15',
        mealType: 'lunch',
        imageBase64: 'base64data',
      }

      const result = await executeOneTapLog(request, 'precision', [])

      expect(result.success).toBe(true)
      expect(result.dietLog).toBeUndefined()
      expect(mockedAddMealItemToDietLog).not.toHaveBeenCalled()
    })

    it('should not auto-save in autopilot mode when confidence is below threshold', async () => {
      mockedEstimateFromPhoto.mockResolvedValue({
        name: '午餐',
        servings: 1,
        calories: 500,
        protein: 30,
        carbs: 50,
        fat: 15,
        confidence: 0.55,
        items: [
          { name: '鸡胸肉', servings: 1, calories: 500, protein: 30, carbs: 50, fat: 15, confidence: 0.55 },
        ],
      })

      const request: OneTapLogRequest = {
        source: 'photo',
        date: '2024-01-15',
        mealType: 'lunch',
        imageBase64: 'base64data',
      }

      const result = await executeOneTapLog(request, 'autopilot', [])

      expect(result.success).toBe(true)
      expect(result.dietLog).toBeUndefined()
      expect(mockedAddMealItemToDietLog).not.toHaveBeenCalled()
    })
  })

  describe('text_voice source', () => {
    it('should call estimateFromText and auto-save in autopilot mode', async () => {
      mockedEstimateFromText.mockResolvedValue({
        name: '午餐',
        servings: 1,
        calories: 400,
        protein: 20,
        carbs: 40,
        fat: 12,
        confidence: 0.8,
        items: [
          { name: '面条', servings: 1, calories: 400, protein: 20, carbs: 40, fat: 12, confidence: 0.8 },
        ],
      })

      const request: OneTapLogRequest = {
        source: 'text_voice',
        date: '2024-01-15',
        mealType: 'lunch',
        rawText: '一碗面条',
      }

      const result = await executeOneTapLog(request, 'autopilot', [])

      expect(result.success).toBe(true)
      expect(result.dietLog).toBeDefined()
      expect(mockedEstimateFromText).toHaveBeenCalledWith('一碗面条')
    })

    it('should return error when text estimation returns lowConfidence', async () => {
      mockedEstimateFromText.mockResolvedValue({
        code: 'lowConfidence',
        reason: '识别置信度太低',
        unrecognizedTokens: ['xyz'],
      })

      const request: OneTapLogRequest = {
        source: 'text_voice',
        date: '2024-01-15',
        mealType: 'lunch',
        rawText: 'xyz',
      }

      const result = await executeOneTapLog(request, 'autopilot', [])

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('lowConfidence')
    })
  })

  describe('same_as_yesterday source', () => {
    it('should copy yesterday meal items when available', async () => {
      mockedGetDietLog.mockReturnValue({
        date: '2024-01-14',
        meals: [
          {
            type: 'lunch',
            items: [
              { recipeId: 'r1', name: '鸡胸肉', servings: 1, calories: 300, protein: 25, carbs: 5, fat: 8 },
            ],
          },
        ],
      })

      const request: OneTapLogRequest = {
        source: 'same_as_yesterday',
        date: '2024-01-15',
        mealType: 'lunch',
      }

      const result = await executeOneTapLog(request, 'autopilot', [])

      expect(result.success).toBe(true)
      expect(result.dietLog).toBeDefined()
      expect(mockedAddMealItemToDietLog).toHaveBeenCalledTimes(1)
    })

    it('should return noYesterdayMeal error when no log exists', async () => {
      mockedGetDietLog.mockReturnValue(null)

      const request: OneTapLogRequest = {
        source: 'same_as_yesterday',
        date: '2024-01-15',
        mealType: 'lunch',
      }

      const result = await executeOneTapLog(request, 'autopilot', [])

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('noYesterdayMeal')
    })

    it('should return noYesterdayMeal error when meal type not found', async () => {
      mockedGetDietLog.mockReturnValue({
        date: '2024-01-14',
        meals: [
          {
            type: 'breakfast',
            items: [
              { recipeId: 'r1', name: '鸡蛋', servings: 1, calories: 80, protein: 6, carbs: 1, fat: 5 },
            ],
          },
        ],
      })

      const request: OneTapLogRequest = {
        source: 'same_as_yesterday',
        date: '2024-01-15',
        mealType: 'lunch',
      }

      const result = await executeOneTapLog(request, 'autopilot', [])

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('noYesterdayMeal')
    })
  })

  describe('common_chip source', () => {
    it('should look up recipe by chipRecipeId and auto-save', async () => {
      const request: OneTapLogRequest = {
        source: 'common_chip',
        date: '2024-01-15',
        mealType: 'lunch',
        chipRecipeId: 'rice-bowl',
      }

      const result = await executeOneTapLog(request, 'autopilot', [])

      expect(result.success).toBe(true)
      expect(result.dietLog).toBeDefined()
      expect(mockedAddMealItemToDietLog).toHaveBeenCalledWith({
        date: '2024-01-15',
        mealType: 'lunch',
        item: expect.objectContaining({
          recipeId: 'rice-bowl',
          name: '米饭',
          calories: 200,
        }),
      })
    })

    it('should return error when recipe not found', async () => {
      const request: OneTapLogRequest = {
        source: 'common_chip',
        date: '2024-01-15',
        mealType: 'lunch',
        chipRecipeId: 'nonexistent',
      }

      const result = await executeOneTapLog(request, 'autopilot', [])

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('parseError')
    })
  })

  describe('allergy conflict check', () => {
    it('should return allergyConflict when item matches allergy memory', async () => {
      const allergyMemories: UserMemory[] = [createAllergyMemory('花生')]

      const request: OneTapLogRequest = {
        source: 'common_chip',
        date: '2024-01-15',
        mealType: 'lunch',
        chipRecipeId: 'peanut-dish',
      }

      const result = await executeOneTapLog(request, 'autopilot', allergyMemories)

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('allergyConflict')
    })

    it('should not trigger allergy check for low-confidence memories', async () => {
      const allergyMemories: UserMemory[] = [createAllergyMemory('花生', 0.4)]

      const request: OneTapLogRequest = {
        source: 'common_chip',
        date: '2024-01-15',
        mealType: 'lunch',
        chipRecipeId: 'peanut-dish',
      }

      const result = await executeOneTapLog(request, 'autopilot', allergyMemories)

      expect(result.success).toBe(true)
    })

    it('should not trigger allergy check for non-active memories', async () => {
      const memory = createAllergyMemory('花生')
      memory.status = 'pending_confirm'
      const allergyMemories: UserMemory[] = [memory]

      const request: OneTapLogRequest = {
        source: 'common_chip',
        date: '2024-01-15',
        mealType: 'lunch',
        chipRecipeId: 'peanut-dish',
      }

      const result = await executeOneTapLog(request, 'autopilot', allergyMemories)

      expect(result.success).toBe(true)
    })
  })

  describe('estimate consistency validation', () => {
    it('should reject photo estimates that fail consistency check', async () => {
      mockedEstimateFromPhoto.mockResolvedValue({
        name: '午餐',
        servings: 1,
        calories: 500,
        protein: 30,
        carbs: 50,
        fat: 15,
        confidence: 0.85,
        items: [
          { name: '鸡胸肉', servings: 1, calories: 500, protein: 30, carbs: 50, fat: 15, confidence: 0.9 },
        ],
      })

      mockedValidateEstimateConsistency.mockReturnValue({
        valid: false,
        derivedCalories: 800,
        reportedCalories: 500,
        deviationPercent: 60,
        itemResults: [{ valid: false, derivedCalories: 800, reportedCalories: 500, deviationPercent: 60 }],
      })

      const request: OneTapLogRequest = {
        source: 'photo',
        date: '2024-01-15',
        mealType: 'lunch',
        imageBase64: 'base64data',
      }

      const result = await executeOneTapLog(request, 'autopilot', [])

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('estimateInconsistent')
    })

    it('should not validate consistency for same_as_yesterday source', async () => {
      mockedGetDietLog.mockReturnValue({
        date: '2024-01-14',
        meals: [
          {
            type: 'lunch',
            items: [
              { recipeId: 'r1', name: '鸡胸肉', servings: 1, calories: 300, protein: 25, carbs: 5, fat: 8 },
            ],
          },
        ],
      })

      const request: OneTapLogRequest = {
        source: 'same_as_yesterday',
        date: '2024-01-15',
        mealType: 'lunch',
      }

      const result = await executeOneTapLog(request, 'autopilot', [])

      expect(result.success).toBe(true)
      expect(mockedValidateEstimateConsistency).not.toHaveBeenCalled()
    })
  })
})
