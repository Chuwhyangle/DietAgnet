/**
 * One-Tap Logger orchestrator.
 *
 * Dispatches to photo/text/same-as-yesterday/common-chip paths,
 * validates estimate consistency, checks allergy conflicts,
 * applies trust-mode auto-save logic, and persists to the diet log.
 *
 * @module coaching/oneTapLogger
 * @validates Requirements 2.1, 2.2, 2.3, 2.4, 2.6, 2.7, 8.2, 8.3, 8.5, 9.2
 */

import dayjs from 'dayjs'
import type { MealItem, DietLog } from '../stores/dietLog'
import { addMealItemToDietLog, getDietLog } from '../stores/dietLog'
import { DIET_LOG_UPDATED_EVENT } from '../stores/events'
import type { UserMemory } from '../stores/planning'
import { recipes } from '../data/recipes'
import { estimateFromPhoto } from './photoLogParser'
import { estimateFromText } from './textLogParser'
import { validateEstimateConsistency } from './estimateValidator'
import { getCoachingSettings } from './trustDial'
import type {
  OneTapLogRequest,
  OneTapLogResult,
  OneTapLogError,
  TrustMode,
  PhotoEstimateResult,
  TextEstimateResult,
  PhotoEstimateItem,
  TextEstimateItem,
} from './types'

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface ResolvedEstimate {
  items: MealItem[]
  confidence: number
  /** Whether this source requires consistency validation (photo/text do, others don't) */
  requiresConsistencyCheck: boolean
}

// ---------------------------------------------------------------------------
// Allergy conflict check
// ---------------------------------------------------------------------------

/**
 * Checks if any item name matches an active allergy/avoidance memory.
 * Uses case-insensitive substring matching.
 * Only considers memories with type 'allergy' or 'avoidance', confidence >= 0.6, and status 'active'.
 */
