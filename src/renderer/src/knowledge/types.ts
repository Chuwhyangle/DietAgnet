export type KnowledgeRecordType = 'food_nutrition' | 'guideline' | 'cooking_tip'

export interface FoodNutritionFacts {
  calories: number
  protein: number
  carbs: number
  fat: number
  servingSize: string
}

export interface KnowledgeRecord {
  id: string
  type: KnowledgeRecordType
  title: string
  aliases: string[]
  summary: string
  tags: string[]
  facts?: FoodNutritionFacts
  source: 'local_seed'
  updatedAt: string
}

export interface KnowledgeSearchResult {
  record: KnowledgeRecord
  score: number
  matchedTerms: string[]
}

export interface FoodCriteria {
  maxCalories?: number
  minProtein?: number
  maxFat?: number
  tags?: string[]
  limit?: number
}
