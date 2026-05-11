// 饮食记录本地存储

import dayjs from 'dayjs'
import type { Recipe } from '../data/recipes'
import { emitDietLogUpdated } from './events'

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export interface MealTypeOption {
  value: MealType
  label: string
  emoji: string
}

export const mealTypeOptions: MealTypeOption[] = [
  { value: 'breakfast', label: '🌅 早餐', emoji: '🌅' },
  { value: 'lunch', label: '☀️ 午餐', emoji: '☀️' },
  { value: 'dinner', label: '🌙 晚餐', emoji: '🌙' },
  { value: 'snack', label: '🍪 加餐', emoji: '🍪' },
]

export const mealTypeLabels: Record<MealType, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '加餐',
}

export interface MealItem {
  recipeId: string
  name: string
  emoji?: string
  servings: number
  calories: number
  protein: number
  carbs: number
  fat: number
}

export interface Meal {
  type: MealType
  items: MealItem[]
}

export interface DietLog {
  date: string // YYYY-MM-DD
  meals: Meal[]
}

const LOG_PREFIX = 'diet-agent-log-'

export interface NutritionSummary {
  calories: number
  protein: number
  carbs: number
  fat: number
  mealCount: number
  itemCount: number
}

export interface WeeklyDietReportDay extends NutritionSummary {
  date: string
  weekdayLabel: string
  hasLog: boolean
  goalHit: boolean
}

export interface WeeklyDietReport {
  startDate: string
  endDate: string
  days: WeeklyDietReportDay[]
  totals: NutritionSummary
  averagePerDay: NutritionSummary
  averagePerLoggedDay: NutritionSummary
  loggedDays: number
  completionRate: number
  highestCalorieDay: WeeklyDietReportDay | null
  lowestCalorieDay: WeeklyDietReportDay | null
  calorieGoal?: number
  goalHitDays: number
}

const weekDayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

function createEmptyNutritionSummary(): NutritionSummary {
  return {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    mealCount: 0,
    itemCount: 0,
  }
}

function roundToSingleDecimal(value: number): number {
  return Math.round(value * 10) / 10
}

function divideNutritionSummary(summary: NutritionSummary, divisor: number): NutritionSummary {
  if (divisor <= 0) {
    return createEmptyNutritionSummary()
  }

  return {
    calories: Math.round(summary.calories / divisor),
    protein: Math.round(summary.protein / divisor),
    carbs: Math.round(summary.carbs / divisor),
    fat: Math.round(summary.fat / divisor),
    mealCount: roundToSingleDecimal(summary.mealCount / divisor),
    itemCount: roundToSingleDecimal(summary.itemCount / divisor),
  }
}

function isDietLogPopulated(log: DietLog | null | undefined): boolean {
  return Boolean(log && log.meals.some((meal) => meal.items.length > 0))
}

function isCalorieGoalHit(calories: number, calorieGoal?: number): boolean {
  if (!calorieGoal || calorieGoal <= 0 || calories <= 0) {
    return false
  }

  const minCalories = calorieGoal * 0.9
  const maxCalories = calorieGoal * 1.1

  return calories >= minCalories && calories <= maxCalories
}

function pickCalorieExtremumDay(
  days: WeeklyDietReportDay[],
  mode: 'highest' | 'lowest',
): WeeklyDietReportDay | null {
  const loggedDays = days.filter((day) => day.hasLog)
  if (loggedDays.length === 0) {
    return null
  }

  return loggedDays.reduce<WeeklyDietReportDay>((selectedDay, currentDay) => {
    if (mode === 'highest') {
      return currentDay.calories > selectedDay.calories ? currentDay : selectedDay
    }

    return currentDay.calories < selectedDay.calories ? currentDay : selectedDay
  }, loggedDays[0])
}

function cloneDietLog(log: DietLog): DietLog {
  return {
    date: log.date,
    meals: log.meals.map((meal) => ({
      type: meal.type,
      items: meal.items.map((item) => ({ ...item })),
    })),
  }
}

export function createEmptyDietLog(date: string): DietLog {
  return {
    date,
    meals: [],
  }
}

export function getDietLog(date: string): DietLog | null {
  try {
    const raw = localStorage.getItem(LOG_PREFIX + date)
    if (raw) {
      return cloneDietLog(JSON.parse(raw) as DietLog)
    }
  } catch (error) {
    console.error('Failed to load diet log:', error)
  }
  return null
}

export function getTodayLog(): DietLog | null {
  return getDietLog(dayjs().format('YYYY-MM-DD'))
}

export function saveDietLog(log: DietLog): void {
  const normalizedLog = cloneDietLog(log)
  localStorage.setItem(LOG_PREFIX + normalizedLog.date, JSON.stringify(normalizedLog))
  emitDietLogUpdated(normalizedLog.date)
}

export function getLogsForRange(startDate: string, endDate: string): DietLog[] {
  const logs: DietLog[] = []
  let current = dayjs(startDate)
  const end = dayjs(endDate)

  while (current.isBefore(end) || current.isSame(end)) {
    const log = getDietLog(current.format('YYYY-MM-DD'))
    if (log) {
      logs.push(log)
    }
    current = current.add(1, 'day')
  }

  return logs
}

