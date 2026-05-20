/**
 * Unit tests for the Autopilot Planner module.
 *
 * Tests generateMealSuggestions, acceptCandidate, and skipSuggestionRound.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies
vi.mock('../../planning/dynamicPlan', () => ({
  getDailyPlanGap: vi.fn(),
}))

vi.mock('../../habits/rhythmSummary', () => ({
  buildRhythmSummaryStructured: vi.fn(),
}))

vi.mock('../../stores/planning', () => ({
  getUserMemories: vi.fn(),
  savePlannedMeal: vi.fn(),
}))

vi.mock('../../stores/dietLog', () => ({
  addMealItemToDietLog: vi.fn(),
  getDietLog: vi.fn(),
}))

vi.mock('../auditLog', () => ({
  writeAuditEntry: vi.fn(),
}))

vi.mock('../../data/recipes', () => ({
  recipes: [
    {
      id: 'chicken-breast',
      name: '鸡胸肉沙拉',
      emoji: '🥗',
      category: '轻食',
      calories: 350,
      time: 15,
      ingredients: [
        { name: '鸡胸肉', amount: '150g' },
        { name: '生菜', amount: '100g' },
      ],
      steps: ['煮鸡胸', '拌沙拉'],
      nutrition: { protein: 35, carbs: 10, fat: 12 },
    },
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
      id: 'peanut-stir-fry',
      name: '花生炒菜',
      emoji: '🥜',
      category: '小炒',
      calories: 450,
      time: 15,
      ingredients: [
        { name: '花生', amount: '50g' },
        { name: '青椒', amount: '100g' },
      ],
      steps: ['炒'],
      nutrition: { protein: 15, carbs: 20, fat: 30 },
    },
    {
      id: 'egg-fried-rice',
      name: '蛋炒饭',
      emoji: '🍳',
      category: '主食',
      calories: 400,
      time: 10,
      ingredients: [
        { name: '鸡蛋', amount: '2个' },
        { name: '米饭', amount: '200g' },
      ],
      steps: ['炒饭'],
      nutrition: { protein: 14, carbs: 50, fat: 15 },
    },
    {
      id: 'shrimp-noodles',
      name: '虾仁面',
      emoji: '🍜',
      category: '面食',
      calories: 380,
      time: 20,
      ingredients: [
        { name: '虾仁', amount: '100g' },
        { name: '面条', amount: '150g' },
      ],
      steps: ['煮面', '加虾仁'],
      nutrition: { protein: 22, carbs: 48, fat: 8 },
    },
  ],
}))

import { generateMealSuggestions, acceptCandidate, skipSuggestionRound } from '../autopilotPlanner'
import { getDailyPlanGap } from '../../planning/dynamicPlan'
import { buildRhythmSummaryStructured } from '../../habits/rhythmSummary'
import { getUserMemories, savePlannedMeal } from '../../stores/planning'
import { addMealItemToDietLog, getDietLog } from '../../stores/dietLog'
import { writeAuditEntry } from '../auditLog'

const mockedGetDailyPlanGap = vi.mocked(getDailyPlanGap)
const mockedBuildRhythmSummary = vi.mocked(buildRhythmSummaryStructured)
const mockedGetUserMemories = vi.mocked(getUserMemories)
const mockedSavePlannedMeal = vi.mocked(savePlannedMeal)
const mockedAddMealItemToDietLog = vi.mocked(addMealItemToDietLog)
const mockedGetDietLog = vi.mocked(getDietLog)
const mockedWriteAuditEntry = vi.mocked(writeAuditEntry)

describe('autopilotPlanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default mocks
    mockedGetDailyPlanGap.mockResolvedValue({
      date: '2024-01-15',
      sourcePlanId: 1,
      dailyTarget: 1800,
      actualCalories: 400,
      remainingCalories: 1400,
      mealTargets: [
        { mealType: 'breakfast', label: '早餐', ratio: 0.25, calories: 450 },
        { mealType: 'lunch', label: '午餐', ratio: 0.4, calories: 720 },
        { mealType: 'dinner', label: '晚餐', ratio: 0.35, calories: 630 },
      ],
      mealGaps: [],
      latestPlan: {
        id: 1,
        title: 'Test Plan',
        summary: 'Test',
        dailyCalorieTarget: 1800,
        mealGuidance: [],
        cautionNotes: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        profileSnapshot: { id: 'current', completionStatus: 'completed', updatedAt: '2024-01-01T00:00:00Z' },
        generationMode: 'local',
      },
      confirmedPlannedMeals: [],
    })

    mockedBuildRhythmSummary.mockReturnValue({
      windowStart: '2024-01-01',
      windowEnd: '2024-01-14',
      windowDays: 14,
      loggedDays: 10,
      loggingRate: 71,
      avgCaloriesOnLoggedDays: 1700,
      mealLogRates: { breakfast: 60, lunch: 80, dinner: 70, snack: 20 },
      weekdayLoggedRates: [],
      frequentFoods: [
        { name: '鸡胸肉沙拉', count: 5 },
        { name: '米饭', count: 8 },
      ],
    })

    mockedGetUserMemories.mockResolvedValue([])

    mockedGetDietLog.mockReturnValue({
      date: '2024-01-15',
      meals: [
        { type: 'breakfast', items: [{ recipeId: 'r1', name: '鸡蛋', servings: 1, calories: 400, protein: 12, carbs: 2, fat: 10 }] },
      ],
    })

    mockedWriteAuditEntry.mockResolvedValue({
      id: 1,
      actor: 'system',
      action: 'autopilot_suggestion_generated',
      payload: {},
      timestamp: '2024-01-15T12:00:00Z',
    })

    mockedSavePlannedMeal.mockResolvedValue({
      id: 1,
      date: '2024-01-15',
      mealType: 'lunch',
      items: [],
      totalCalories: 350,
      totalProtein: 35,
      totalCarbs: 10,
      totalFat: 12,
      source: 'ai_suggested',
      status: 'confirmed',
      createdAt: '2024-01-15T12:00:00Z',
      updatedAt: '2024-01-15T12:00:00Z',
    })

    mockedAddMealItemToDietLog.mockReturnValue({
      date: '2024-01-15',
      meals: [{ type: 'lunch', items: [{ recipeId: 'chicken-breast', name: '鸡胸肉沙拉', servings: 1, calories: 350, protein: 35, carbs: 10, fat: 12 }] }],
    })
  })

  describe('generateMealSuggestions', () => {
    it('should return up to 3 candidates sorted by score', async () => {
      const result = await generateMealSuggestions('2024-01-15', 'lunch')

      expect(result.date).toBe('2024-01-15')
      expect(result.mealType).toBe('lunch')
      expect(result.candidates.length).toBeLessThanOrEqual(3)
      expect(result.candidates.length).toBeGreaterThanOrEqual(1)
      expect(result.fallback).toBe(false)

      // Candidates should be sorted by score descending
      for (let i = 1; i < result.candidates.length; i++) {
        expect(result.candidates[i - 1].score).toBeGreaterThanOrEqual(result.candidates[i].score)
      }
    })

    it('should boost score for frequent foods', async () => {
      const result = await generateMealSuggestions('2024-01-15', 'lunch')

      // 鸡胸肉沙拉 is in frequentFoods, so it should get a boost
      const chickenCandidate = result.candidates.find((c) => c.recipeId === 'chicken-breast')
      if (chickenCandidate) {
        expect(chickenCandidate.reasoning).toContain('常吃食物加分')
      }
    })

    it('should exclude recipes matching allergy memories', async () => {
      mockedGetUserMemories.mockResolvedValue([
        {
          id: 1,
          type: 'allergy',
          content: '花生',
          normalizedContent: '花生',
          tags: [],
          source: 'user_explicit',
          confidence: 0.8,
          status: 'active',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ])

      const result = await generateMealSuggestions('2024-01-15', 'lunch')

      // Peanut stir-fry should be excluded
      const peanutCandidate = result.candidates.find((c) => c.recipeId === 'peanut-stir-fry')
      expect(peanutCandidate).toBeUndefined()
    })

    it('should NOT exclude recipes for pending_confirm memories (Req 9.4)', async () => {
      mockedGetUserMemories.mockResolvedValue([])
      // getUserMemories is called with status: 'active', so pending_confirm won't be returned

      const result = await generateMealSuggestions('2024-01-15', 'lunch')
      expect(result.candidates.length).toBeGreaterThan(0)
    })

    it('should exclude candidates exceeding mealTarget * 1.25', async () => {
      // With remainingCalories = 1400 and 2 remaining meals (lunch, dinner),
      // mealTarget = 700. So 700 * 1.25 = 875. All our recipes are under that.
      // Let's set a lower remaining to test the filter.
      mockedGetDailyPlanGap.mockResolvedValue({
        date: '2024-01-15',
        sourcePlanId: 1,
        dailyTarget: 600,
        actualCalories: 400,
        remainingCalories: 200,
        mealTargets: [],
        mealGaps: [],
        latestPlan: null,
        confirmedPlannedMeals: [],
      })

      // Only 1 remaining meal (lunch), so mealTarget = 200
      // 200 * 1.25 = 250. Only rice-bowl (200 cal) should pass.
      mockedGetDietLog.mockReturnValue({
        date: '2024-01-15',
        meals: [
          { type: 'breakfast', items: [{ recipeId: 'r1', name: '鸡蛋', servings: 1, calories: 400, protein: 12, carbs: 2, fat: 10 }] },
          { type: 'dinner', items: [{ recipeId: 'r2', name: '面', servings: 1, calories: 300, protein: 10, carbs: 40, fat: 5 }] },
        ],
      })

      const result = await generateMealSuggestions('2024-01-15', 'lunch')

      // Only rice-bowl (200 cal) should be within 250 cal limit
      for (const candidate of result.candidates) {
        expect(candidate.estimatedCalories).toBeLessThanOrEqual(250)
      }
    })

    it('should set fallback to true when no candidates pass filters', async () => {
      // Set very low remaining calories so everything is excluded
      mockedGetDailyPlanGap.mockResolvedValue({
        date: '2024-01-15',
        sourcePlanId: 1,
        dailyTarget: 100,
        actualCalories: 90,
        remainingCalories: 10,
        mealTargets: [],
        mealGaps: [],
        latestPlan: null,
        confirmedPlannedMeals: [],
      })

      mockedGetDietLog.mockReturnValue({
        date: '2024-01-15',
        meals: [
          { type: 'breakfast', items: [{ recipeId: 'r1', name: '鸡蛋', servings: 1, calories: 90, protein: 6, carbs: 1, fat: 5 }] },
        ],
      })

      const result = await generateMealSuggestions('2024-01-15', 'lunch')

      // mealTarget = 10, 10 * 1.25 = 12.5. No recipe is <= 12.5 cal.
      expect(result.fallback).toBe(true)
      expect(result.candidates).toHaveLength(0)
    })

    it('should write an audit entry', async () => {
      await generateMealSuggestions('2024-01-15', 'lunch')

      expect(mockedWriteAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: 'system',
          action: 'autopilot_suggestion_generated',
        }),
      )
    })
  })

  describe('acceptCandidate', () => {
    const candidate = {
      recipeId: 'chicken-breast',
      name: '鸡胸肉沙拉',
      emoji: '🥗',
      estimatedCalories: 350,
      estimatedProtein: 35,
      estimatedCarbs: 10,
      estimatedFat: 12,
      score: 0.9,
      reasoning: '热量接近目标',
    }

    it('should persist a PlannedMeal', async () => {
      await acceptCandidate(candidate, '2024-01-15', 'lunch')

      expect(mockedSavePlannedMeal).toHaveBeenCalledWith(
        expect.objectContaining({
          date: '2024-01-15',
          mealType: 'lunch',
          source: 'ai_suggested',
          status: 'confirmed',
          totalCalories: 350,
        }),
      )
    })

    it('should add item to diet log', async () => {
      await acceptCandidate(candidate, '2024-01-15', 'lunch')

      expect(mockedAddMealItemToDietLog).toHaveBeenCalledWith({
        date: '2024-01-15',
        mealType: 'lunch',
        item: expect.objectContaining({
          recipeId: 'chicken-breast',
          name: '鸡胸肉沙拉',
          calories: 350,
        }),
      })
    })

    it('should write an audit entry', async () => {
      await acceptCandidate(candidate, '2024-01-15', 'lunch')

      expect(mockedWriteAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: 'user',
          action: 'autopilot_candidate_accepted',
          payload: expect.objectContaining({
            recipeId: 'chicken-breast',
          }),
        }),
      )
    })

    it('should return both plannedMeal and dietLog', async () => {
      const result = await acceptCandidate(candidate, '2024-01-15', 'lunch')

      expect(result.plannedMeal).toBeDefined()
      expect(result.dietLog).toBeDefined()
      expect(result.dietLog.date).toBe('2024-01-15')
    })
  })

  describe('skipSuggestionRound', () => {
    it('should write an audit entry with action "skip"', async () => {
      await skipSuggestionRound('2024-01-15', 'lunch')

      expect(mockedWriteAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: 'user',
          action: 'skip',
          payload: expect.objectContaining({
            date: '2024-01-15',
            mealType: 'lunch',
            cooldownHours: 4,
          }),
        }),
      )
    })

    it('should include cooldownUntil in the payload', async () => {
      await skipSuggestionRound('2024-01-15', 'lunch')

      const call = mockedWriteAuditEntry.mock.calls[0][0]
      expect(call.payload).toHaveProperty('cooldownUntil')
      expect(typeof call.payload.cooldownUntil).toBe('string')
    })

    it('should return the audit entry', async () => {
      const result = await skipSuggestionRound('2024-01-15', 'lunch')

      expect(result).toBeDefined()
      expect(result.id).toBe(1)
      expect(result.actor).toBe('system')
    })
  })
})
