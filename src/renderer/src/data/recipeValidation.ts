import type { Recipe } from './recipeTypes'

export interface RecipeValidationIssue {
  recipeId: string
  field?: string
  calories?: number
  reason?: string
}

export interface RecipeValidationReport {
  generatedAt: string
  totalRecipes: number
  duplicateIds: string[]
  missingRequiredFields: RecipeValidationIssue[]
  invalidNutrition: RecipeValidationIssue[]
  suspiciousCalories: RecipeValidationIssue[]
  categoryCounts: Record<string, number>
  status: 'passed' | 'warning'
}

function getMacroCalories(recipe: Recipe): number {
  return recipe.nutrition.protein * 4 + recipe.nutrition.carbs * 4 + recipe.nutrition.fat * 9
}

export function validateRecipes(recipes: Recipe[], generatedAt = new Date().toISOString()): RecipeValidationReport {
  const ids = new Map<string, Recipe>()
  const duplicateIds: string[] = []
  const missingRequiredFields: RecipeValidationIssue[] = []
  const invalidNutrition: RecipeValidationIssue[] = []
  const suspiciousCalories: RecipeValidationIssue[] = []
  const categoryCounts: Record<string, number> = {}

  for (const recipe of recipes) {
    const recipeId = recipe.id || '(missing-id)'
    const requiredFields: Array<keyof Recipe> = [
      'id',
      'name',
      'emoji',
      'category',
      'calories',
      'time',
      'ingredients',
      'steps',
      'nutrition',
    ]

    if (ids.has(recipe.id)) {
      duplicateIds.push(recipe.id)
    }
    ids.set(recipe.id, recipe)

    categoryCounts[recipe.category] = (categoryCounts[recipe.category] || 0) + 1

    for (const field of requiredFields) {
      if (recipe[field] === undefined || recipe[field] === null || recipe[field] === '') {
        missingRequiredFields.push({ recipeId, field })
      }
    }

    if (!Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0) {
      missingRequiredFields.push({ recipeId, field: 'ingredients[]' })
    }

    if (!Array.isArray(recipe.steps) || recipe.steps.length === 0) {
      missingRequiredFields.push({ recipeId, field: 'steps[]' })
    }

    if (!Number.isFinite(recipe.calories) || recipe.calories <= 0) {
      suspiciousCalories.push({
        recipeId,
        calories: recipe.calories,
        reason: 'calories must be a positive number',
      })
    } else if (recipe.calories < 30 || recipe.calories > 1200) {
      suspiciousCalories.push({
        recipeId,
        calories: recipe.calories,
        reason: 'calories outside expected range 30-1200 kcal',
      })
    }

    for (const macro of ['protein', 'carbs', 'fat'] as const) {
      if (!Number.isFinite(recipe.nutrition?.[macro]) || recipe.nutrition[macro] < 0) {
        invalidNutrition.push({
          recipeId,
          reason: `${macro} must be a non-negative number`,
        })
      }
    }

    if (recipe.nutrition && Number.isFinite(recipe.calories) && recipe.calories > 0) {
      const macroCalories = getMacroCalories(recipe)
      const variance = Math.abs(macroCalories - recipe.calories) / recipe.calories

      if (variance > 0.35) {
        invalidNutrition.push({
          recipeId,
          reason: `macro calories ${Math.round(macroCalories)} differ from calories ${recipe.calories} by ${Math.round(variance * 100)}%`,
        })
      }
    }
  }

  const status = duplicateIds.length > 0 ||
    missingRequiredFields.length > 0 ||
    invalidNutrition.length > 0 ||
    suspiciousCalories.length > 0
    ? 'warning'
    : 'passed'

  return {
    generatedAt,
    totalRecipes: recipes.length,
    duplicateIds,
    missingRequiredFields,
    invalidNutrition,
    suspiciousCalories,
    categoryCounts,
    status,
  }
}
