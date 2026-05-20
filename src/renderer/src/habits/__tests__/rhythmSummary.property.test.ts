/**
 * Property 7: Rhythm summary idempotence and add/remove round-trip
 *
 * Invariant 1: calling `buildRhythmSummaryStructured` twice on the same
 * localStorage state yields deeply equal output (determinism/stability).
 *
 * Invariant 2: seeding localStorage with a set of DietLog entries, adding
 * a single entry, then removing it again yields a summary equal to the
 * original (add-then-remove is a no-op).
 *
 * **Validates: Requirement 3.7**
 */

import * as fc from 'fast-check'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { buildRhythmSummaryStructured } from '../rhythmSummary'
import type { DietLog, MealType } from '../../stores/dietLog'
import { arbDietLogEntry } from '../../../../test/arbitraries/dietLog'
import { defaultRunConfig } from '../../../../test/arbitraries/runConfig'

const LOG_PREFIX = 'diet-agent-log-'

function seedLog(log: DietLog): void {
  localStorage.setItem(`${LOG_PREFIX}${log.date}`, JSON.stringify(log))
}

function removeLog(date: string): void {
  localStorage.removeItem(`${LOG_PREFIX}${date}`)
}

/**
 * Generate a date within the 14-day lookback window relative to the
 * fake clock (2024-06-15). Window is 2024-06-02 through 2024-06-15.
 */
const dateInWindowArb = fc
  .integer({ min: 0, max: 13 })
  .map((offset) => {
    const base = new Date('2024-06-02T00:00:00Z')
    base.setUTCDate(base.getUTCDate() + offset)
    return base.toISOString().slice(0, 10)
  })

const mealTypeArb: fc.Arbitrary<MealType> = fc.constantFrom(
  'breakfast',
  'lunch',
  'dinner',
  'snack',
)

/**
 * Generate a single MealItem with realistic values.
 */
const mealItemArb = fc.record({
  recipeId: fc.string({ minLength: 1, maxLength: 8 }).map((s) => `r-${s}`),
  name: fc.string({ minLength: 1, maxLength: 16 }).filter((s) => s.trim().length > 0),
  servings: fc.integer({ min: 1, max: 3 }),
  calories: fc.integer({ min: 50, max: 800 }),
  protein: fc.integer({ min: 0, max: 50 }),
  carbs: fc.integer({ min: 0, max: 100 }),
  fat: fc.integer({ min: 0, max: 40 }),
})

/**
 * Generate a DietLog entry pinned to a date within the lookback window.
 */
const dietLogInWindowArb: fc.Arbitrary<DietLog> = fc
  .record({
    date: dateInWindowArb,
    meals: fc.array(
      fc.record({
        type: mealTypeArb,
        items: fc.array(mealItemArb, { minLength: 1, maxLength: 3 }),
      }),
      { minLength: 1, maxLength: 4 },
    ),
  })
  .map((raw) => {
    // De-duplicate meal types (production invariant)
    const byType = new Map<MealType, typeof raw.meals[0]['items']>()
    for (const meal of raw.meals) {
      const existing = byType.get(meal.type) ?? []
      byType.set(meal.type, [...existing, ...meal.items])
    }
    return {
      date: raw.date,
      meals: Array.from(byType.entries()).map(([type, items]) => ({ type, items })),
    }
  })

describe('Property 7: Rhythm summary idempotence and add/remove round-trip', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      now: new Date('2024-06-15T08:00:00Z'),
      toFake: ['Date'],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('calling buildRhythmSummaryStructured twice yields equal output (determinism)', async () => {
    /**
     * Validates: Requirement 3.7
     *
     * summary(input) === summary(input) — running the function twice
     * on the same localStorage state produces deeply equal results.
     */
    await fc.assert(
      fc.asyncProperty(
        fc.array(dietLogInWindowArb, { minLength: 0, maxLength: 5 }),
        async (logs) => {
          // Seed localStorage with generated logs (de-dup by date)
          const byDate = new Map<string, DietLog>()
          for (const log of logs) {
            byDate.set(log.date, log)
          }
          for (const log of byDate.values()) {
            seedLog(log)
          }

          const first = buildRhythmSummaryStructured(14)
          const second = buildRhythmSummaryStructured(14)

          expect(first).toEqual(second)

          // Clean up for next iteration
          for (const date of byDate.keys()) {
            removeLog(date)
          }
        },
      ),
      defaultRunConfig(),
    )
  })

  it('adding then removing a single entry yields equal summary (round-trip)', async () => {
    /**
     * Validates: Requirement 3.7
     *
     * summary(input + entry - entry) ≅ summary(input) — adding a
     * single DietLog entry and then removing it is a no-op on the
     * summary output.
     */
    await fc.assert(
      fc.asyncProperty(
        fc.array(dietLogInWindowArb, { minLength: 0, maxLength: 4 }),
        dietLogInWindowArb,
        async (baseLogs, extraLog) => {
          // Seed base logs (de-dup by date)
          const byDate = new Map<string, DietLog>()
          for (const log of baseLogs) {
            byDate.set(log.date, log)
          }

          // Ensure the extra log uses a date NOT already in the base set
          // so that adding/removing it is a clean round-trip.
          fc.pre(!byDate.has(extraLog.date))

          for (const log of byDate.values()) {
            seedLog(log)
          }

          // Capture the summary before adding the extra entry
          const summaryBefore = buildRhythmSummaryStructured(14)

          // Add the extra entry
          seedLog(extraLog)

          // Remove the extra entry
          removeLog(extraLog.date)

          // Capture the summary after the add+remove round-trip
          const summaryAfter = buildRhythmSummaryStructured(14)

          expect(summaryAfter).toEqual(summaryBefore)

          // Clean up for next iteration
          for (const date of byDate.keys()) {
            removeLog(date)
          }
        },
      ),
      defaultRunConfig(),
    )
  })
})