export function getWeekBounds(date: string): { startDate: string; endDate: string } {
  const parsedDate = dayjs(date)
  const baseDate = parsedDate.isValid() ? parsedDate : dayjs()
  const dayOfWeek = baseDate.day()
  const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const start = baseDate.startOf('day').subtract(offset, 'day')

  return {
    startDate: start.format('YYYY-MM-DD'),
    endDate: start.add(6, 'day').format('YYYY-MM-DD'),
  }
}

export function getWeeklyDietReport(date: string, calorieGoal?: number): WeeklyDietReport {
  const { startDate, endDate } = getWeekBounds(date)
  const logs = getLogsForRange(startDate, endDate)
  const logsByDate = new Map(logs.map((log) => [log.date, log]))
  const weekStart = dayjs(startDate)

  const days = Array.from({ length: 7 }, (_, index) => {
    const currentDate = weekStart.add(index, 'day').format('YYYY-MM-DD')
    const log = logsByDate.get(currentDate) ?? null
    const summary = summarizeDietLog(log)
    const hasLog = isDietLogPopulated(log) && summary.itemCount > 0

    return {
      date: currentDate,
      weekdayLabel: weekDayLabels[index],
      hasLog,
      goalHit: hasLog && isCalorieGoalHit(summary.calories, calorieGoal),
      ...summary,
    }
  })

  const totals = days.reduce<NutritionSummary>((summary, day) => {
    summary.calories += day.calories
    summary.protein += day.protein
    summary.carbs += day.carbs
    summary.fat += day.fat
    summary.mealCount += day.mealCount
    summary.itemCount += day.itemCount
    return summary
  }, createEmptyNutritionSummary())
  const loggedDays = days.filter((day) => day.hasLog).length
  const goalHitDays = days.filter((day) => day.goalHit).length

  return {
    startDate,
    endDate,
    days,
    totals,
    averagePerDay: divideNutritionSummary(totals, 7),
    averagePerLoggedDay: divideNutritionSummary(totals, loggedDays),
    loggedDays,
    completionRate: Math.round((loggedDays / 7) * 100),
    highestCalorieDay: pickCalorieExtremumDay(days, 'highest'),
    lowestCalorieDay: pickCalorieExtremumDay(days, 'lowest'),
    calorieGoal,
    goalHitDays,
  }
}

export function createMealItemFromRecipe(recipe: Recipe, servings = 1): MealItem {
  return {
    recipeId: recipe.id,
    name: recipe.name,
    emoji: recipe.emoji,
    servings,
    calories: Math.round(recipe.calories * servings),
    protein: Math.round(recipe.nutrition.protein * servings),
    carbs: Math.round(recipe.nutrition.carbs * servings),
    fat: Math.round(recipe.nutrition.fat * servings),
  }
}

export function addRecipeToDietLog(params: {
  date: string
  mealType: MealType
  recipe: Recipe
  servings?: number
}): DietLog {
  const { date, mealType, recipe, servings = 1 } = params
  const currentLog = getDietLog(date) ?? createEmptyDietLog(date)
  const nextLog = cloneDietLog(currentLog)
  const mealItem = createMealItemFromRecipe(recipe, servings)
  const existingMeal = nextLog.meals.find((meal) => meal.type === mealType)

  if (existingMeal) {
    existingMeal.items.push(mealItem)
  } else {
    nextLog.meals.push({
      type: mealType,
      items: [mealItem],
    })
  }

  saveDietLog(nextLog)
  return nextLog
}

export function removeMealItemFromDietLog(params: {
  date: string
  mealType: MealType
  itemIndex: number
}): DietLog | null {
  const { date, mealType, itemIndex } = params
  const currentLog = getDietLog(date)
  if (!currentLog) {
    return null
  }

  const nextLog = cloneDietLog(currentLog)
  const meal = nextLog.meals.find((entry) => entry.type === mealType)
  if (!meal || itemIndex < 0 || itemIndex >= meal.items.length) {
    return null
  }

  meal.items.splice(itemIndex, 1)
  nextLog.meals = nextLog.meals.filter((entry) => entry.items.length > 0)

  saveDietLog(nextLog)
  return nextLog
}

export function summarizeDietLog(log: DietLog | null | undefined): NutritionSummary {
  if (!log) {
    return createEmptyNutritionSummary()
  }

  return log.meals.reduce<NutritionSummary>(
    (summary, meal) => {
      summary.mealCount += 1
      summary.itemCount += meal.items.length

      meal.items.forEach((item) => {
        summary.calories += item.calories
        summary.protein += item.protein
        summary.carbs += item.carbs
        summary.fat += item.fat
      })

      return summary
    },
    createEmptyNutritionSummary(),
  )
}

export function summarizeDietLogs(logs: DietLog[]): NutritionSummary {
  return logs.reduce<NutritionSummary>(
    (summary, log) => {
      const current = summarizeDietLog(log)
      summary.calories += current.calories
      summary.protein += current.protein
      summary.carbs += current.carbs
      summary.fat += current.fat
      summary.mealCount += current.mealCount
      summary.itemCount += current.itemCount
      return summary
    },
    createEmptyNutritionSummary(),
  )
}
