/**
 * Property-Based Test: Diet Log Export Round-Trip
 *
 * **Validates: Requirement 3.1 (Round_Trip_Property)**
 *
 * Property 1: For any DietLog list payload `x`, `parse(serialize(x))`
 * yields a value structurally equal to `x` for every meal/item/macro
 * field, with floating-point fields equal within ±0.01.
 *
 * The serializer here is `serializeDietLogExport(payload, 'json')`
 * which wraps the logs in a versioned `DietLogExportPayload` and
 * produces a UTF-8 JSON string. The "parser" side is plain
 * `JSON.parse`, mirroring how downstream tools (an Import flow
 * scheduled for a future spec, today's CSV-aware Excel import) read
 * it back.
 *
 * The arbitrary uses `arbDietLogEntry` from `src/test/arbitraries/dietLog.ts`
 * which guarantees every generated `MealItem` is macro-consistent
 * with the estimate-validator's 20% band — so the serializer never
 * receives input it would reject upstream.
 */

import { describe, it } from 'vitest'
import * as fc from 'fast-check'

import { serializeDietLogExport } from '../dietLogExport'
import { arbDietLogEntry } from '../../../../test/arbitraries/dietLog'
import { defaultRunConfig } from '../../../../test/arbitraries/runConfig'
import type { DietLog, MealItem } from '../../stores/dietLog'

const FLOAT_TOLERANCE = 0.01

function expectClose(actual: number, expected: number): void {
  if (Math.abs(actual - expected) > FLOAT_TOLERANCE) {
    throw new Error(`expected |${actual} - ${expected}| <= ${FLOAT_TOLERANCE}`)
  }
}

function expectDeepEqualLog(actual: DietLog, expected: DietLog): void {
  if (actual.date !== expected.date) {
    throw new Error(`date mismatch: ${actual.date} vs ${expected.date}`)
  }
  if (actual.meals.length !== expected.meals.length) {
    throw new Error(
      `meals length mismatch: ${actual.meals.length} vs ${expected.meals.length}`,
    )
  }
  for (let i = 0; i < actual.meals.length; i += 1) {
    const am = actual.meals[i]
    const em = expected.meals[i]
    if (am.type !== em.type) {
      throw new Error(`meal type mismatch at ${i}: ${am.type} vs ${em.type}`)
    }
    if (am.items.length !== em.items.length) {
      throw new Error(`item length mismatch at ${i}`)
    }
    for (let j = 0; j < am.items.length; j += 1) {
      expectDeepEqualItem(am.items[j], em.items[j])
    }
  }
}

function expectDeepEqualItem(actual: MealItem, expected: MealItem): void {
  if (actual.recipeId !== expected.recipeId) {
    throw new Error(`recipeId mismatch: ${actual.recipeId} vs ${expected.recipeId}`)
  }
  if (actual.name !== expected.name) {
    throw new Error(`name mismatch: ${actual.name} vs ${expected.name}`)
  }
  if (actual.servings !== expected.servings) {
    throw new Error(
      `servings mismatch: ${actual.servings} vs ${expected.servings}`,
    )
  }
  expectClose(actual.calories, expected.calories)
  expectClose(actual.protein, expected.protein)
  expectClose(actual.carbs, expected.carbs)
  expectClose(actual.fat, expected.fat)
  // emoji is `string | undefined`; if present on either side, must match
  if ((actual.emoji ?? null) !== (expected.emoji ?? null)) {
    throw new Error(`emoji mismatch: ${actual.emoji} vs ${expected.emoji}`)
  }
}

describe('dietLogExport round-trip property', () => {
  it('parse(serialize(x)) === x for every generated DietLog', () => {
    fc.assert(
      fc.property(arbDietLogEntry(), (log) => {
        const payload = {
          version: 1 as const,
          exportedAt: '2024-06-15T10:00:00.000Z',
          scope: 'day' as const,
          startDate: log.date,
          endDate: log.date,
          logs: [log],
          summary: {
            calories: 0,
            protein: 0,
            carbs: 0,
            fat: 0,
            mealCount: 0,
            itemCount: 0,
          },
        }
        const serialized = serializeDietLogExport(payload, 'json')
        const parsed = JSON.parse(serialized.content)
        if (parsed.version !== 1) {
          throw new Error(`version field changed under round trip`)
        }
        if (parsed.logs.length !== 1) {
          throw new Error(`logs length lost`)
        }
        expectDeepEqualLog(parsed.logs[0] as DietLog, log)
      }),
      defaultRunConfig(),
    )
  })
})
