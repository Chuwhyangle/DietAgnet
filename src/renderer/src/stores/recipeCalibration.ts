import type { Nutrition, Recipe } from '../data/recipes'
import { emitRecipeCalibrationUpdated } from './events'

export type RecipeCalibrationStatus = 'pending' | 'approved' | 'rejected' | 'needs_review'
export type RecipeCalibrationSource = 'llm_estimate' | 'manual_review' | 'external_reference'

export interface RecipeCalibrationRecord {
  id: number
  recipeId: string
  recipeName: string
  originalCalories: number
  originalNutrition: Nutrition
  estimatedCalories: number
  estimatedNutrition: Nutrition
  reasoning: string
  confidence: number
  riskNotes: string[]
  status: RecipeCalibrationStatus
  source: RecipeCalibrationSource
  model?: string
  reviewerNote?: string
  createdAt: string
  updatedAt: string
  appliedAt?: string
}

export interface RecipeCalibrationInput {
  estimatedCalories: number
  estimatedNutrition: Nutrition
  reasoning: string
  confidence: number
  riskNotes?: string[]
  source: RecipeCalibrationSource
  model?: string
}

export interface RecipeCalibrationSummary {
  total: number
  pending: number
  needsReview: number
  approved: number
  rejected: number
  latestUpdatedAt?: string
}

const RECIPE_CALIBRATIONS_KEY = 'diet-agent-recipe-calibrations'

/** Bumps whenever calibration records are written; invalidates merged recipe caches. */
let calibrationCacheGeneration = 0

function nowIsoString(): string {
  return new Date().toISOString()
}

export function getRecipeCalibrationCacheGeneration(): number {
  return calibrationCacheGeneration
}

function cloneNutrition(nutrition: Nutrition): Nutrition {
  return {
    protein: nutrition.protein,
    carbs: nutrition.carbs,
    fat: nutrition.fat,
  }
}

function cloneRecord(record: RecipeCalibrationRecord): RecipeCalibrationRecord {
  return {
    ...record,
    originalNutrition: cloneNutrition(record.originalNutrition),
    estimatedNutrition: cloneNutrition(record.estimatedNutrition),
    riskNotes: [...record.riskNotes],
  }
}

function readRecords(): RecipeCalibrationRecord[] {
  try {
    const raw = localStorage.getItem(RECIPE_CALIBRATIONS_KEY)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw) as RecipeCalibrationRecord[]
    return Array.isArray(parsed) ? parsed.map(cloneRecord) : []
  } catch (error) {
    console.error('Failed to load recipe calibration records:', error)
    return []
  }
}

function writeRecords(records: RecipeCalibrationRecord[]): void {
  localStorage.setItem(RECIPE_CALIBRATIONS_KEY, JSON.stringify(records.map(cloneRecord)))
  calibrationCacheGeneration += 1
  emitRecipeCalibrationUpdated()
}

function getNextId(records: RecipeCalibrationRecord[]): number {
  return records.reduce((maxId, record) => Math.max(maxId, record.id), 0) + 1
}

function getMacroCalories(nutrition: Nutrition): number {
  return nutrition.protein * 4 + nutrition.carbs * 4 + nutrition.fat * 9
}

function inferCalibrationStatus(recipe: Recipe, input: RecipeCalibrationInput): RecipeCalibrationStatus {
  const calorieChangeRatio = Math.abs(input.estimatedCalories - recipe.calories) / recipe.calories
  const macroCalories = getMacroCalories(input.estimatedNutrition)
  const macroVariance = Math.abs(macroCalories - input.estimatedCalories) / input.estimatedCalories

  if (
    input.confidence < 0.6 ||
    calorieChangeRatio > 0.3 ||
    macroVariance > 0.25 ||
    input.estimatedCalories <= 0
  ) {
    return 'needs_review'
  }

  return 'pending'
}

