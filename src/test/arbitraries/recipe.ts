/**
 * Recipe arbitraries (task 2.7, Requirements 3.6, 7.3).
 *
 * `recipeValidation.ts` flags a recipe whenever
 *
 *     variance = |4*protein + 4*carbs + 9*fat − calories| / calories
 *
 * exceeds **0.35**. The arbitraries below sit on either side of that
 * line:
 *
 *   - `arbValidRecipe()` constructs `calories` as the rounded
 *     macro-derived value, so variance is effectively zero. The
 *     resulting recipe also satisfies every other validator rule
 *     (positive calories, non-empty ingredients/steps, finite
 *     non-negative macros, calories within the 30–1200 sanity band).
 *
 *   - `arbInvalidRecipe()` keeps the same shape but doubles the
 *     macro-derived calorie total so variance is 0.5 (well past 0.35).
 *     This guarantees the negative property case lives strictly
 *     outside the tolerance band regardless of shrinking.
 *
 * Both arbitraries return real `Recipe` instances so callers can pass
 * them straight to `validateRecipes([recipe])`.
 */

import * as fc from 'fast-check'
import type { Ingredient, Recipe } from '../../renderer/src/data/recipeTypes'

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

const recipeIdArb = fc
  .string({ minLength: 1, maxLength: 24 })
  .filter((s) => /^[a-zA-Z0-9_-]+$/.test(s))
  .map((s) => `r-${s}`)

const recipeNameArb = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => s.trim().length > 0)

const emojiArb = fc.constantFrom('🍳', '🥗', '🍜', '🥘', '🍲', '🍱', '🍔', '🥙')

const categoryArb = fc.constantFrom(
  '家常菜',
  '汤羹',
  '主食',
  '小食',
  '沙拉',
  '甜品',
  '早餐',
)

const ingredientArb: fc.Arbitrary<Ingredient> = fc.record({
  name: fc
    .string({ minLength: 1, maxLength: 16 })
    .filter((s) => s.trim().length > 0),
  amount: fc.constantFrom('1 个', '2 份', '100 g', '半碗', '一勺', '少许'),
})

const stepArb = fc
  .string({ minLength: 4, maxLength: 50 })
  .filter((s) => s.trim().length > 0)

// Macro ranges chosen so macro-derived calories land in roughly
// 50–560 kcal. Even after `arbInvalidRecipe()` doubles the calorie
// total, the result still fits the validator's 30–1200 sanity band,
// so macro-consistency is the *only* violation it reports.
const proteinArb = fc.integer({ min: 3, max: 30 })
const carbsArb = fc.integer({ min: 5, max: 70 })
const fatArb = fc.integer({ min: 2, max: 18 })

const timeArb = fc.integer({ min: 5, max: 90 })

// ---------------------------------------------------------------------------
// Public arbitraries
// ---------------------------------------------------------------------------

/**
 * Generate a `Recipe` whose `calories` exactly matches the
 * macro-derived value (variance = 0). Every other validator rule is
 * also satisfied.
 *
 * **Validates: Requirements 3.6, 7.3 (positive cases)**
 */
export function arbValidRecipe(): fc.Arbitrary<Recipe> {
  return fc
    .record({
      id: recipeIdArb,
      name: recipeNameArb,
      emoji: emojiArb,
      category: categoryArb,
      time: timeArb,
      protein: proteinArb,
      carbs: carbsArb,
      fat: fatArb,
      ingredients: fc.array(ingredientArb, { minLength: 1, maxLength: 6 }),
      steps: fc.array(stepArb, { minLength: 1, maxLength: 6 }),
    })
    .map((raw): Recipe => {
      const macroCalories = raw.protein * 4 + raw.carbs * 4 + raw.fat * 9
      // `Math.round` keeps variance ≤ 0.5 / macroCalories, which is
      // well below the 0.35 threshold for any non-trivial macro mix.
      const calories = Math.max(30, Math.round(macroCalories))
      return {
        id: raw.id,
        name: raw.name,
        emoji: raw.emoji,
        category: raw.category,
        calories,
        time: raw.time,
        ingredients: raw.ingredients,
        steps: raw.steps,
        nutrition: {
          protein: raw.protein,
          carbs: raw.carbs,
          fat: raw.fat,
        },
      }
    })
}

/**
 * Generate a `Recipe` whose `calories` is perturbed far outside the
 * 35% macro-consistency band. Calories are set to twice the
 * macro-derived total, giving a variance of 0.5 — strictly greater
 * than 0.35 regardless of shrinking.
 *
 * Other validator rules (non-empty ingredients/steps, non-negative
 * macros, unique id) still hold so the *only* violation reported is
 * the macro-consistency one.
 *
 * **Validates: Requirements 3.6, 7.3 (negative cases)**
 */
export function arbInvalidRecipe(): fc.Arbitrary<Recipe> {
  return arbValidRecipe().map((recipe): Recipe => {
    const macroCalories =
      recipe.nutrition.protein * 4 +
      recipe.nutrition.carbs * 4 +
      recipe.nutrition.fat * 9
    // Doubling the macro-derived calorie total drives variance to
    // |macro − 2*macro| / (2*macro) = 0.5, well past 0.35.
    const perturbedCalories = Math.max(60, macroCalories * 2)
    return {
      ...recipe,
      calories: perturbedCalories,
    }
  })
}
