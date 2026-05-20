/**
 * Property 6: Recipe macro consistency
 *
 * Invariant: the validator reports a macro-consistency violation iff
 * |protein*4 + carbs*4 + fat*9 - calories| > tolerance * calories
 * where tolerance = 0.35 (the same threshold used in recipeValidation.ts).
 *
 * **Validates: Requirements 3.6, 7.3**
 */

import * as fc from 'fast-check'
import { describe, it } from 'vitest'
import { validateRecipes } from '../recipeValidation'
import { arbValidRecipe, arbInvalidRecipe } from '../../../../test/arbitraries/recipe'
import { defaultRunConfig } from '../../../../test/arbitraries/runConfig'

/** Mirrors the tolerance used in recipeValidation.ts (line ~95). */
const MACRO_CALORIE_TOLERANCE = 0.35

describe('Property 6: Recipe macro consistency', () => {
  it('valid recipes produce no macro-consistency violations', async () => {
    /**
     * Validates: Requirements 3.6, 7.3
     *
     * For any recipe where |protein*4 + carbs*4 + fat*9 - calories| / calories <= tolerance,
     * the validator must NOT report an invalidNutrition entry for macro-calorie mismatch.
     */
    await fc.assert(
      fc.asyncProperty(arbValidRecipe(), async (recipe) => {
        const macroCalories =
          recipe.nutrition.protein * 4 +
          recipe.nutrition.carbs * 4 +
          recipe.nutrition.fat * 9
        const variance = Math.abs(macroCalories - recipe.calories) / recipe.calories

        // Precondition: the generated recipe is within tolerance
        fc.pre(variance <= MACRO_CALORIE_TOLERANCE)

        const report = validateRecipes([recipe])

        // No macro-consistency violations should be reported
        const macroViolations = report.invalidNutrition.filter((issue) =>
          issue.reason?.includes('macro calories'),
        )
        return macroViolations.length === 0
      }),
      defaultRunConfig(),
    )
  })

  it('invalid recipes produce a macro-consistency violation', async () => {
    /**
     * Validates: Requirements 3.6, 7.3
     *
     * For any recipe where |protein*4 + carbs*4 + fat*9 - calories| / calories > tolerance,
     * the validator MUST report an invalidNutrition entry for macro-calorie mismatch.
     */
    await fc.assert(
      fc.asyncProperty(arbInvalidRecipe(), async (recipe) => {
        const macroCalories =
          recipe.nutrition.protein * 4 +
          recipe.nutrition.carbs * 4 +
          recipe.nutrition.fat * 9
        const variance = Math.abs(macroCalories - recipe.calories) / recipe.calories

        // Precondition: the generated recipe is outside tolerance
        fc.pre(variance > MACRO_CALORIE_TOLERANCE)

        const report = validateRecipes([recipe])

        // A macro-consistency violation must be reported
        const macroViolations = report.invalidNutrition.filter((issue) =>
          issue.reason?.includes('macro calories'),
        )
        return macroViolations.length === 1
      }),
      defaultRunConfig(),
    )
  })
})
