/**
 * Example tests for `data/recipeValidation.ts` (task 4.4, Requirements
 * 2.3, 7.2, 7.3, 7.4).
 *
 * `recipeValidation.ts` exports `validateRecipes(recipes, generatedAt?)`
 * which surfaces four issue buckets:
 *   - `duplicateIds`         → repeated `id`s
 *   - `missingRequiredFields`→ undefined/null/empty required fields,
 *                              empty `ingredients[]` / `steps[]`
 *   - `invalidNutrition`     → non-finite/negative macros, OR macro
 *                              calories that deviate from `calories`
 *                              by more than 35% (the documented
 *                              tolerance constant — see task 4.4 spec)
 *   - `suspiciousCalories`   → non-positive, non-finite, or outside
 *                              [30, 1200]
 * `status` is 'passed' when every bucket is empty, 'warning' otherwise.
 */

import { describe, it, expect } from 'vitest'

import { validateRecipes } from '../recipeValidation'
import { makeRecipe } from '../../../../test/factories/recipe'

describe('data/recipeValidation', () => {
  it('returns status="passed" for a valid recipe set with no duplicates', () => {
    const report = validateRecipes(
      [
        makeRecipe({ id: 'r-1' }),
        makeRecipe({ id: 'r-2', name: '另一道菜' }),
      ],
      '2024-06-15T10:00:00.000Z',
    )

    expect(report.status).toBe('passed')
    expect(report.totalRecipes).toBe(2)
    expect(report.duplicateIds).toEqual([])
    expect(report.missingRequiredFields).toEqual([])
    expect(report.invalidNutrition).toEqual([])
    expect(report.suspiciousCalories).toEqual([])
    expect(report.generatedAt).toBe('2024-06-15T10:00:00.000Z')
  })

  it('flags duplicate ids', () => {
    const report = validateRecipes([
      makeRecipe({ id: 'r-dup' }),
      makeRecipe({ id: 'r-dup', name: '同名重复' }),
    ])

    expect(report.duplicateIds).toEqual(['r-dup'])
    expect(report.status).toBe('warning')
  })

  it('flags missing required fields', () => {
    // Force `name` to empty string and `ingredients` to an empty array.
    const report = validateRecipes([
      makeRecipe({ id: 'r-empty', name: '', ingredients: [] }),
    ])

    expect(report.missingRequiredFields.some((issue) => issue.field === 'name'))
      .toBe(true)
    expect(
      report.missingRequiredFields.some((issue) => issue.field === 'ingredients[]'),
    ).toBe(true)
    expect(report.status).toBe('warning')
  })

  it('flags negative macros as invalidNutrition', () => {
    const report = validateRecipes([
      makeRecipe({ nutrition: { protein: -1, carbs: 40, fat: 16 } }),
    ])

    expect(
      report.invalidNutrition.some((issue) =>
        issue.reason?.includes('protein must be a non-negative number'),
      ),
    ).toBe(true)
    expect(report.status).toBe('warning')
  })

  it('flags macros that deviate from calories by more than 35%', () => {
    // Default factory has 25g protein + 40g carbs + 16g fat = 404 kcal.
    // Setting calories to 1000 forces |404 - 1000| / 1000 = 0.596 > 0.35.
    const report = validateRecipes([
      makeRecipe({ id: 'r-bad-macros', calories: 1000 }),
    ])

    const issue = report.invalidNutrition.find(
      (entry) => entry.recipeId === 'r-bad-macros',
    )
    expect(issue).toBeDefined()
    expect(issue?.reason).toMatch(/macro calories .* differ from calories .* by/)
  })

  it('does not flag macros within the 35% tolerance', () => {
    // Factory default has variance ~1%; well within the 35% band.
    const report = validateRecipes([makeRecipe({ id: 'r-ok' })])
    expect(report.invalidNutrition).toEqual([])
  })

  it('flags non-positive or out-of-range calories as suspicious', () => {
    const report = validateRecipes([
      // Use a very low macro mix so the macro-derived calories also drop, keeping the suspicious-calories bucket
      // as the only signal. 4*1 + 4*1 + 9*1 = 17 kcal; a calories=10 still triggers the lower-bound rule.
      makeRecipe({ id: 'r-tiny', calories: 10, nutrition: { protein: 1, carbs: 1, fat: 1 } }),
      makeRecipe({ id: 'r-huge', calories: 5000 }),
    ])

    const tinyIssue = report.suspiciousCalories.find(
      (entry) => entry.recipeId === 'r-tiny',
    )
    const hugeIssue = report.suspiciousCalories.find(
      (entry) => entry.recipeId === 'r-huge',
    )
    expect(tinyIssue?.reason).toMatch(/calories outside expected range/)
    expect(hugeIssue?.reason).toMatch(/calories outside expected range/)
  })

  it('flags zero or NaN calories with the positive-number message', () => {
    const report = validateRecipes([
      makeRecipe({ id: 'r-zero', calories: 0 }),
      makeRecipe({ id: 'r-nan', calories: Number.NaN }),
    ])
    const zero = report.suspiciousCalories.find(
      (entry) => entry.recipeId === 'r-zero',
    )
    const nan = report.suspiciousCalories.find(
      (entry) => entry.recipeId === 'r-nan',
    )
    expect(zero?.reason).toMatch(/positive number/)
    expect(nan?.reason).toMatch(/positive number/)
  })

  it('counts categories', () => {
    const report = validateRecipes([
      makeRecipe({ id: 'r-1', category: '家常菜' }),
      makeRecipe({ id: 'r-2', category: '家常菜' }),
      makeRecipe({ id: 'r-3', category: '甜品' }),
    ])
    expect(report.categoryCounts).toEqual({ 家常菜: 2, 甜品: 1 })
  })
})
