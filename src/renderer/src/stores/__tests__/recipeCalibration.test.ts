/**
 * Example tests for `stores/recipeCalibration.ts` (task 4.13,
 * Requirements 2.5, 2.8).
 */

import { describe, it, expect } from 'vitest'

import {
  createRecipeCalibrationRecord,
  getRecipeCalibrationRecords,
  updateRecipeCalibrationStatus,
  getLatestApprovedCalibrationForRecipe,
  applyRecipeCalibrationOverlay,
  getRecipeCalibrationSummary,
  countRecipesWithActiveApprovedCalibration,
} from '../recipeCalibration'
import type { Recipe } from '../../data/recipeTypes'

const recipe: Recipe = {
  id: 'r-1',
  name: '番茄炒蛋',
  emoji: '🍳',
  category: '家常菜',
  calories: 400,
  time: 15,
  ingredients: [{ name: '鸡蛋', amount: '2 个' }],
  steps: ['炒'],
  nutrition: { protein: 25, carbs: 40, fat: 16 },
}

describe('stores/recipeCalibration', () => {
  it('creates a calibration record and returns it from getRecipeCalibrationRecords', () => {
    const created = createRecipeCalibrationRecord(recipe, {
      estimatedCalories: 420,
      estimatedNutrition: { protein: 26, carbs: 40, fat: 17 },
      reasoning: 'measured at home',
      confidence: 0.8,
      source: 'manual_review',
    })
    expect(created.id).toBeGreaterThan(0)
    expect(created.recipeId).toBe('r-1')
    // Default status when calorie & macro variance are within tolerance.
    expect(created.status).toBe('pending')

    const records = getRecipeCalibrationRecords()
    expect(records).toHaveLength(1)
    expect(records[0].id).toBe(created.id)
  })

  it('flags low-confidence inputs as needs_review', () => {
    const created = createRecipeCalibrationRecord(recipe, {
      estimatedCalories: 420,
      estimatedNutrition: { protein: 26, carbs: 40, fat: 17 },
      reasoning: 'r',
      confidence: 0.3,
      source: 'llm_estimate',
    })
    expect(created.status).toBe('needs_review')
  })

  it('updateRecipeCalibrationStatus advances the row to approved', () => {
    const created = createRecipeCalibrationRecord(recipe, {
      estimatedCalories: 420,
      estimatedNutrition: { protein: 26, carbs: 40, fat: 17 },
      reasoning: 'r',
      confidence: 0.8,
      source: 'manual_review',
    })

    const updated = updateRecipeCalibrationStatus({
      id: created.id,
      status: 'approved',
      reviewerNote: 'looks fine',
    })
    expect(updated?.status).toBe('approved')
  })

  it('getLatestApprovedCalibrationForRecipe + applyRecipeCalibrationOverlay use approved values', () => {
    const created = createRecipeCalibrationRecord(recipe, {
      estimatedCalories: 420,
      estimatedNutrition: { protein: 26, carbs: 40, fat: 17 },
      reasoning: 'r',
      confidence: 0.8,
      source: 'manual_review',
    })
    updateRecipeCalibrationStatus({ id: created.id, status: 'approved' })
    const approved = getLatestApprovedCalibrationForRecipe('r-1')
    expect(approved?.id).toBe(created.id)
    const overlaid = applyRecipeCalibrationOverlay(recipe)
    expect(overlaid.calories).toBe(420)
  })

  it('summary + countRecipesWithActiveApprovedCalibration reflect the row count', () => {
    expect(getRecipeCalibrationSummary().total).toBe(0)
    const created = createRecipeCalibrationRecord(recipe, {
      estimatedCalories: 420,
      estimatedNutrition: { protein: 26, carbs: 40, fat: 17 },
      reasoning: 'r',
      confidence: 0.8,
      source: 'manual_review',
    })
    updateRecipeCalibrationStatus({ id: created.id, status: 'approved' })

    const summary = getRecipeCalibrationSummary()
    expect(summary.total).toBe(1)
    expect(countRecipesWithActiveApprovedCalibration()).toBe(1)
  })
})
