export interface Ingredient {
  name: string
  amount: string
}

export interface Nutrition {
  protein: number  // grams
  carbs: number    // grams
  fat: number      // grams
}

export interface Recipe {
  id: string
  name: string
  emoji: string
  category: string
  calories: number
  time: number       // minutes
  ingredients: Ingredient[]
  steps: string[]
  nutrition: Nutrition
}

export interface RecipeSeed {
  id: string
  name: string
  emoji: string
  category: string
  calories: number
  time: number
  ingredients: Array<[string, string]>
  steps: string[]
  nutrition: Nutrition
}

export function buildRecipe(seed: RecipeSeed): Recipe {
  return {
    id: seed.id,
    name: seed.name,
    emoji: seed.emoji,
    category: seed.category,
    calories: seed.calories,
    time: seed.time,
    ingredients: seed.ingredients.map(([name, amount]) => ({ name, amount })),
    steps: [...seed.steps],
    nutrition: { ...seed.nutrition },
  }
}
