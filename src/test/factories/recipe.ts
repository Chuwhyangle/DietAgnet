/**
 * Recipe factory for tests (task 2.6, Requirements 2.1, 2.2, 2.3, 2.4).
 *
 * Builds a valid `Recipe` whose macros stay consistent with calories
 * within the validator's ±35% tolerance (`recipeValidation.ts` uses
 * `variance > 0.35` to flag mismatches). The defaults here pick simple
 * round numbers:
 *
 *     calories: 400
 *     protein: 25 g  (=100 kcal)
 *     carbs:   40 g  (=160 kcal)
 *     fat:     16 g  (=144 kcal)
 *     macro total = 404 kcal  →  |404 - 400| / 400 = 1%  ≪ 35%
 *
 * so any test that imports `makeRecipe()` without macro overrides gets
 * a recipe the validator will accept.
 *
 * Overrides are shallow-merged at the top level. The `nutrition`
 * sub-object is deep-merged so callers can change a single macro
 * without re-specifying the whole `Nutrition` shape:
 *
 *     makeRecipe({ nutrition: { protein: 30 } })
 *     // → { ..., nutrition: { protein: 30, carbs: 40, fat: 16 } }
 *
 * Tests that need an *invalid* recipe should compose this factory
 * with explicit overrides (for example, set `calories: 1000` while
 * leaving the macros at their defaults so variance jumps past 35%).
 */

import type { Ingredient, Nutrition, Recipe } from '../../renderer/src/data/recipeTypes'

/**
 * Build a valid `Recipe` with sensible defaults.
 *
 * Top-level fields are shallow-merged; `nutrition` is deep-merged so
 * partial overrides like `{ nutrition: { protein: 30 } }` work.
 */
export function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  const defaults: Recipe = {
    id: 'test-recipe-1',
    name: '测试番茄炒蛋',
    emoji: '🍳',
    category: '家常菜',
    calories: 400,
    time: 15,
    ingredients: [
      { name: '鸡蛋', amount: '2 个' },
      { name: '番茄', amount: '1 个' },
    ],
    steps: [
      '番茄切块，鸡蛋打散',
      '热锅下蛋液炒散后盛出',
      '同锅炒番茄，回锅翻炒均匀出锅',
    ],
    nutrition: {
      protein: 25,
      carbs: 40,
      fat: 16,
    },
  }

  // Pull nutrition out so we can deep-merge it; everything else
  // top-level shallow-merges.
  const { nutrition: nutritionOverride, ...rest } = overrides

  const merged: Recipe = {
    ...defaults,
    ...rest,
    nutrition: mergeNutrition(defaults.nutrition, nutritionOverride),
  }

  return merged
}

function mergeNutrition(
  base: Nutrition,
  patch: Partial<Nutrition> | undefined,
): Nutrition {
  if (!patch) {
    return { ...base }
  }
  return {
    protein: patch.protein ?? base.protein,
    carbs: patch.carbs ?? base.carbs,
    fat: patch.fat ?? base.fat,
  }
}

/**
 * Convenience: build an `Ingredient` row. Useful when a test wants
 * to extend the default ingredient list without re-typing the shape.
 */
export function makeIngredient(overrides: Partial<Ingredient> = {}): Ingredient {
  return {
    name: '鸡蛋',
    amount: '2 个',
    ...overrides,
  }
}
