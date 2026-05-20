import type { Recipe } from '../data/recipes'
import {
  applyRecipeCalibrationOverlay,
  getRecipeCalibrationCacheGeneration,
} from './recipeCalibration'
import { emitDietLogUpdated } from './events'

const CUSTOM_FOODS_KEY = 'diet-agent-custom-foods'

export interface CustomFood extends Recipe {
  source: 'manual' | 'ai_estimated'
  createdAt: string
  updatedAt: string
}

function cloneCustomFood(food: CustomFood): CustomFood {
  return {
    ...food,
    ingredients: food.ingredients.map((ingredient) => ({ ...ingredient })),
    steps: [...food.steps],
    nutrition: { ...food.nutrition },
  }
}

function readCustomFoods(): CustomFood[] {
  try {
    const raw = localStorage.getItem(CUSTOM_FOODS_KEY)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .filter((item): item is CustomFood => typeof item === 'object' && item !== null && typeof (item as CustomFood).id === 'string')
      .map(cloneCustomFood)
  } catch (error) {
    console.error('Failed to load custom foods:', error)
    return []
  }
}

interface RecipeIndexCache {
  baseRef: Recipe[]
  calibrationGeneration: number
  merged: Recipe[]
  byId: Map<string, Recipe>
}

let recipeIndexCache: RecipeIndexCache | null = null

function invalidateRecipeIndexCache(): void {
  recipeIndexCache = null
}

function getRecipeIndex(baseRecipes: Recipe[]): RecipeIndexCache {
  const calibrationGeneration = getRecipeCalibrationCacheGeneration()
  if (
    recipeIndexCache &&
    recipeIndexCache.baseRef === baseRecipes &&
    recipeIndexCache.calibrationGeneration === calibrationGeneration
  ) {
    return recipeIndexCache
  }

  const baseEffective = baseRecipes.map((recipe) => applyRecipeCalibrationOverlay(recipe))
  const customs = readCustomFoods()
  const byId = new Map<string, Recipe>()
  for (const recipe of baseEffective) {
    byId.set(recipe.id, recipe)
  }
  for (const recipe of customs) {
    byId.set(recipe.id, recipe)
  }

  const merged = [...baseEffective, ...customs]
  recipeIndexCache = { baseRef: baseRecipes, calibrationGeneration, merged, byId }
  return recipeIndexCache
}

function writeCustomFoods(foods: CustomFood[]): void {
  localStorage.setItem(CUSTOM_FOODS_KEY, JSON.stringify(foods.map(cloneCustomFood)))
  invalidateRecipeIndexCache()
}

function toCustomFoodId(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return `custom-${normalized || Date.now()}`
}

export function getCustomFoods(): CustomFood[] {
  return readCustomFoods()
}

export function getAllRecipesWithCustomFoods(baseRecipes: Recipe[]): Recipe[] {
  return [...getRecipeIndex(baseRecipes).merged]
}

export function findRecipeByIdWithCustomFoods(baseRecipes: Recipe[], recipeId: string): Recipe | undefined {
  return getRecipeIndex(baseRecipes).byId.get(recipeId)
}

export function saveCustomFood(input: {
  id?: string
  name: string
  emoji?: string
  category?: string
  calories: number
  protein: number
  carbs: number
  fat: number
  ingredients?: Array<{ name: string; amount: string }>
  steps?: string[]
  source?: CustomFood['source']
}): CustomFood {
  const foods = readCustomFoods()
  const normalizedName = input.name.trim()
  const resolvedId = input.id?.trim() || toCustomFoodId(normalizedName)
  const existing = foods.find((food) => {
    if (food.id === resolvedId) {
      return true
    }

    return food.name.trim().toLowerCase() === normalizedName.toLowerCase()
  })
  const timestamp = new Date().toISOString()
  const customFood: CustomFood = {
    id: existing?.id || resolvedId,
    name: normalizedName,
    emoji: input.emoji?.trim() || existing?.emoji || '🍽️',
    category: input.category?.trim() || existing?.category || '自定义',
    calories: Math.round(input.calories),
    time: 1,
    ingredients: input.ingredients && input.ingredients.length > 0
      ? input.ingredients.map((ingredient) => ({ ...ingredient }))
      : [{ name: normalizedName, amount: '1份' }],
    steps: input.steps && input.steps.length > 0
      ? [...input.steps]
      : ['这是用户自定义食物，用于记录实际摄入。'],
    nutrition: {
      protein: Math.round(input.protein * 10) / 10,
      carbs: Math.round(input.carbs * 10) / 10,
      fat: Math.round(input.fat * 10) / 10,
    },
    source: input.source ?? existing?.source ?? 'manual',
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  }

  const nextFoods = existing
    ? foods.map((food) => (food.id === customFood.id ? customFood : food))
    : [...foods, customFood]

  writeCustomFoods(nextFoods)
  emitDietLogUpdated('custom-foods')
  return cloneCustomFood(customFood)
}