export function createRecipeCalibrationRecord(
  recipe: Recipe,
  input: RecipeCalibrationInput,
): RecipeCalibrationRecord {
  const records = readRecords()
  const timestamp = nowIsoString()
  const record: RecipeCalibrationRecord = {
    id: getNextId(records),
    recipeId: recipe.id,
    recipeName: recipe.name,
    originalCalories: recipe.calories,
    originalNutrition: cloneNutrition(recipe.nutrition),
    estimatedCalories: Math.round(input.estimatedCalories),
    estimatedNutrition: cloneNutrition(input.estimatedNutrition),
    reasoning: input.reasoning.trim(),
    confidence: Math.min(Math.max(input.confidence, 0), 1),
    riskNotes: input.riskNotes?.map((item) => item.trim()).filter(Boolean) ?? [],
    status: inferCalibrationStatus(recipe, input),
    source: input.source,
    model: input.model?.trim() || undefined,
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  writeRecords([record, ...records])
  return cloneRecord(record)
}

export function getLatestApprovedCalibrationForRecipe(recipeId: string): RecipeCalibrationRecord | null {
  const approved = readRecords()
    .filter((record) => record.recipeId === recipeId && record.status === 'approved')
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))

  return approved.length > 0 ? cloneRecord(approved[0]) : null
}

export function applyRecipeCalibrationOverlay(recipe: Recipe): Recipe {
  const active = getLatestApprovedCalibrationForRecipe(recipe.id)
  if (!active) {
    return recipe
  }

  return {
    ...recipe,
    calories: active.estimatedCalories,
    nutrition: cloneNutrition(active.estimatedNutrition),
  }
}

export function countRecipesWithActiveApprovedCalibration(): number {
  const ids = new Set<string>()
  for (const record of readRecords()) {
    if (record.status === 'approved') {
      ids.add(record.recipeId)
    }
  }
  return ids.size
}

export function getRecipeCalibrationRecords(params: {
  recipeId?: string
  status?: RecipeCalibrationStatus
  limit?: number
} = {}): RecipeCalibrationRecord[] {
  const safeLimit = Math.max(1, params.limit ?? 20)

  return readRecords()
    .filter((record) => !params.recipeId || record.recipeId === params.recipeId)
    .filter((record) => !params.status || record.status === params.status)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, safeLimit)
    .map(cloneRecord)
}

export function updateRecipeCalibrationStatus(params: {
  id: number
  status: RecipeCalibrationStatus
  reviewerNote?: string
}): RecipeCalibrationRecord | null {
  const records = readRecords()
  const targetIndex = records.findIndex((record) => record.id === params.id)

  if (targetIndex < 0) {
    return null
  }

  const timestamp = nowIsoString()
  const nextRecord: RecipeCalibrationRecord = {
    ...records[targetIndex],
    status: params.status,
    reviewerNote: params.reviewerNote?.trim() || records[targetIndex].reviewerNote,
    updatedAt: timestamp,
    appliedAt: params.status === 'approved' ? timestamp : undefined,
  }

  records[targetIndex] = nextRecord
  writeRecords(records)
  return cloneRecord(nextRecord)
}

export function getRecipeCalibrationSummary(): RecipeCalibrationSummary {
  const records = readRecords()
  const summary: RecipeCalibrationSummary = {
    total: records.length,
    pending: 0,
    needsReview: 0,
    approved: 0,
    rejected: 0,
    latestUpdatedAt: records[0]?.updatedAt,
  }

  for (const record of records) {
    switch (record.status) {
      case 'pending':
        summary.pending += 1
        break
      case 'needs_review':
        summary.needsReview += 1
        break
      case 'approved':
        summary.approved += 1
        break
      case 'rejected':
        summary.rejected += 1
        break
    }

    if (!summary.latestUpdatedAt || record.updatedAt > summary.latestUpdatedAt) {
      summary.latestUpdatedAt = record.updatedAt
    }
  }

  return summary
}
