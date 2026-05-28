import type { AppLanguage } from '../stores/settings'
import type { Ingredient, Recipe } from './recipeTypes'

export interface RecipeTranslation {
  name: string
  category: string
  ingredients: Ingredient[]
  steps: string[]
}

export const categoryTranslationsEn: Record<string, string> = {
  快手菜: 'Quick Dishes',
  汤羹: 'Soups',
  主食: 'Staples',
  凉菜: 'Cold Dishes',
  炒菜: 'Stir-Fries',
  蒸菜: 'Steamed Dishes',
  甜品: 'Desserts',
  早餐: 'Breakfast',
  西式: 'Western',
  自定义: 'Custom',
}

const recipeNameOverrides: Record<string, string> = {
  'tomato-egg': 'Tomato Scrambled Eggs',
  'garlic-lettuce': 'Garlic Lettuce',
  'scrambled-egg-chive': 'Chive Scrambled Eggs',
  'vinegar-potato': 'Vinegar Potato Shreds',
  'cucumber-egg': 'Cucumber Scrambled Eggs',
  'oyster-sauce-mushroom': 'Oyster Sauce Mushrooms',
  'spicy-cabbage': 'Hand-Torn Spicy Cabbage',
  'egg-fried-rice': 'Egg Fried Rice',
  'kung-pao-chicken': 'Kung Pao Chicken',
  'mapo-tofu': 'Mapo Tofu',
  'twice-cooked-pork': 'Twice-Cooked Pork',
  'sweet-sour-pork': 'Sweet and Sour Pork Tenderloin',
  'fish-flavored-shredded': 'Yu-Shiang Shredded Pork',
  'pepper-steak': 'Beef with Green Peppers',
  'dry-fried-beans': 'Dry-Fried Green Beans',
  'shrimp-broccoli': 'Shrimp and Broccoli',
  'tomato-egg-soup': 'Tomato Egg Drop Soup',
  'seaweed-egg-soup': 'Seaweed Egg Drop Soup',
  'winter-melon-soup': 'Winter Melon Pork Rib Soup',
  'corn-rib-soup': 'Corn Pork Rib Soup',
  'miso-soup': 'Miso Soup',
  congee: 'Century Egg and Pork Congee',
  'steamed-egg': 'Steamed Egg Custard',
  'white-rice': 'Steamed Rice',
  banana: 'Banana',
  apple: 'Apple',
  'plain-milk': 'Plain Milk',
  'plain-yogurt': 'Plain Yogurt',
  'protein-bar': 'Protein Bar',
  'potato-chips': 'Potato Chips',
  'mixed-nuts-snack': 'Mixed Nuts',
  'dark-chocolate': 'Dark Chocolate',
  'ice-cream-cup': 'Ice Cream',
}

const ingredientTranslations: Record<string, string> = {
  番茄: 'tomatoes',
  西红柿: 'tomatoes',
  鸡蛋: 'eggs',
  葱: 'scallions',
  盐: 'salt',
  糖: 'sugar',
  生菜: 'lettuce',
  蒜: 'garlic',
  蚝油: 'oyster sauce',
  韭菜: 'chives',
  土豆: 'potatoes',
  干辣椒: 'dried chilies',
  醋: 'vinegar',
  黄瓜: 'cucumber',
  香菇: 'shiitake mushrooms',
  包菜: 'cabbage',
  隔夜饭: 'cooked rice',
  酱油: 'soy sauce',
  鸡胸肉: 'chicken breast',
  花生米: 'peanuts',
  葱姜蒜: 'scallion, ginger, and garlic',
  淀粉: 'starch',
  嫩豆腐: 'soft tofu',
  老豆腐: 'firm tofu',
  豆腐: 'tofu',
  肉末: 'minced pork',
  豆瓣酱: 'doubanjiang chili bean paste',
  花椒粉: 'Sichuan pepper powder',
  五花肉: 'pork belly',
  青椒: 'green peppers',
  蒜苗: 'garlic sprouts',
  豆豉: 'fermented black beans',
  猪里脊: 'pork tenderloin',
  番茄酱: 'ketchup',
  猪肉丝: 'shredded pork',
  木耳: 'wood ear mushrooms',
  胡萝卜: 'carrot',
  姜蒜: 'ginger and garlic',
  牛肉: 'beef',
  四季豆: 'green beans',
  虾仁: 'shrimp',
  西兰花: 'broccoli',
  料酒: 'Shaoxing wine',
  紫菜: 'seaweed',
  虾皮: 'dried shrimp',
  香油: 'sesame oil',
  排骨: 'pork ribs',
  冬瓜: 'winter melon',
  姜: 'ginger',
  枸杞: 'goji berries',
  玉米: 'corn',
  白菜: 'napa cabbage',
  白萝卜: 'daikon radish',
  丝瓜: 'luffa',
  蛤蜊: 'clams',
  海带: 'kelp',
  海带丝: 'kelp strips',
  大米: 'rice',
  小米: 'millet',
  面条: 'noodles',
  面粉: 'flour',
  酵母: 'yeast',
  红茶: 'black tea',
  八角: 'star anise',
  桂皮: 'cinnamon bark',
  腰果: 'cashews',
  彩椒: 'bell peppers',
  茄子: 'eggplant',
  大虾: 'prawns',
  白胡椒粉: 'white pepper',
  干木耳: 'dried wood ear mushrooms',
  辣椒油: 'chili oil',
  香菜: 'cilantro',
  芝麻: 'sesame seeds',
  荷兰豆: 'snow peas',
  孜然: 'cumin',
  菠萝: 'pineapple',
  花菜: 'cauliflower',
  西芹: 'celery',
  百合: 'lily bulbs',
  鳕鱼: 'cod',
  南瓜: 'pumpkin',
  鸡腿: 'chicken thigh',
  荷叶: 'lotus leaf',
  糯米: 'glutinous rice',
  银耳: 'snow fungus',
  莲子: 'lotus seeds',
  酒酿: 'fermented rice',
  牛奶: 'milk',
  芒果: 'mango',
  西米: 'sago',
  红豆: 'red beans',
  椰奶: 'coconut milk',
  燕麦: 'oats',
  黄豆: 'soybeans',
  水: 'water',
  温水: 'warm water',
  黑芝麻馅: 'black sesame filling',
  糯米粉: 'glutinous rice flour',
  红薯: 'sweet potatoes',
  红糖: 'brown sugar',
  香蕉: 'banana',
  苹果: 'apple',
  纯牛奶: 'plain milk',
  原味酸奶: 'plain yogurt',
}

function titleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function translateAmount(amount: string): string {
  return amount
    .replace(/适量/g, 'to taste')
    .replace(/少许/g, 'a little')
    .replace(/半颗/g, '1/2 head')
    .replace(/半根/g, '1/2 piece')
    .replace(/半块/g, '1/2 block')
    .replace(/一小把/g, 'a small handful')
    .replace(/一整头/g, '1 whole bulb')
    .replace(/几片/g, 'a few slices')
    .replace(/(\d+)个/g, '$1')
    .replace(/(\d+)根/g, '$1 stalks')
    .replace(/(\d+)颗/g, '$1 head')
    .replace(/(\d+)瓣/g, '$1 cloves')
    .replace(/(\d+)勺/g, '$1 tbsp')
    .replace(/(\d+)包/g, '$1 bags')
    .replace(/(\d+)碗/g, '$1 bowl')
    .replace(/一碗/g, '1 bowl')
    .replace(/一块/g, '1 block')
}

function translateIngredient(ingredient: Ingredient, index: number): Ingredient {
  const translatedName = ingredientTranslations[ingredient.name] ?? (
    /[\u3400-\u9fff]/.test(ingredient.name) ? `Ingredient ${index + 1}` : ingredient.name
  )

  return {
    name: translatedName,
    amount: translateAmount(ingredient.amount),
  }
}

function buildEnglishSteps(recipe: Recipe, name: string): string[] {
  const genericSteps = [
    `Prepare and portion the ingredients for ${name}.`,
    'Cook the main ingredients until tender and fragrant.',
    'Add seasonings gradually and adjust to taste.',
    'Finish cooking, plate neatly, and serve warm.',
  ]

  return recipe.steps.map((step, index) => (
    /[\u3400-\u9fff]/.test(step) ? genericSteps[index % genericSteps.length] : step
  ))
}

export function getLocalizedCategory(category: string, language: AppLanguage): string {
  if (language === 'zh') {
    return category
  }

  return categoryTranslationsEn[category] ?? category
}

export function getLocalizedRecipeName(recipe: Recipe, language: AppLanguage): string {
  if (language === 'zh') {
    return recipe.name
  }

  return recipeNameOverrides[recipe.id] ?? titleCase(recipe.id)
}

export function localizeRecipe(recipe: Recipe, language: AppLanguage): Recipe {
  if (language === 'zh') {
    return recipe
  }

  const name = getLocalizedRecipeName(recipe, language)
  return {
    ...recipe,
    name,
    category: getLocalizedCategory(recipe.category, language),
    ingredients: recipe.ingredients.map(translateIngredient),
    steps: buildEnglishSteps(recipe, name),
  }
}

export function recipeSearchText(recipe: Recipe, language: AppLanguage): string {
  const localized = localizeRecipe(recipe, language)
  return [
    recipe.name,
    recipe.category,
    ...recipe.ingredients.map((ingredient) => ingredient.name),
    localized.name,
    localized.category,
    ...localized.ingredients.map((ingredient) => ingredient.name),
  ].join(' ').toLowerCase()
}

