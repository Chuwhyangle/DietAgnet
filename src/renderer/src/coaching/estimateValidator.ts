/**
 * Estimate consistency validator.
 *
 * Validates that macro-derived calories are within ±20% of reported calories
 * for each item. Formula: derivedCalories = 4 * protein + 4 * carbs + 9 * fat.
 * An item is valid if |derivedCalories - reportedCalories| <= 0.20 * reportedCalories.
 *
 * Pure function, no side effects.
 *
 * @module coaching/estimateValidator
 * @validates Requirements 2.7, 3.3
 */

export interface EstimateConsistencyItem {
  calories: number
  protein: number
  carbs: number
  fat: number
}

export interface ItemValidationResult {
  valid: boolean
  derivedCalories: number
  reportedCalories: number
  deviationPercent: number
}

export interface EstimateConsistencyResult {
  valid: boolean
  derivedCalories: number
  reportedCalories: number
  deviationPercent: number
  itemResults: ItemValidationResult[]
}

/**
 * Validates estimate consistency for a set of items.
 *
 * For each item, computes derivedCalories = 4 * protein + 4 * carbs + 9 * fat
 * and checks that |derivedCalories - reportedCalories| <= 0.20 * reportedCalories.
 *
 * Returns an aggregate result where `valid` is true only if ALL items pass,
 * plus per-item results for debugging.
 *
 * Edge cases:
 * - If calories is 0, the item is valid only if derivedCalories is also 0
 *   (avoids division by zero in deviation calculation).
 * - Empty items array is considered valid (vacuously true).
 */
export function validateEstimateConsistency(
  items: EstimateConsistencyItem[],
): EstimateConsistencyResult {
  if (items.length === 0) {
    return {
      valid: true,
      derivedCalories: 0,
      reportedCalories: 0,
      deviationPercent: 0,
      itemResults: [],
    }
  }

  const itemResults: ItemValidationResult[] = items.map((item) => {
    const derivedCalories = 4 * item.protein + 4 * item.carbs + 9 * item.fat
    const reportedCalories = item.calories

    if (reportedCalories === 0) {
      // Edge case: if reported calories is 0, valid only if derived is also 0
      return {
        valid: derivedCalories === 0,
        derivedCalories,
        reportedCalories,
        deviationPercent: derivedCalories === 0 ? 0 : 100,
      }
    }

    const deviation = Math.abs(derivedCalories - reportedCalories)
    const deviationPercent = (deviation / reportedCalories) * 100

    return {
      valid: deviation <= 0.2 * reportedCalories,
      derivedCalories,
      reportedCalories,
      deviationPercent,
    }
  })

  const allValid = itemResults.every((r) => r.valid)

  // Aggregate: sum derived and reported across all items
  const totalDerived = itemResults.reduce((sum, r) => sum + r.derivedCalories, 0)
  const totalReported = itemResults.reduce((sum, r) => sum + r.reportedCalories, 0)
  const totalDeviationPercent =
    totalReported === 0
      ? totalDerived === 0
        ? 0
        : 100
      : (Math.abs(totalDerived - totalReported) / totalReported) * 100

  return {
    valid: allValid,
    derivedCalories: totalDerived,
    reportedCalories: totalReported,
    deviationPercent: totalDeviationPercent,
    itemResults,
  }
}
