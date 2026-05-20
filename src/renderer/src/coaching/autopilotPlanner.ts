/**
 * Autopilot Planner — generates meal suggestions ranked by calorie fit,
 * filtered by allergies/avoidances, and boosted by frequent foods.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 9.1, 9.3, 9.4
 */

import { recipes, type Recipe } from '../data/recipes'
import { getDailyPlanGap } from '../planning/dynamicPlan'
import { buildRhythmSummaryStructured } from '../habits/rhythmSummary'
import { getUserMemories, type UserMemory } from '../stores/planning'
import {
  savePlannedMeal,
  type PlannedMeal,
} from '../stores/planning'
import {
  addMealItemToDietLog,
  getDietLog,
  type DietLog,
  type MealType,
} from '../stores/dietLog'
import { writeAuditEntry } from './auditLog'
import type {
  MealCandidate,
  AutopilotSuggestionRound,
} from './types'
import type { CoachingAuditEntry } from '../stores/planning'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get active allergy/avoidance memories with confidence >= 0.6.
 * Excludes 'pending_confirm' memories per Requirement 9.4.
 */
async function getActiveAllergyMemories(): Promise<UserMemory[]> {
  const memories = await getUserMemories({
    status: 'active',
    types: ['allergy', 'avoidance'],
  })
  return memories.filter((m) => m.confidence >= 0.6)
}

/**
 * Check if a recipe conflicts with any allergy/avoidance memory.
 * Uses case-insensitive substring matching on recipe name and ingredient names.
 */
function recipeConflictsWithMemories(recipe: Recipe, memories: UserMemory[]): boolean {
  if (memories.length === 0) return false

  const recipeName = recipe.name.toLowerCase()
  const ingredientNames = recipe.ingredients.map((ing) => ing.name.toLowerCase())

  for (const memory of memories) {
    const memoryContent = memory.normalizedContent.toLowerCase()

    // Check recipe name against memory content
    if (recipeName.includes(memoryContent) || memoryContent.includes(recipeName)) {
      return true
    }

    // Check each ingredient against memory content
    for (const ingName of ingredientNames) {
      if (ingName.includes(memoryContent) || memoryContent.includes(ingName)) {
        return true
      }
    }
  }

  return false
}

/**
 * Compute the meal calorie target from the daily plan gap.
 * mealTarget = remainingCalories / number of remaining unlogged meals
 */
function computeMealTarget(
  remainingCalories: number,
  date: string,
  mealType: MealType,
): number {
  // Use the remaining calories as the meal target directly.
  // The design says: compute from getDailyPlanGap, divide by remaining meals.
  // We'll estimate remaining meals based on meal type ordering.
  const mealOrder: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']
  const currentIndex = mealOrder.indexOf(mealType)
  const log = getDietLog(date)

  let remainingMealCount = 0
  for (let i = currentIndex; i < mealOrder.length; i++) {
    const mt = mealOrder[i]
    // Skip snack if it's not the target meal type
    if (mt === 'snack' && mealType !== 'snack') continue
    const meal = log?.meals.find((m) => m.type === mt)
    if (!meal || meal.items.length === 0) {
      remainingMealCount++
    }
  }

  if (remainingMealCount <= 0) remainingMealCount = 1
  return remainingCalories / remainingMealCount
}

// ---------------------------------------------------------------------------
// generateMealSuggestions
// ---------------------------------------------------------------------------

