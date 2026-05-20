/**
 * Property-Based Test: Plan Immutability Invariant
 *
 * **Validates: Requirements 7.2, 10.4**
 *
 * Property 4: For any PersonalDietPlan row with status = 'accepted' (or status undefined,
 * which implies accepted), when the Plan Drift Monitor persists a new proposal, the existing
 * row's id, dailyCalorieTarget, profileSnapshot, title, summary, and all other fields SHALL
 * remain unchanged. The proposal SHALL always be inserted as a new row with a distinct
 * auto-incremented id.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { defaultRunConfig } from '../../../../test/arbitraries/runConfig'
import dayjs from 'dayjs'

// In-memory plan store for the mock
const mockPlans: any[] = []

vi.mock('../../stores/planning', () => ({
  planningDb: {
    plans: {
      orderBy: vi.fn(() => ({
        reverse: vi.fn(() => ({
          toArray: vi.fn(async () =>
            [...mockPlans].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
          ),
        })),
      })),
      toArray: vi.fn(async () => [...mockPlans]),
      add: vi.fn(async (plan: any) => {
        const id = mockPlans.length + 100
        mockPlans.push({ ...plan, id })
        return id
      }),
      get: vi.fn(async (id: number) => mockPlans.find((p) => p.id === id) ?? undefined),
      put: vi.fn(async (plan: any) => {
        const idx = mockPlans.findIndex((p) => p.id === plan.id)
        if (idx >= 0) {
          mockPlans[idx] = { ...plan }
        }
      }),
    },
  },
}))

// Mock diet logs â€?will be configured per test run
const mockDietLogs: Record<string, any> = {}

vi.mock('../../stores/dietLog', () => ({
  getDietLog: vi.fn((date: string) => mockDietLogs[date] ?? null),
  summarizeDietLog: vi.fn((log: any) => {
    if (!log || !log.meals) {
      return { calories: 0, protein: 0, carbs: 0, fat: 0, mealCount: 0, itemCount: 0 }
    }
    let calories = 0
    let itemCount = 0
    for (const meal of log.meals) {
      for (const item of meal.items) {
        calories += item.calories
        itemCount++
      }
    }
    return { calories, protein: 0, carbs: 0, fat: 0, mealCount: log.meals.length, itemCount }
  }),
}))

// Mock audit log
vi.mock('../auditLog', () => ({
  writeAuditEntry: vi.fn(async (entry: any) => ({
    id: 1,
    ...entry,
    timestamp: new Date().toISOString(),
  })),
}))

import { checkPlanDrift } from '../planDriftMonitor'

/**
 * Arbitrary generator for a valid accepted plan with varying dailyCalorieTarget.
 * Generates targets between 1200 and 4000 kcal (realistic range).
 */
const acceptedPlanArb = fc.record({
  dailyCalorieTarget: fc.integer({ min: 1200, max: 4000 }),
  title: fc.string({ minLength: 1, maxLength: 50 }),
  summary: fc.string({ minLength: 1, maxLength: 100 }),
  proteinTarget: fc.integer({ min: 30, max: 300 }),
  carbsTarget: fc.integer({ min: 50, max: 500 }),
  fatTarget: fc.integer({ min: 20, max: 200 }),
  mealGuidance: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 0, maxLength: 3 }),
  cautionNotes: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 0, maxLength: 3 }),
})

/**
 * Given a calorie target, generate a drift multiplier that ensures â‰?5% drift.
 * We generate a multiplier in [1.16, 1.50] for "over" drift.
 */
const driftMultiplierArb = fc.double({ min: 1.16, max: 1.50, noNaN: true })

function resetMockState(): void {
  mockPlans.length = 0
  Object.keys(mockDietLogs).forEach((key) => delete mockDietLogs[key])
}

