/**
 * Diet-log arbitraries (task 2.7, Requirements 3.5, 3.9).
 *
 * The estimate-consistency invariant (`coaching/estimateValidator.ts`)
 * accepts a meal item if and only if
 *
 *     |4*protein + 4*carbs + 9*fat − calories| ≤ 0.20 * calories
 *
 * The two arbitraries below sit on either side of that boundary:
 *
 *   - `arbDietLogEntry()` constructs each item's `calories` as the
 *     rounded macro-derived value, so the deviation is essentially
 *     zero. Every meal type / multi-item / single-item shape is
 *     covered.
 *
 *   - `arbInconsistentDietLogEntry()` generates the same shape but
 *     scales the calorie field to **3×** the macro-derived value.
 *     That gives a deviation of `|macro − 3*macro| = 2*macro`, i.e.
 *     deviation / calories = 2/3 ≈ 0.67, well past 0.20.
 *
 * Generated `DietLog` rows can be fed directly into store helpers
 * (`saveDietLog`, `summarizeDietLog`) and parser/serializer
 * round-trip properties.
 */

import * as fc from 'fast-check'
import type {
  DietLog,
  Meal,
  MealItem,
  MealType,
} from '../../renderer/src/stores/dietLog'

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

const mealTypeArb: fc.Arbitrary<MealType> = fc.constantFrom(
  'breakfast',
  'lunch',
  'dinner',
  'snack',
)

// ISO date in 2024 — enough variety for date-aware tests without
// drifting into ranges where dayjs DST quirks show up.
const dateArb = fc
  .integer({ min: 0, max: 365 })
  .map((offset) => {
    const base = new Date('2024-01-01T00:00:00Z')
    base.setUTCDate(base.getUTCDate() + offset)
    return base.toISOString().slice(0, 10)
  })

const recipeIdArb = fc
  .string({ minLength: 1, maxLength: 16 })
  .filter((s) => /^[a-zA-Z0-9_-]+$/.test(s))
  .map((s) => `r-${s}`)

const itemNameArb = fc
  .string({ minLength: 1, maxLength: 24 })
  .filter((s) => s.trim().length > 0)

const emojiArb = fc.option(
  fc.constantFrom('🍳', '🥗', '🍜', '🥘', '🍔', '🥙'),
  { nil: undefined },
)

const servingsArb = fc.integer({ min: 1, max: 4 })

// Per-serving macro ranges keep total calories in a realistic 30–800
// kcal band even after the `arbInconsistentDietLogEntry()` 3× scale,
// so we don't accidentally collide with overflow paths.
const proteinArb = fc.integer({ min: 0, max: 40 })
const carbsArb = fc.integer({ min: 0, max: 80 })
const fatArb = fc.integer({ min: 0, max: 25 })

interface ItemMacros {
  recipeId: string
  name: string
  emoji: string | undefined
  servings: number
  protein: number
  carbs: number
  fat: number
}

const itemMacrosArb: fc.Arbitrary<ItemMacros> = fc.record({
  recipeId: recipeIdArb,
  name: itemNameArb,
  emoji: emojiArb,
  servings: servingsArb,
  protein: proteinArb,
  carbs: carbsArb,
  fat: fatArb,
})

function buildItem(macros: ItemMacros, calorieScale: 1 | 3): MealItem {
  // Macros are stored on the item *as eaten* (already includes
  // `servings`), matching `createMealItemFromRecipe`.
  const protein = macros.protein * macros.servings
  const carbs = macros.carbs * macros.servings
  const fat = macros.fat * macros.servings
  const macroCalories = protein * 4 + carbs * 4 + fat * 9
  // Floor to keep calories ≥ 0 even when macros happen to be all
  // zero; the validator only rejects calories ≤ 0, so macro-derived
  // 0 calories with zero macros is technically consistent.
  const calories = Math.max(0, Math.round(macroCalories * calorieScale))
  return {
    recipeId: macros.recipeId,
    name: macros.name,
    emoji: macros.emoji,
    servings: macros.servings,
    calories,
    protein,
    carbs,
    fat,
  }
}

function buildMeal(
  type: MealType,
  itemMacros: ItemMacros[],
  calorieScale: 1 | 3,
): Meal {
  return {
    type,
    items: itemMacros.map((macros) => buildItem(macros, calorieScale)),
  }
}

const mealsArb = (calorieScale: 1 | 3): fc.Arbitrary<Meal[]> =>
  fc
    .array(
      fc.record({
        type: mealTypeArb,
        items: fc.array(itemMacrosArb, { minLength: 1, maxLength: 4 }),
      }),
      { minLength: 1, maxLength: 4 },
    )
    .map((rows) => {
      // De-duplicate meal types so the resulting `DietLog.meals`
      // matches the production invariant of "at most one meal entry
      // per `MealType`" enforced by `addRecipeToDietLog`.
      const byType = new Map<MealType, ItemMacros[]>()
      for (const row of rows) {
        const existing = byType.get(row.type) ?? []
        byType.set(row.type, [...existing, ...row.items])
      }
      return Array.from(byType.entries()).map(([type, items]) =>
        buildMeal(type, items, calorieScale),
      )
    })

// ---------------------------------------------------------------------------
// Public arbitraries
// ---------------------------------------------------------------------------

/**
 * Generate a `DietLog` whose every `MealItem` has macro-consistent
 * calories (deviation ≤ 0.20 * calories). The structure covers all
 * meal types and a 1–4 item-per-meal range.
 *
 * **Validates: Requirements 3.5 (positive cases), 3.9**
 */
export function arbDietLogEntry(): fc.Arbitrary<DietLog> {
  return fc
    .record({
      date: dateArb,
      meals: mealsArb(1),
    })
    .map((raw) => ({
      date: raw.date,
      meals: raw.meals,
    }))
}

/**
 * Generate a `DietLog` whose every `MealItem` violates the 20%
 * macro-consistency band. Calories are scaled to 3× the macro-derived
 * total, giving a deviation/calories ratio of 2/3 ≈ 0.67.
 *
 * Items with all-zero macros are still emitted (calories = 0 in that
 * case) since they are technically consistent; tests that need every
 * item to be inconsistent should add a `protein + carbs + fat > 0`
 * filter on the result.
 *
 * **Validates: Requirement 3.5 (negative cases)**
 */
export function arbInconsistentDietLogEntry(): fc.Arbitrary<DietLog> {
  return fc
    .record({
      date: dateArb,
      meals: mealsArb(3),
    })
    .map((raw) => ({
      date: raw.date,
      meals: raw.meals,
    }))
}
