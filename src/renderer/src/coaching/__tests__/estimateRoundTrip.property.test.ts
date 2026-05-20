/**
 * Property-Based Test: Estimate Serialization Round-Trip
 *
 * **Validates: Requirements 11.3, 11.4**
 *
 * Property 5: For any valid PhotoEstimateResult or TextEstimateResult object,
 * parse(serialize(x)) produces a structurally equivalent object where:
 * - name is identical
 * - items[] order is preserved
 * - All scalar fields (calories, protein, carbs, fat, confidence, servings) are equal within ±0.01
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { defaultRunConfig } from '../../../../test/arbitraries/runConfig'
import { serializePhotoEstimate, parsePhotoEstimate } from '../photoLogParser'
import { serializeTextEstimate, parseTextEstimate } from '../textLogParser'
import type { PhotoEstimateResult, TextEstimateResult } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Assert two numbers are equal within ±0.01 tolerance to absorb JSON numeric formatting.
 */
function assertApproxEqual(actual: number, expected: number, fieldName: string): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(
    0.01,
  )
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Generate a positive finite number suitable for nutritional fields */
const positiveFiniteNumber = fc.double({ min: 0.01, max: 10000, noNaN: true }).filter((n) => Number.isFinite(n) && n > 0)

/** Generate a confidence value between 0 and 1 */
const confidenceArb = fc.double({ min: 0, max: 1, noNaN: true }).filter((n) => Number.isFinite(n))

/** Generate a non-empty string for names */
const nonEmptyString = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.length > 0)

/** Generate an optional recipeId */
const optionalRecipeId = fc.option(fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.length > 0), { nil: undefined })

/** Generate a single estimate item (shared shape for Photo and Text) */
const estimateItemArb = fc.record({
  name: nonEmptyString,
  servings: positiveFiniteNumber,
  calories: positiveFiniteNumber,
  protein: positiveFiniteNumber,
  carbs: positiveFiniteNumber,
  fat: positiveFiniteNumber,
  confidence: confidenceArb,
  recipeId: optionalRecipeId,
})

/** Generate a valid PhotoEstimateResult */
const photoEstimateResultArb: fc.Arbitrary<PhotoEstimateResult> = fc.record({
  name: nonEmptyString,
  servings: positiveFiniteNumber,
  calories: positiveFiniteNumber,
  protein: positiveFiniteNumber,
  carbs: positiveFiniteNumber,
  fat: positiveFiniteNumber,
  confidence: confidenceArb,
  items: fc.array(estimateItemArb, { minLength: 0, maxLength: 10 }),
})

/** Generate a valid TextEstimateResult */
const textEstimateResultArb: fc.Arbitrary<TextEstimateResult> = fc.record({
  name: nonEmptyString,
  servings: positiveFiniteNumber,
  calories: positiveFiniteNumber,
  protein: positiveFiniteNumber,
  carbs: positiveFiniteNumber,
  fat: positiveFiniteNumber,
  confidence: confidenceArb,
  items: fc.array(estimateItemArb, { minLength: 0, maxLength: 10 }),
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Property 5: Estimate Serialization Round-Trip', () => {
  it('PhotoEstimateResult round-trips through serialize then parse', () => {
    fc.assert(
      fc.property(photoEstimateResultArb, (original) => {
        const serialized = serializePhotoEstimate(original)
        const parsed = parsePhotoEstimate(serialized)

        // parse must not return an error for valid inputs
        if ('code' in parsed) {
          return false
        }

        // name must be identical
        if (parsed.name !== original.name) return false

        // items order and count must be preserved
        if (parsed.items.length !== original.items.length) return false

        // Top-level scalar fields within ±0.01
        const scalarFields = ['servings', 'calories', 'protein', 'carbs', 'fat', 'confidence'] as const
        for (const field of scalarFields) {
          if (Math.abs(parsed[field] - original[field]) > 0.01) return false
        }

        // Each item: name identical, scalars within ±0.01, recipeId identical
        for (let i = 0; i < original.items.length; i++) {
          const origItem = original.items[i]
          const parsedItem = parsed.items[i]

          if (parsedItem.name !== origItem.name) return false
          if (parsedItem.recipeId !== origItem.recipeId) return false

          for (const field of scalarFields) {
            if (Math.abs(parsedItem[field] - origItem[field]) > 0.01) return false
          }
        }

        return true
      }),
      { ...defaultRunConfig() },
    )
  })

  it('TextEstimateResult round-trips through serialize then parse', () => {
    fc.assert(
      fc.property(textEstimateResultArb, (original) => {
        const serialized = serializeTextEstimate(original)
        const parsed = parseTextEstimate(serialized)

        // parse must not return an error for valid inputs
        if ('code' in parsed) {
          return false
        }

        // name must be identical
        if (parsed.name !== original.name) return false

        // items order and count must be preserved
        if (parsed.items.length !== original.items.length) return false

        // Top-level scalar fields within ±0.01
        const scalarFields = ['servings', 'calories', 'protein', 'carbs', 'fat', 'confidence'] as const
        for (const field of scalarFields) {
          if (Math.abs(parsed[field] - original[field]) > 0.01) return false
        }

        // Each item: name identical, scalars within ±0.01, recipeId identical
        for (let i = 0; i < original.items.length; i++) {
          const origItem = original.items[i]
          const parsedItem = parsed.items[i]

          if (parsedItem.name !== origItem.name) return false
          if (parsedItem.recipeId !== origItem.recipeId) return false

          for (const field of scalarFields) {
            if (Math.abs(parsedItem[field] - origItem[field]) > 0.01) return false
          }
        }

        return true
      }),
      { ...defaultRunConfig() },
    )
  })
})
