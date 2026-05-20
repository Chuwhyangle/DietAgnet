import { chineseRecipes } from './chineseRecipes'
import { westernRecipes } from './westernRecipes'
import type { Recipe } from './recipeTypes'

export type { Ingredient, Nutrition, Recipe } from './recipeTypes'

// Unified recipe export - 130 recipes: 100 Chinese + 30 Western.
export const recipes: Recipe[] = [
  ...chineseRecipes,
  ...westernRecipes,
]
