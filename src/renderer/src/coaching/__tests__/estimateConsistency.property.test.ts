/**
 * Property-Based Test: Estimate Consistency Invariant
 *
 * **Validates: Requirements 2.7, 3.3**
 *
 * Property 1: For any item with (calories, protein, carbs, fat) where calories > 0,
 * validateEstimateConsistency accepts the item if and only if
 * |4*protein + 4*carbs + 9*fat - calories| <= 0.20 * calories.
 */

import { describe, it } from 'vitest'
import * as fc from 'fast-check'
import { defaultRunConfig } from '../../../../test/arbitraries/runConfig'
import { validateEstimateConsistency } from '../estimateValidator'

describe('Property 1: Estimate Consistency Invariant', () => {
  /**
   * Bi-directional property: validateEstimateConsistency returns valid: true
   * if and only if the macro-derived calories are within ±20% of reported calories.
   *
   * We generate arbitrary positive nutritional tuples and verify the function's
   * decision matches the mathematical invariant exactly.
   */
  it('accepts items where |4p+4c+9f - cal| <= 0.20 * cal and rejects otherwise', () => {
    fc.assert(
      fc.property(
        fc.record({
          calories: fc.integer({ min: 1, max: 5000 }),
          protein: fc.integer({ min: 0, max: 500 }),
          carbs: fc.integer({ min: 0, max: 500 }),
          fat: fc.integer({ min: 0, max: 500 }),
        }),
        (item) => {
          const derivedCalories = 4 * item.protein + 4 * item.carbs + 9 * item.fat
          const deviation = Math.abs(derivedCalories - item.calories)
          const expectedValid = deviation <= 0.20 * item.calories

          const result = validateEstimateConsistency([item])

          // Bi-directional: function accepts iff invariant holds
          return result.valid === expectedValid
        },
      ),
      { ...defaultRunConfig() },
    )
  })

  /**
   * Supplementary property: for tuples generated to be within the 20% band,
   * the function must always accept.
   *
   * Strategy: generate macros, compute derivedCalories, then set reported calories
   * to derivedCalories (exact match). This guarantees deviation = 0 which is always valid.
   */
  it('always accepts items constructed to be within the 20% tolerance band', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 200 }),
        fc.integer({ min: 0, max: 200 }),
        fc.integer({ min: 0, max: 200 }),
        fc.integer({ min: 0, max: 20 }), // percentage offset 0-20%
        fc.boolean(), // direction of offset (over or under)
        (protein, carbs, fat, offsetPercent, overReport) => {
          const derivedCalories = 4 * protein + 4 * carbs + 9 * fat
          if (derivedCalories === 0) return true // skip trivial zero case

          // Construct calories within the 20% band of derived
          // We want |derived - cal| <= 0.20 * cal
          // If cal = derived / (1 - fraction) where fraction in [0, 0.166], derived < cal
          // If cal = derived / (1 + fraction) where fraction in [0, 0.20], derived > cal
          // Simpler: set cal = derived, then the deviation is 0 (always valid)
          // For variety, offset calories by up to 20% of derived in either direction
          // and verify the invariant holds
          const offset = Math.floor((derivedCalories * offsetPercent) / 100)
          const calories = overReport
            ? derivedCalories + offset
            : Math.max(1, derivedCalories - offset)

          const deviation = Math.abs(derivedCalories - calories)
          // Only test if this is actually within the band
          if (deviation > 0.20 * calories) return true

          const result = validateEstimateConsistency([{ calories, protein, carbs, fat }])
          return result.valid === true
        },
      ),
      { ...defaultRunConfig() },
    )
  })

  /**
   * Supplementary property: for tuples generated to be outside the 20% band,
   * the function must always reject.
   */
  it('always rejects items constructed to be outside the 20% tolerance band', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5000 }),
        fc.integer({ min: 0, max: 500 }),
        fc.integer({ min: 0, max: 500 }),
        fc.integer({ min: 0, max: 500 }),
        (calories, protein, carbs, fat) => {
          const derivedCalories = 4 * protein + 4 * carbs + 9 * fat
          const deviation = Math.abs(derivedCalories - calories)

          // Only test tuples that are outside the band
          if (deviation <= 0.20 * calories) return true // skip valid ones

          const result = validateEstimateConsistency([{ calories, protein, carbs, fat }])
          return result.valid === false
        },
      ),
      { ...defaultRunConfig() },
    )
  })
})
