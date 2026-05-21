/**
 * Property-Based Test: Plan-Gap Arithmetic
 *
 * **Validates: Requirements 3.9**
 *
 * Property 9: For any generated (target, items) pair, the daily plan-gap
 * computation satisfies:
 *   remainingCalories = max(0, dailyTarget - actualCalories)
 *
 * When actual <= target: |remaining + actual - target| <= 0.01
 * When actual > target: remaining === 0
 *
 * This verifies the fundamental arithmetic invariant of the gap
 * calculation in `planning/dynamicPlan.ts#getDailyPlanGap`.
 */

import { describe, it, beforeEach, vi } from 'vitest'
import * as fc from 'fast-check'
import { defaultRunConfig } from '../../../../test/arbitraries/runConfig'
import { arbDietLogEntry } from '../../../../test/arbitraries/dietLog'
import type { DietLog } from '../../stores/dietLog'

// ---------------------------------------------------------------------------
// Mocks — isolate getDailyPlanGap from real stores
// ---------------------------------------------------------------------------

let mockDietLog: DietLog | null = null
let mockCalorieGoal: number = 2000

vi.mock('../../stores/dietLog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../stores/dietLog')>()
  return {
    ...actual,
    getDietLog: vi.fn(() => mockDietLog),
  }
})

vi.mock('../../stores/settings', () => ({
  getSettings: vi.fn(() => ({
    nickname: '猫猫',
    calorieGoal: mockCalorieGoal,
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
  saveDailyPlanAdjustment: vi.fn(() => Promise.resolve({ id: 1 })),
}))

import { getDailyPlanGap } from '../../planning/dynamicPlan'

// ---------------------------------------------------------------------------
// Property test
// ---------------------------------------------------------------------------

describe('Property 9: Plan-gap remaining + actual = target', () => {
  beforeEach(() => {
    mockDietLog = null
    mockCalorieGoal = 2000
  })

  it('for any (target, items) pair, |remaining + actual - target| <= 0.01 when actual <= target, and remaining === 0 when actual > target', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 100, max: 5000 }),
        arbDietLogEntry(),
        async (target, dietLog) => {
          // Set up mocks for this iteration
          mockCalorieGoal = target
          mockDietLog = dietLog

          const gap = await getDailyPlanGap(dietLog.date)

          // getDailyPlanGap returns null only when target <= 0
          // Since we generate target >= 100, gap should never be null
          if (!gap) return false

          const { dailyTarget, actualCalories, remainingCalories } = gap

          // Verify target is what we set
          if (dailyTarget !== target) return false

          // Core invariant: remaining = max(0, target - actual)
          const expectedRemaining = Math.max(0, dailyTarget - actualCalories)
          if (remainingCalories !== expectedRemaining) return false

          // The task-specified invariant:
          // When actual <= target: remaining + actual === target
          if (actualCalories <= dailyTarget) {
            return Math.abs(remainingCalories + actualCalories - dailyTarget) <= 0.01
          }

          // When actual > target: remaining is clamped to 0
          return remainingCalories === 0
        },
      ),
      { ...defaultRunConfig() },
    )
  })
})
