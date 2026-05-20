/**
 * Example tests for `stores/dietLog.ts` (task 4.13, Requirements
 * 2.5, 2.7, 2.8).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import {
  createEmptyDietLog,
  getDietLog,
  getTodayLog,
  saveDietLog,
  addMealItemToDietLog,
  removeMealItemFromDietLog,
  summarizeDietLog,
  getLogsForRange,
  getAllDietLogs,
  getWeekBounds,
  createMealItemFromRecipe,
} from '../dietLog'

const LOG_PREFIX = 'diet-agent-log-'

describe('stores/dietLog', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      now: new Date('2024-06-15T08:00:00Z'),
      toFake: ['Date'],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('read paths', () => {
    it('createEmptyDietLog returns an empty meals list for the given date', () => {
      expect(createEmptyDietLog('2024-06-15')).toEqual({
        date: '2024-06-15',
        meals: [],
      })
    })

    it('getDietLog returns null when no entry exists', () => {
      expect(getDietLog('2024-06-15')).toBeNull()
    })

    it('getDietLog returns the parsed log when present', () => {
      const log = createEmptyDietLog('2024-06-15')
      localStorage.setItem(`${LOG_PREFIX}2024-06-15`, JSON.stringify(log))
      expect(getDietLog('2024-06-15')).toEqual(log)
    })

    it('getTodayLog uses the current date', () => {
      const log = createEmptyDietLog('2024-06-15')
      localStorage.setItem(`${LOG_PREFIX}2024-06-15`, JSON.stringify(log))
      expect(getTodayLog()).toEqual(log)
    })
  })

  describe('write paths', () => {
    it('saveDietLog persists under the keyed prefix', () => {
      saveDietLog({ date: '2024-06-15', meals: [] })
      expect(
        JSON.parse(localStorage.getItem(`${LOG_PREFIX}2024-06-15`)!),
      ).toEqual({ date: '2024-06-15', meals: [] })
    })

    it('addMealItemToDietLog adds a new meal when the type is missing', () => {
      const item = createMealItemFromRecipe(
        {
          id: 'r-1',
          name: '番茄炒蛋',
          emoji: '🍳',
          category: '家常菜',
          calories: 400,
          time: 10,
          ingredients: [{ name: '鸡蛋', amount: '2 个' }],
          steps: ['炒'],
          nutrition: { protein: 25, carbs: 40, fat: 16 },
        },
        1,
      )
      const updated = addMealItemToDietLog({
        date: '2024-06-15',
        mealType: 'lunch',
        item,
      })
      expect(updated.meals).toHaveLength(1)
      expect(updated.meals[0].type).toBe('lunch')
      expect(updated.meals[0].items).toHaveLength(1)
      expect(getDietLog('2024-06-15')?.meals[0].items[0].name).toBe('番茄炒蛋')
    })

    it('removeMealItemFromDietLog removes the targeted item and returns null when the log becomes empty', () => {
      const item = createMealItemFromRecipe(
        {
          id: 'r-1',
          name: '番茄炒蛋',
          emoji: '🍳',
          category: '家常菜',
          calories: 400,
          time: 10,
          ingredients: [{ name: '鸡蛋', amount: '2 个' }],
          steps: ['炒'],
          nutrition: { protein: 25, carbs: 40, fat: 16 },
        },
        1,
      )
      addMealItemToDietLog({
        date: '2024-06-15',
        mealType: 'lunch',
        item,
      })
      const after = removeMealItemFromDietLog({
        date: '2024-06-15',
        mealType: 'lunch',
        itemIndex: 0,
      })
      // Removing the only item drops the meal entry and the entire log.
      expect(after).toBeNull()
      expect(getDietLog('2024-06-15')).toBeNull()
    })
  })

  describe('summary', () => {
    it('summarizeDietLog returns zeros for null', () => {
      expect(summarizeDietLog(null)).toEqual({
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        mealCount: 0,
        itemCount: 0,
      })
    })

    it('summarizeDietLog totals meals + items', () => {
      const summary = summarizeDietLog({
        date: '2024-06-15',
        meals: [
          {
            type: 'lunch',
            items: [
              {
                recipeId: 'r-1',
                name: 'a',
                servings: 1,
                calories: 100,
                protein: 5,
                carbs: 10,
                fat: 2,
              },
            ],
          },
        ],
      })
      expect(summary.calories).toBe(100)
      expect(summary.itemCount).toBe(1)
      expect(summary.mealCount).toBe(1)
    })
  })

  describe('range / week helpers', () => {
    it('getLogsForRange returns logs sorted by ascending date', () => {
      saveDietLog({ date: '2024-06-13', meals: [] })
      saveDietLog({ date: '2024-06-15', meals: [] })
      const range = getLogsForRange('2024-06-12', '2024-06-15')
      expect(range.map((log) => log.date)).toEqual(['2024-06-13', '2024-06-15'])
    })

    it('getAllDietLogs returns every persisted log', () => {
      saveDietLog({ date: '2024-06-15', meals: [] })
      saveDietLog({ date: '2024-06-14', meals: [] })
      const all = getAllDietLogs()
      expect(all.map((log) => log.date).sort()).toEqual([
        '2024-06-14',
        '2024-06-15',
      ])
    })

    it('getWeekBounds spans Monday through Sunday', () => {
      const bounds = getWeekBounds('2024-06-15') // Saturday
      // Monday = 2024-06-10, Sunday = 2024-06-16.
      expect(bounds).toEqual({ startDate: '2024-06-10', endDate: '2024-06-16' })
    })
  })
})