describe('Property 4: Plan Immutability Invariant', () => {
  beforeEach(() => {
    resetMockState()
    vi.clearAllMocks()
  })

  it('original accepted plan fields remain unchanged after checkPlanDrift produces a proposal', async () => {
    await fc.assert(
      fc.asyncProperty(
        acceptedPlanArb,
        driftMultiplierArb,
        driftMultiplierArb,
        driftMultiplierArb,
        async (planFields, mult1, mult2, mult3) => {
          // Reset state for each iteration
          resetMockState()

          // Create the accepted plan
          const acceptedPlan = {
            id: 1,
            title: planFields.title,
            summary: planFields.summary,
            dailyCalorieTarget: planFields.dailyCalorieTarget,
            proteinTarget: planFields.proteinTarget,
            carbsTarget: planFields.carbsTarget,
            fatTarget: planFields.fatTarget,
            mealGuidance: [...planFields.mealGuidance],
            cautionNotes: [...planFields.cautionNotes],
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
            profileSnapshot: {
              id: 'current' as const,
              completionStatus: 'completed' as const,
              updatedAt: '2024-01-01T00:00:00.000Z',
            },
            generationMode: 'local' as const,
            status: undefined,
          }

          mockPlans.push(acceptedPlan)

          // Take a deep copy/snapshot of the original plan BEFORE calling checkPlanDrift
          const originalSnapshot = JSON.parse(JSON.stringify(acceptedPlan))

          // Generate diet logs for the last 3 days that drift by â‰?5% (over)
          const target = planFields.dailyCalorieTarget
          const now = dayjs('2024-03-10')

          const day1Calories = Math.round(target * mult1)
          const day2Calories = Math.round(target * mult2)
          const day3Calories = Math.round(target * mult3)

          mockDietLogs['2024-03-09'] = {
            date: '2024-03-09',
            meals: [{ type: 'lunch', items: [{ recipeId: 'r1', name: 'Food', servings: 1, calories: day1Calories, protein: 50, carbs: 60, fat: 30 }] }],
          }
          mockDietLogs['2024-03-08'] = {
            date: '2024-03-08',
            meals: [{ type: 'lunch', items: [{ recipeId: 'r1', name: 'Food', servings: 1, calories: day2Calories, protein: 50, carbs: 60, fat: 30 }] }],
          }
          mockDietLogs['2024-03-07'] = {
            date: '2024-03-07',
            meals: [{ type: 'lunch', items: [{ recipeId: 'r1', name: 'Food', servings: 1, calories: day3Calories, protein: 50, carbs: 60, fat: 30 }] }],
          }

          // Call checkPlanDrift â€?should produce a proposal
          const result = await checkPlanDrift(now)

          // The result should be a proposal (drift â‰?5% on all 3 days)
          expect(result).not.toBeNull()

          // INVARIANT: The original plan row in the store must be UNCHANGED
          const originalPlanInStore = mockPlans.find((p) => p.id === 1)

          expect(originalPlanInStore.id).toBe(originalSnapshot.id)
          expect(originalPlanInStore.title).toBe(originalSnapshot.title)
          expect(originalPlanInStore.summary).toBe(originalSnapshot.summary)
          expect(originalPlanInStore.dailyCalorieTarget).toBe(originalSnapshot.dailyCalorieTarget)
          expect(originalPlanInStore.proteinTarget).toBe(originalSnapshot.proteinTarget)
          expect(originalPlanInStore.carbsTarget).toBe(originalSnapshot.carbsTarget)
          expect(originalPlanInStore.fatTarget).toBe(originalSnapshot.fatTarget)
          expect(originalPlanInStore.mealGuidance).toEqual(originalSnapshot.mealGuidance)
          expect(originalPlanInStore.cautionNotes).toEqual(originalSnapshot.cautionNotes)
          expect(originalPlanInStore.createdAt).toBe(originalSnapshot.createdAt)
          expect(originalPlanInStore.updatedAt).toBe(originalSnapshot.updatedAt)
          expect(originalPlanInStore.profileSnapshot).toEqual(originalSnapshot.profileSnapshot)
          expect(originalPlanInStore.generationMode).toBe(originalSnapshot.generationMode)
          expect(originalPlanInStore.status).toBe(originalSnapshot.status)

          // INVARIANT: The proposal is a NEW row with a DIFFERENT id
          const proposalInStore = mockPlans.find((p) => p.id !== 1 && p.status === 'proposed')
          expect(proposalInStore).toBeDefined()
          expect(proposalInStore.id).not.toBe(originalSnapshot.id)
          expect(proposalInStore.sourcePlanId).toBe(originalSnapshot.id)
        },
      ),
      { ...defaultRunConfig() },
    )
  })
})
