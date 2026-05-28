/**
 * Example tests for `planning/dynamicPlan.ts` (task 4.11,
 * Requirement 2.4).
 *
 * `dynamicPlan.ts` evaluates the daily plan-vs-actual gap and
 * proposes a per-meal supplement / reduce / maintain suggestion.
 * The module reads from the diet log store, the settings store,
 * the planning store, and `dayjs()`.
 *
 * The shared `setup.ts` clears `localStorage` between tests, but the
 * planning store reads/writes Dexie. We exercise the happy paths via
 * `getDailyPlanGap` only — the persistence path is covered by
 * `evaluateDailyPlanAdjustment` mocking is too involved for an
 * example test; we keep this scope narrow.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('../../stores/settings', () => ({
  getSettings: vi.fn(() => ({
    nickname: '猫猫',
    calorieGoal: 2000,
    language: 'en',
    reminders: {
      enabled: true,
      mealReminders: true,
      planAdjustmentReminders: true,
      weeklyReportReminders: false,
      postLogGapSummaryInChat: true,
      postLogGapDesktopNotify: false,
      quietStartHour: 23,
      quietEndHour: 7,
      cooldownHours: 4,
    },
    agent: {},
    usagePricing: {},
  })),
}))

vi.mock('../../stores/planning', () => ({
  getLatestPersonalDietPlan: vi.fn(() => Promise.resolve(null)),
  getConfirmedPlannedMealsForDate: vi.fn(() => Promise.resolve([])),
  getCurrentPlanningProfile: vi.fn(() => Promise.resolve(null)),
  getUserMemories: vi.fn(() => Promise.resolve([])),
  saveDailyPlanAdjustment: vi.fn((input) => Promise.resolve({
    id: 1,
    ...input,
    createdAt: '2024-06-15T08:00:00.000Z',
    updatedAt: '2024-06-15T08:00:00.000Z',
  })),
}))

import { buildDynamicPlanSuggestion, evaluateDailyPlanAdjustment, getDailyPlanGap } from '../dynamicPlan'
import {
  getConfirmedPlannedMealsForDate,
  getCurrentPlanningProfile,
  getLatestPersonalDietPlan,
  getUserMemories,
  saveDailyPlanAdjustment,
} from '../../stores/planning'

function seedLunchLog(date: string, calories: number): void {
  localStorage.setItem(`diet-agent-log-${date}`, JSON.stringify({
    date,
    meals: [
      {
        type: 'lunch',
        items: [
          {
            recipeId: `test-${calories}`,
            name: '测试午餐',
            servings: 1,
            calories,
            protein: 20,
            carbs: 40,
            fat: 10,
          },
        ],
      },
    ],
  }))
}

function mockLunchPlan(calories = 800): void {
  vi.mocked(getConfirmedPlannedMealsForDate).mockResolvedValueOnce([
    {
      id: 10,
      date: '2024-06-15',
      mealType: 'lunch',
      items: [],
      totalCalories: calories,
      totalProtein: 30,
      totalCarbs: 80,
      totalFat: 20,
      source: 'manual',
      status: 'confirmed',
      createdAt: '2024-06-15T00:00:00.000Z',
      updatedAt: '2024-06-15T00:00:00.000Z',
    },
  ])
}

describe('planning/dynamicPlan.getDailyPlanGap', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      now: new Date('2024-06-15T08:00:00Z'),
      toFake: ['Date'],
    })
    vi.clearAllMocks()
    vi.mocked(getLatestPersonalDietPlan).mockResolvedValue(null)
    vi.mocked(getConfirmedPlannedMealsForDate).mockResolvedValue([])
    vi.mocked(getCurrentPlanningProfile).mockResolvedValue(null)
    vi.mocked(getUserMemories).mockResolvedValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns null when no plan exists and no settings calorieGoal is set', async () => {
    vi.mocked(getLatestPersonalDietPlan).mockResolvedValueOnce(null)
    // The default mock returns calorieGoal: 2000, so we need a settings
    // override that drops it.
    const { getSettings } = await import('../../stores/settings')
    vi.mocked(getSettings).mockReturnValueOnce({
      nickname: '猫猫',
      reminders: {} as never,
      agent: {} as never,
      usagePricing: {},
      calorieGoal: undefined,
    } as never)

    const gap = await getDailyPlanGap('2024-06-15')
    expect(gap).toBeNull()
  })

  it('returns a gap with dailyTarget = settings.calorieGoal when no plan exists', async () => {
    vi.mocked(getLatestPersonalDietPlan).mockResolvedValueOnce(null)
    const gap = await getDailyPlanGap('2024-06-15')
    expect(gap).not.toBeNull()
    expect(gap?.dailyTarget).toBe(2000)
    // No diet log seeded → actualCalories = 0, so remaining equals target.
    expect(gap?.actualCalories).toBe(0)
    expect(gap?.remainingCalories).toBe(2000)
    expect(gap?.mealTargets.length).toBeGreaterThan(0)
  })

  it('uses the plan target when a plan is available', async () => {
    vi.mocked(getLatestPersonalDietPlan).mockResolvedValueOnce({
      id: 1,
      title: '减脂计划',
      summary: '',
      dailyCalorieTarget: 1700,
      proteinTarget: 100,
      carbsTarget: 200,
      fatTarget: 50,
      mealGuidance: [],
      cautionNotes: [],
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
      profileSnapshot: {
        id: 'current',
        completionStatus: 'completed',
        updatedAt: '2024-01-01',
      },
      generationMode: 'local',
      status: 'accepted',
    } as never)

    const gap = await getDailyPlanGap('2024-06-15')
    expect(gap?.dailyTarget).toBe(1700)
    expect(gap?.sourcePlanId).toBe(1)
  })

  it('returns supplement when lunch actual is clearly below the 800 kcal plan', async () => {
    mockLunchPlan(800)
    seedLunchLog('2024-06-15', 400)

    const gap = await getDailyPlanGap('2024-06-15')
    expect(gap).not.toBeNull()
    const suggestion = buildDynamicPlanSuggestion(gap!, 'lunch')

    expect(suggestion?.suggestionType).toBe('supplement')
    expect(suggestion?.plannedCalories).toBe(800)
    expect(suggestion?.actualCalories).toBe(400)
    expect(suggestion?.deltaCalories).toBe(400)
  })

  it('returns reduce when lunch actual is clearly above the 800 kcal plan', async () => {
    mockLunchPlan(800)
    seedLunchLog('2024-06-15', 1200)

    const gap = await getDailyPlanGap('2024-06-15')
    const suggestion = buildDynamicPlanSuggestion(gap!, 'lunch')

    expect(suggestion?.suggestionType).toBe('reduce')
    expect(suggestion?.plannedCalories).toBe(800)
    expect(suggestion?.actualCalories).toBe(1200)
    expect(suggestion?.deltaCalories).toBe(-400)
    expect(suggestion?.suggestionText).not.toMatch(/跳过下一餐|完全不吃|极端节食|不吃饭/)
  })

  it('returns maintain for a lunch close to plan and can persist the low-noise audit suggestion', async () => {
    mockLunchPlan(800)
    seedLunchLog('2024-06-15', 760)

    const result = await evaluateDailyPlanAdjustment({
      date: '2024-06-15',
      mealType: 'lunch',
      persist: true,
      generatedBy: 'local_rule',
    })

    expect(result.suggestion?.suggestionType).toBe('maintain')
    expect(result.savedAdjustment?.suggestionType).toBe('maintain')
    expect(saveDailyPlanAdjustment).toHaveBeenCalled()
  })

  it('avoids prioritizing dairy when memory says the user is lactose intolerant', async () => {
    mockLunchPlan(800)
    seedLunchLog('2024-06-15', 400)
    vi.mocked(getUserMemories).mockResolvedValueOnce([
      {
        id: 1,
        type: 'avoidance',
        content: '我乳糖不耐受，不喝牛奶',
        normalizedContent: '乳糖不耐受 不喝牛奶',
        tags: ['乳糖', '牛奶'],
        source: 'user_explicit',
        confidence: 0.95,
        status: 'active',
        createdAt: '2024-06-01T00:00:00.000Z',
        updatedAt: '2024-06-01T00:00:00.000Z',
        mergedFromIds: [],
      },
    ])

    const gap = await getDailyPlanGap('2024-06-15')
    const suggestion = buildDynamicPlanSuggestion(gap!, 'lunch')

    expect(suggestion?.suggestionText).toContain('soy foods')
    expect(suggestion?.suggestionText).not.toContain('unsweetened yogurt')
    expect(buildDynamicPlanSuggestion(gap!, 'lunch', 'zh')?.suggestionText).toContain('豆制品')
    expect(buildDynamicPlanSuggestion(gap!, 'lunch', 'zh')?.suggestionText).not.toContain('无糖酸奶')
    expect(gap?.safetyContext.avoidDairy).toBe(true)
  })

  it('uses conservative safety wording for BMI-low or medical-note contexts', async () => {
    mockLunchPlan(800)
    seedLunchLog('2024-06-15', 400)
    vi.mocked(getCurrentPlanningProfile).mockResolvedValueOnce({
      id: 'current',
      age: 16,
      heightCm: 170,
      weightKg: 48,
      medicalNotes: '医生建议保守调整',
      completionStatus: 'completed',
      updatedAt: '2024-06-01T00:00:00.000Z',
    })

    const gap = await getDailyPlanGap('2024-06-15')
    const suggestion = buildDynamicPlanSuggestion(gap!, 'lunch')

    expect(gap?.safetyContext.conservative).toBe(true)
    expect(suggestion?.suggestionText).toContain('follow professional guidance first')
    expect(buildDynamicPlanSuggestion(gap!, 'lunch', 'zh')?.suggestionText).toContain('请先按专业意见执行')
    expect(suggestion?.suggestionText).not.toMatch(/跳过下一餐|完全不吃|极端节食/)
  })
})
