/**
 * Example tests for `data/recipes.ts` (task 4.6, Requirements 7.1, 7.5).
 *
 * `recipes.ts` exports the merged `recipes` array consumed across the
 * app. The PRD §7.1 documents the count (100 Chinese + 30 Western =
 * 130) — Requirement 7.5 makes that count an in-suite assertion so a
 * silent merge or duplicate surfaces here, not in production.
 *
 * The validator from `recipeValidation.ts` is run over the merged set
 * with the shared 35% tolerance constant; any violation fails the
 * test with the offending recipe id and field.
 */

import { describe, it, expect } from 'vitest'

import { recipes } from '../recipes'
import { validateRecipes } from '../recipeValidation'

describe('data/recipes (merged collection)', () => {
  it('contains the documented 130-recipe count (PRD §7.1)', () => {
    expect(recipes).toHaveLength(130)
  })

  it('uses unique ids across the merged set', () => {
    const ids = new Set<string>()
    for (const recipe of recipes) {
      expect(ids.has(recipe.id)).toBe(false)
      ids.add(recipe.id)
    }
    expect(ids.size).toBe(recipes.length)
  })

  it('passes the shared validator with zero violations', () => {
    const report = validateRecipes(recipes, '2024-06-15T10:00:00.000Z')
    if (report.status !== 'passed') {
      // Surface the first few offending recipes so the failure
      // message points at the data drift rather than a generic
      // "report.status was warning".
      const sample = {
        duplicateIds: report.duplicateIds.slice(0, 3),
        missingRequiredFields: report.missingRequiredFields.slice(0, 3),
        invalidNutrition: report.invalidNutrition.slice(0, 3),
        suspiciousCalories: report.suspiciousCalories.slice(0, 3),
      }
      // eslint-disable-next-line no-console
      console.error('recipes.ts validator violations sample:', sample)
    }
    expect(report.status).toBe('passed')
  })
})
