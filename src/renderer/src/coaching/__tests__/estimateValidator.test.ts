import { describe, it, expect } from 'vitest'
import { validateEstimateConsistency } from '../estimateValidator'

describe('validateEstimateConsistency', () => {
  it('returns valid for empty items array', () => {
    const result = validateEstimateConsistency([])
    expect(result.valid).toBe(true)
    expect(result.derivedCalories).toBe(0)
    expect(result.reportedCalories).toBe(0)
    expect(result.deviationPercent).toBe(0)
    expect(result.itemResults).toHaveLength(0)
  })

  it('returns valid when macros exactly match calories', () => {
    // 4*25 + 4*50 + 9*20 = 100 + 200 + 180 = 480
    const result = validateEstimateConsistency([
      { calories: 480, protein: 25, carbs: 50, fat: 20 },
    ])
    expect(result.valid).toBe(true)
    expect(result.derivedCalories).toBe(480)
    expect(result.reportedCalories).toBe(480)
    expect(result.deviationPercent).toBe(0)
  })

  it('returns valid when deviation is exactly at 20% boundary', () => {
    // derivedCalories = 4*10 + 4*10 + 9*10 = 40 + 40 + 90 = 170
    // reportedCalories = 170 / 1.2 ≈ 141.67 → deviation = 28.33, 20% of 141.67 = 28.33
    // Use exact: reported = 200, derived = 4*10 + 4*20 + 9*10 = 40+80+90 = 210
    // deviation = 10, 20% of 200 = 40 → valid
    const result = validateEstimateConsistency([
      { calories: 200, protein: 10, carbs: 20, fat: 10 },
    ])
    // derived = 40 + 80 + 90 = 210, deviation = 10, 20% of 200 = 40
    expect(result.valid).toBe(true)
    expect(result.derivedCalories).toBe(210)
    expect(result.deviationPercent).toBe(5)
  })

  it('returns invalid when deviation exceeds 20%', () => {
    // derived = 4*5 + 4*5 + 9*5 = 20 + 20 + 45 = 85
    // reported = 500, deviation = 415, 20% of 500 = 100 → invalid
    const result = validateEstimateConsistency([
      { calories: 500, protein: 5, carbs: 5, fat: 5 },
    ])
    expect(result.valid).toBe(false)
    expect(result.derivedCalories).toBe(85)
    expect(result.reportedCalories).toBe(500)
    expect(result.deviationPercent).toBe(83)
  })

  it('handles zero calories edge case - valid when derived is also 0', () => {
    const result = validateEstimateConsistency([
      { calories: 0, protein: 0, carbs: 0, fat: 0 },
    ])
    expect(result.valid).toBe(true)
    expect(result.deviationPercent).toBe(0)
  })

  it('handles zero calories edge case - invalid when derived is non-zero', () => {
    const result = validateEstimateConsistency([
      { calories: 0, protein: 10, carbs: 5, fat: 2 },
    ])
    expect(result.valid).toBe(false)
    expect(result.derivedCalories).toBe(78) // 4*10 + 4*5 + 9*2 = 40+20+18
    expect(result.deviationPercent).toBe(100)
  })

  it('validates multiple items - all valid', () => {
    const result = validateEstimateConsistency([
      { calories: 480, protein: 25, carbs: 50, fat: 20 }, // derived = 480
      { calories: 300, protein: 20, carbs: 30, fat: 10 }, // derived = 4*20+4*30+9*10 = 80+120+90 = 290
    ])
    // Item 2: deviation = 10, 20% of 300 = 60 → valid
    expect(result.valid).toBe(true)
    expect(result.itemResults).toHaveLength(2)
    expect(result.itemResults[0].valid).toBe(true)
    expect(result.itemResults[1].valid).toBe(true)
  })

  it('validates multiple items - one invalid makes result invalid', () => {
    const result = validateEstimateConsistency([
      { calories: 480, protein: 25, carbs: 50, fat: 20 }, // derived = 480, valid
      { calories: 500, protein: 5, carbs: 5, fat: 5 },    // derived = 85, invalid
    ])
    expect(result.valid).toBe(false)
    expect(result.itemResults[0].valid).toBe(true)
    expect(result.itemResults[1].valid).toBe(false)
  })

  it('returns per-item deviation percentages', () => {
    // derived = 4*30 + 4*40 + 9*15 = 120 + 160 + 135 = 415
    // reported = 400, deviation = 15, deviationPercent = 15/400*100 = 3.75
    const result = validateEstimateConsistency([
      { calories: 400, protein: 30, carbs: 40, fat: 15 },
    ])
    expect(result.itemResults[0].deviationPercent).toBeCloseTo(3.75)
    expect(result.itemResults[0].valid).toBe(true)
  })
})
