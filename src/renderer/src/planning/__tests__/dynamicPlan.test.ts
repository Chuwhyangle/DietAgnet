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
  saveDailyPlanAdjustment: vi.fn(() => Promise.resolve({ id: 1 })),
}))

import { getDailyPlanGap } from '../dynamicPlan'
import { getLatestPersonalDietPlan } from '../../stores/planning'

describe('planning/dynamicPlan.getDailyPlanGap', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      now: new Date('2024-06-15T08:00:00Z'),
      toFake: ['Date'],
    })
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
})
