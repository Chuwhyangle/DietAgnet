/**
 * Diet log factories for tests (task 2.6, Requirements 2.1, 2.2, 2.3,
 * 2.4).
 *
 * Production code under `src/renderer/src/stores/dietLog.ts` exposes
 * `DietLog`, `Meal`, and `MealItem`. The spec task lists the file
 * name as `dietLogEntry.ts` and asks for `makeDietLogEntry` /
 * `makeDietLogItem` factories — we keep the file name and factory
 * names per the spec while returning the actual production types
 * (`DietLog` / `MealItem`). Aliases are exported under the production
 * names too so callers can pick whichever reads better.
 *
 *     // Either is fine:
 *     const entry = makeDietLogEntry()    // returns DietLog
 *     const log   = makeDietLog()         // alias of makeDietLogEntry
 *     const item  = makeDietLogItem()     // returns MealItem
 *     const meal  = makeMealItem()        // alias of makeDietLogItem
 *
 * Defaults match the macros-from-recipe convention used by
 * `createMealItemFromRecipe` so the calories field stays consistent
 * with the per-macro fields under the standard `4/4/9` rule.
 */

import type {
  DietLog,
  Meal,
  MealItem,
  MealType,
} from '../../renderer/src/stores/dietLog'

/**
 * Build a `MealItem` (the spec's `DietLogItem`).
 *
 * Defaults: one serving of a 400-kcal recipe with macros consistent
 * with the calorie total under the 4/4/9 rule (25*4 + 40*4 + 16*9 =
 * 404 kcal, well within parser estimate-consistency tolerance).
 */
export function makeDietLogItem(overrides: Partial<MealItem> = {}): MealItem {
  return {
    recipeId: 'test-recipe-1',
    name: '测试番茄炒蛋',
    emoji: '🍳',
    servings: 1,
    calories: 400,
    protein: 25,
    carbs: 40,
    fat: 16,
    ...overrides,
  }
}

/**
 * Build a `DietLog` (the spec's `DietLogEntry`).
 *
 * Defaults: one lunch meal containing a single default `MealItem` on
 * 2024-06-15 (the same anchor date used elsewhere in the test suite).
 *
 * Top-level fields are shallow-merged; the `meals` array, when
 * provided, replaces the default in full so callers retain control
 * over meal structure.
 */
export function makeDietLogEntry(overrides: Partial<DietLog> = {}): DietLog {
  const defaults: DietLog = {
    date: '2024-06-15',
    meals: [
      {
        type: 'lunch',
        items: [makeDietLogItem()],
      },
    ],
  }
  return {
    ...defaults,
    ...overrides,
    meals: overrides.meals ?? defaults.meals.map(cloneMeal),
  }
}

function cloneMeal(meal: Meal): Meal {
  return {
    type: meal.type,
    items: meal.items.map((item) => ({ ...item })),
  }
}

/**
 * Convenience: build a `Meal` row. Useful when a test wants a
 * specific meal type or item count without re-typing the shape.
 */
export function makeMeal(overrides: Partial<Meal> = {}): Meal {
  const type: MealType = overrides.type ?? 'lunch'
  return {
    type,
    items: overrides.items ?? [makeDietLogItem()],
  }
}

// ---------------------------------------------------------------------------
// Aliases under the production type names. Tests can use either set
// of names; both refer to the same factory function.
// ---------------------------------------------------------------------------

export const makeDietLog = makeDietLogEntry
export const makeMealItem = makeDietLogItem
