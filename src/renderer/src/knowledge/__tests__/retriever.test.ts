/**
 * Example tests for `knowledge/retriever.ts` (task 4.9, Requirement 2.4).
 *
 * The retriever wraps the seeded `knowledgeRecords` array. We don't
 * mock the data: it ships with the renderer and the public API only
 * promises top-k correctness over that seeded corpus.
 */

import { describe, it, expect } from 'vitest'

import {
  searchKnowledgeBase,
  lookupFoodNutrition,
  findFoodsByCriteria,
  getGuidelineAdvice,
} from '../retriever'

describe('knowledge/retriever', () => {
  describe('searchKnowledgeBase', () => {
    it('returns an empty array for an empty query', () => {
      expect(searchKnowledgeBase('')).toEqual([])
      expect(searchKnowledgeBase('   ')).toEqual([])
    })

    it('returns at most `limit` results, default 6, capped at 20', () => {
      const six = searchKnowledgeBase('饮食')
      expect(six.length).toBeLessThanOrEqual(6)

      const oneOnly = searchKnowledgeBase('饮食', 1)
      expect(oneOnly.length).toBeLessThanOrEqual(1)

      const ceiling = searchKnowledgeBase('饮食', 1000)
      expect(ceiling.length).toBeLessThanOrEqual(20)
    })

    it('returns deterministic results for the same query', () => {
      const a = searchKnowledgeBase('燕麦')
      const b = searchKnowledgeBase('燕麦')
      expect(a).toEqual(b)
    })
  })

  describe('lookupFoodNutrition', () => {
    it('returns a food record when the name matches a seeded title or alias', () => {
      const record = lookupFoodNutrition('米饭')
      expect(record).not.toBeNull()
      expect(record?.type).toBe('food_nutrition')
    })

    it('returns null for an obviously unknown food', () => {
      // Use a pure-ASCII gibberish string that can't contain any seeded
      // single-char Chinese alias (the retriever's alias matcher is
      // bidirectional `includes`, so anything sharing a Chinese char
      // with the seeded data could match accidentally).
      expect(lookupFoodNutrition('zzz-totally-unknown-food-xyz')).toBeNull()
    })
  })

  describe('findFoodsByCriteria', () => {
    it('filters by maxCalories', () => {
      const results = findFoodsByCriteria({ maxCalories: 130 })
      for (const record of results) {
        expect(record.facts?.calories).toBeLessThanOrEqual(130)
      }
    })

    it('filters by minProtein and sorts protein descending', () => {
      const results = findFoodsByCriteria({ minProtein: 5 })
      for (const record of results) {
        expect(record.facts?.protein).toBeGreaterThanOrEqual(5)
      }
      // Sorted by protein desc.
      for (let i = 1; i < results.length; i += 1) {
        expect(results[i - 1].facts?.protein ?? 0).toBeGreaterThanOrEqual(
          results[i].facts?.protein ?? 0,
        )
      }
    })

    it('respects the limit option (clamped to [1, 20])', () => {
      expect(findFoodsByCriteria({ minProtein: 0, limit: 1 }).length)
        .toBeLessThanOrEqual(1)
    })
  })

  describe('getGuidelineAdvice', () => {
    it('only returns guideline / cooking_tip records', () => {
      const records = getGuidelineAdvice('饮食')
      for (const record of records) {
        expect(['guideline', 'cooking_tip']).toContain(record.type)
      }
    })
  })
})
