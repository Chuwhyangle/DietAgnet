/**
 * Example tests for `habits/rhythmSummary.ts` (task 4.8, Requirements
 * 2.4, 2.6).
 *
 * `buildRhythmSummaryStructured(lookbackDays?)` reads `dietLog` rows
 * from `localStorage` and returns a structured report covering:
 *   - logging rate over the last `lookbackDays` days (default 14)
 *   - average calories on logged days
 *   - per-meal log rates (breakfast/lunch/dinner/snack)
 *   - per-weekday log rates
 *   - top-5 most frequent foods
 *
 * The function reads `dayjs()` for `now`, so we drive time through
 * `vi.useFakeTimers({ now, toFake: ['Date'] })` (Req 2.6).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import {
  buildRhythmSummaryStructured,
  formatRhythmSummaryForPrompt,
} from '../rhythmSummary'
import type { DietLog } from '../../stores/dietLog'

const LOG_PREFIX = 'diet-agent-log-'

function seed(log: DietLog): void {
  localStorage.setItem(`${LOG_PREFIX}${log.date}`, JSON.stringify(log))
}

function makeLog(date: string, items: Array<{ name: string; meal?: 'breakfast' | 'lunch' | 'dinner' | 'snack' }>): DietLog {
  // One meal per supplied item, defaulting to lunch.
  return {
    date,
    meals: items.map((entry) => ({
      type: entry.meal ?? 'lunch',
      items: [
        {
          recipeId: `r-${entry.name}`,
          name: entry.name,
          servings: 1,
          calories: 400,
          protein: 25,
          carbs: 40,
          fat: 16,
        },
      ],
    })),
  }
}

describe('habits/rhythmSummary', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      now: new Date('2024-06-15T08:00:00Z'),
      toFake: ['Date'],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('buildRhythmSummaryStructured', () => {
    it('returns a zero-filled report when no logs are seeded', () => {
      const report = buildRhythmSummaryStructured(14)
      expect(report.windowDays).toBe(14)
      expect(report.loggedDays).toBe(0)
      expect(report.loggingRate).toBe(0)
      expect(report.avgCaloriesOnLoggedDays).toBe(0)
      expect(report.mealLogRates).toEqual({
        breakfast: 0,
        lunch: 0,
        dinner: 0,
        snack: 0,
      })
      expect(report.frequentFoods).toEqual([])
    })

    it('counts a single seeded day in the lookback window', () => {
      seed(makeLog('2024-06-14', [{ name: '番茄炒蛋', meal: 'lunch' }]))
      const report = buildRhythmSummaryStructured(14)
      expect(report.loggedDays).toBe(1)
      expect(report.loggingRate).toBe(Math.round((1 / 14) * 100))
      expect(report.avgCaloriesOnLoggedDays).toBe(400)
      expect(report.mealLogRates.lunch).toBe(Math.round((1 / 14) * 100))
      expect(report.frequentFoods).toEqual([{ name: '番茄炒蛋', count: 1 }])
    })

    it('counts each meal type independently across multiple days', () => {
      seed(makeLog('2024-06-14', [{ name: '燕麦', meal: 'breakfast' }]))
      seed(makeLog('2024-06-13', [{ name: '燕麦', meal: 'breakfast' }]))
      seed(makeLog('2024-06-12', [{ name: '便当', meal: 'lunch' }]))
      const report = buildRhythmSummaryStructured(14)
      expect(report.loggedDays).toBe(3)
      // breakfast on 2 days out of 14 = 14%
      expect(report.mealLogRates.breakfast).toBe(Math.round((2 / 14) * 100))
      expect(report.mealLogRates.lunch).toBe(Math.round((1 / 14) * 100))
      // 燕麦 appears twice, 便当 once → frequentFoods sorted desc.
      expect(report.frequentFoods).toEqual([
        { name: '燕麦', count: 2 },
        { name: '便当', count: 1 },
      ])
    })

    it('ignores logs outside the lookback window', () => {
      seed(makeLog('2024-05-01', [{ name: '太久之前' }])) // > 14 days ago
      const report = buildRhythmSummaryStructured(14)
      expect(report.loggedDays).toBe(0)
    })

    it('honors a custom lookbackDays value', () => {
      seed(makeLog('2024-06-10', [{ name: '便当' }]))
      const sevenDay = buildRhythmSummaryStructured(7)
      const fourteenDay = buildRhythmSummaryStructured(14)
      // Within 7 days back from 6/15: 6/9..6/15 — 6/10 is included.
      expect(fourteenDay.loggedDays).toBe(1)
      expect(sevenDay.loggedDays).toBe(1)
      expect(sevenDay.windowDays).toBe(7)
    })
  })

  describe('formatRhythmSummaryForPrompt', () => {
    it('emits the empty-window template when no logged days exist', () => {
      const text = formatRhythmSummaryForPrompt(
        buildRhythmSummaryStructured(14),
      )
      expect(text).toContain('几乎没有有效饮食条目')
      expect(text).toContain('近期记录节奏')
    })

    it('emits per-meal rates and frequent foods when data exists', () => {
      seed(makeLog('2024-06-14', [{ name: '燕麦', meal: 'breakfast' }]))
      seed(makeLog('2024-06-13', [{ name: '燕麦', meal: 'breakfast' }]))
      const text = formatRhythmSummaryForPrompt(
        buildRhythmSummaryStructured(14),
      )
      expect(text).toContain('早餐有记录的天数占比')
      expect(text).toContain('燕麦×2')
    })
  })
})