export async function generateMealSuggestions(
  date: string,
  mealType: MealType,
): Promise<AutopilotSuggestionRound> {
  const gap = await getDailyPlanGap(date)
  const allergyMemories = await getActiveAllergyMemories()
  const rhythmSummary = buildRhythmSummaryStructured()
  const frequentFoodNames = rhythmSummary.frequentFoods.map((f) => f.name.toLowerCase())

  // Compute remaining calories and meal target
  const remainingCalories = gap?.remainingCalories ?? 0
  const mealTarget = gap
    ? computeMealTarget(gap.remainingCalories, date, mealType)
    : 500 // fallback default

  // Score each recipe
  const scored: MealCandidate[] = []

  for (const recipe of recipes) {
    // Step 3: Allergy/avoidance hard filter (Req 4.3, 9.1, 9.4)
    if (recipeConflictsWithMemories(recipe, allergyMemories)) {
      continue
    }

    // Step 5: Exclude candidates exceeding mealTarget * 1.25 (Req 4.2)
    if (mealTarget > 0 && recipe.calories > mealTarget * 1.25) {
      continue
    }

    // Step 2: Compute calorie score
    let calorieScore = mealTarget > 0
      ? 1 - Math.abs(recipe.calories - mealTarget) / mealTarget
      : 0.5

    // Clamp score to [0, 1]
    calorieScore = Math.max(0, Math.min(1, calorieScore))

    // Step 4: Boost score by +0.2 if recipe name appears in frequentFoods (Req 4.4)
    if (frequentFoodNames.some((food) => recipe.name.toLowerCase().includes(food) || food.includes(recipe.name.toLowerCase()))) {
      calorieScore += 0.2
    }

    const reasoning = buildReasoning(recipe, mealTarget, calorieScore, frequentFoodNames)

    scored.push({
      recipeId: recipe.id,
      name: recipe.name,
      emoji: recipe.emoji,
      estimatedCalories: recipe.calories,
      estimatedProtein: recipe.nutrition.protein,
      estimatedCarbs: recipe.nutrition.carbs,
      estimatedFat: recipe.nutrition.fat,
      score: calorieScore,
      reasoning,
    })
  }

  // Step 6: Sort by score descending, take top 3
  scored.sort((a, b) => b.score - a.score)
  const candidates = scored.slice(0, 3)

  // Step 7: If fewer than 1 candidate after filtering, set fallback: true
  const fallback = candidates.length < 1

  const auditEntry = await writeAuditEntry({
    actor: 'system',
    action: 'autopilot_suggestion_generated',
    payload: {
      date,
      mealType,
      candidateCount: candidates.length,
      fallback,
      remainingCalories,
      mealTarget,
    },
  })

  return {
    date,
    mealType,
    candidates: fallback ? [] : candidates,
    fallback,
    auditEntry,
  }
}

function buildReasoning(
  recipe: Recipe,
  mealTarget: number,
  score: number,
  frequentFoodNames: string[],
): string {
  const parts: string[] = []

  if (mealTarget > 0) {
    const diff = recipe.calories - mealTarget
    if (Math.abs(diff) < mealTarget * 0.1) {
      parts.push('热量接近目标')
    } else if (diff < 0) {
      parts.push(`比目标少${Math.abs(Math.round(diff))}kcal`)
    } else {
      parts.push(`比目标多${Math.round(diff)}kcal`)
    }
  }

  const recipeLower = recipe.name.toLowerCase()
  if (frequentFoodNames.some((food) => recipeLower.includes(food) || food.includes(recipeLower))) {
    parts.push('常吃食物加分')
  }

  if (parts.length === 0) {
    parts.push('综合评分匹配')
  }

  return parts.join('；')
}

// ---------------------------------------------------------------------------
// acceptCandidate
// ---------------------------------------------------------------------------

export async function acceptCandidate(
  candidate: MealCandidate,
  date: string,
  mealType: MealType,
): Promise<{ plannedMeal: PlannedMeal; dietLog: DietLog }> {
  // Persist as a confirmed PlannedMeal
  const plannedMeal = await savePlannedMeal({
    date,
    mealType,
    items: [
      {
        recipeId: candidate.recipeId,
        name: candidate.name,
        emoji: candidate.emoji,
        servings: 1,
        estimatedCalories: candidate.estimatedCalories,
        estimatedProtein: candidate.estimatedProtein,
        estimatedCarbs: candidate.estimatedCarbs,
        estimatedFat: candidate.estimatedFat,
      },
    ],
    totalCalories: candidate.estimatedCalories,
    totalProtein: candidate.estimatedProtein,
    totalCarbs: candidate.estimatedCarbs,
    totalFat: candidate.estimatedFat,
    source: 'ai_suggested',
    status: 'confirmed',
    reasoning: candidate.reasoning,
  })

  // Persist as a DietLogEntry via addMealItemToDietLog (Req 4.5)
  const dietLog = addMealItemToDietLog({
    date,
    mealType,
    item: {
      recipeId: candidate.recipeId,
      name: candidate.name,
      emoji: candidate.emoji,
      servings: 1,
      calories: candidate.estimatedCalories,
      protein: candidate.estimatedProtein,
      carbs: candidate.estimatedCarbs,
      fat: candidate.estimatedFat,
    },
  })

  // Write audit entry
  await writeAuditEntry({
    actor: 'user',
    action: 'autopilot_candidate_accepted',
    payload: {
      date,
      mealType,
      recipeId: candidate.recipeId,
      name: candidate.name,
      calories: candidate.estimatedCalories,
    },
  })

  return { plannedMeal, dietLog }
}

// ---------------------------------------------------------------------------
// skipSuggestionRound
// ---------------------------------------------------------------------------

export async function skipSuggestionRound(
  date: string,
  mealType: MealType,
): Promise<CoachingAuditEntry> {
  const auditEntry = await writeAuditEntry({
    actor: 'user',
    action: 'skip',
    payload: {
      date,
      mealType,
      cooldownHours: 4,
      cooldownUntil: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    },
  })

  return auditEntry
}