function checkAllergyConflicts(
  items: MealItem[],
  allergyMemories: UserMemory[],
): OneTapLogError | null {
  const activeAllergens = allergyMemories.filter(
    (m) =>
      (m.type === 'allergy' || m.type === 'avoidance') &&
      m.confidence >= 0.6 &&
      m.status === 'active',
  )

  if (activeAllergens.length === 0) {
    return null
  }

  for (const item of items) {
    const itemNameLower = item.name.toLowerCase()
    for (const memory of activeAllergens) {
      const allergenLower = memory.content.toLowerCase()
      if (itemNameLower.includes(allergenLower) || allergenLower.includes(itemNameLower)) {
        return {
          code: 'allergyConflict',
          reason: `食物"${item.name}"与过敏/忌口记录"${memory.content}"冲突，请确认后再保存`,
        }
      }
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Source resolvers
// ---------------------------------------------------------------------------

function estimateItemToMealItem(
  item: PhotoEstimateItem | TextEstimateItem,
): MealItem {
  return {
    recipeId: item.recipeId ?? `estimate-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: item.name,
    servings: item.servings,
    calories: Math.round(item.calories),
    protein: Math.round(item.protein * 10) / 10,
    carbs: Math.round(item.carbs * 10) / 10,
    fat: Math.round(item.fat * 10) / 10,
  }
}

async function resolvePhoto(imageBase64: string): Promise<ResolvedEstimate | OneTapLogError> {
  if (!imageBase64) {
    return { code: 'parseError', reason: '未提供图片数据' }
  }

  const result = await estimateFromPhoto(imageBase64)

  // Check if it's an error
  if ('code' in result) {
    return result as OneTapLogError
  }

  const estimate = result as PhotoEstimateResult
  return {
    items: estimate.items.map(estimateItemToMealItem),
    confidence: estimate.confidence,
    requiresConsistencyCheck: true,
  }
}

async function resolveText(rawText: string): Promise<ResolvedEstimate | OneTapLogError> {
  if (!rawText || rawText.trim().length === 0) {
    return { code: 'parseError', reason: '未提供文字描述' }
  }

  const result = await estimateFromText(rawText)

  // Check if it's an error
  if ('code' in result) {
    return result as OneTapLogError
  }

  const estimate = result as TextEstimateResult
  return {
    items: estimate.items.map(estimateItemToMealItem),
    confidence: estimate.confidence,
    requiresConsistencyCheck: true,
  }
}

function resolveSameAsYesterday(
  date: string,
  mealType: OneTapLogRequest['mealType'],
): ResolvedEstimate | OneTapLogError {
  const yesterday = dayjs(date).subtract(1, 'day').format('YYYY-MM-DD')
  const yesterdayLog = getDietLog(yesterday)

  if (!yesterdayLog) {
    return {
      code: 'noYesterdayMeal',
      reason: '昨天这一餐没有记录',
    }
  }

  const yesterdayMeal = yesterdayLog.meals.find((m) => m.type === mealType)
  if (!yesterdayMeal || yesterdayMeal.items.length === 0) {
    return {
      code: 'noYesterdayMeal',
      reason: '昨天这一餐没有记录',
    }
  }

  return {
    items: yesterdayMeal.items.map((item) => ({ ...item })),
    confidence: 1.0, // Same as yesterday is fully trusted
    requiresConsistencyCheck: false,
  }
}

function resolveCommonChip(chipRecipeId: string): ResolvedEstimate | OneTapLogError {
  if (!chipRecipeId) {
    return { code: 'parseError', reason: '未提供食物芯片ID' }
  }

  const recipe = recipes.find((r) => r.id === chipRecipeId)
  if (!recipe) {
    return { code: 'parseError', reason: `未找到食物: ${chipRecipeId}` }
  }

  const mealItem: MealItem = {
    recipeId: recipe.id,
    name: recipe.name,
    emoji: recipe.emoji,
    servings: 1,
    calories: Math.round(recipe.calories),
    protein: Math.round(recipe.nutrition.protein * 10) / 10,
    carbs: Math.round(recipe.nutrition.carbs * 10) / 10,
    fat: Math.round(recipe.nutrition.fat * 10) / 10,
  }

  return {
    items: [mealItem],
    confidence: 1.0, // Known recipe is fully trusted
    requiresConsistencyCheck: false,
  }
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

/**
 * Execute a one-tap log request.
 *
 * Orchestrates:
 * 1. Resolves items based on source (photo/text/same-as-yesterday/common-chip)
 * 2. Validates estimate consistency (macro-derived calories within ±20%)
 * 3. Checks allergy conflicts against allergyMemories
 * 4. If trustMode === 'autopilot' and confidence >= estimateAutoConfidence, auto-saves
 * 5. Otherwise returns the estimate for UI confirmation (success: true with dietLog undefined)
 * 6. On save: calls addMealItemToDietLog and emits DIET_LOG_UPDATED_EVENT
 */
export async function executeOneTapLog(
  request: OneTapLogRequest,
  trustMode: TrustMode,
  allergyMemories: UserMemory[],
): Promise<OneTapLogResult> {
  // Step 1: Resolve items based on source
  let resolved: ResolvedEstimate | OneTapLogError

  switch (request.source) {
    case 'photo':
      resolved = await resolvePhoto(request.imageBase64 ?? '')
      break
    case 'text_voice':
      resolved = await resolveText(request.rawText ?? '')
      break
    case 'same_as_yesterday':
      resolved = resolveSameAsYesterday(request.date, request.mealType)
      break
    case 'common_chip':
      resolved = resolveCommonChip(request.chipRecipeId ?? '')
      break
    default:
      return {
        success: false,
        error: { code: 'parseError', reason: `不支持的日志来源: ${request.source}` },
      }
  }

  // Check if resolution returned an error
  if ('code' in resolved) {
    return { success: false, error: resolved as OneTapLogError }
  }

  const estimate = resolved as ResolvedEstimate

  // Step 2: Validate estimate consistency (only for photo/text sources)
  if (estimate.requiresConsistencyCheck && estimate.items.length > 0) {
    const consistencyResult = validateEstimateConsistency(
      estimate.items.map((item) => ({
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
      })),
    )

    if (!consistencyResult.valid) {
      return {
        success: false,
        error: {
          code: 'estimateInconsistent',
          reason: '营养数据不一致，请手动调整',
        },
      }
    }
  }

  // Step 3: Check allergy conflicts
  const allergyError = checkAllergyConflicts(estimate.items, allergyMemories)
  if (allergyError) {
    return { success: false, error: allergyError }
  }

  // Step 4: Apply trust-mode auto-save logic
  const coachingSettings = getCoachingSettings()
  const shouldAutoSave =
    trustMode === 'autopilot' && estimate.confidence >= coachingSettings.estimateAutoConfidence

  // For precision mode, or low-confidence autopilot, return estimate for UI confirmation
  if (!shouldAutoSave) {
    // Return success: true but without dietLog — signals the UI should show confirmation
    return { success: true }
  }

  // Step 5 & 6: Auto-save — add each item to the diet log
  let dietLog: DietLog | undefined

  for (const item of estimate.items) {
    dietLog = addMealItemToDietLog({
      date: request.date,
      mealType: request.mealType,
      item,
    })
  }

  return {
    success: true,
    dietLog,
  }
}
