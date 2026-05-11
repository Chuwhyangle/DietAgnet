import dayjs from 'dayjs'
import {
  type AgentToolDefinition,
  type AgentToolInvocation,
} from '../../../shared/agent'
import { recipes, type Recipe } from '../data/recipes'
import {
  addRecipeToDietLog,
  getDietLog,
  getTodayLog,
  getWeeklyDietReport,
  mealTypeLabels,
  removeMealItemFromDietLog,
  summarizeDietLog,
  type MealType,
} from '../stores/dietLog'
import { getSettings, saveSettings } from '../stores/settings'

type AgentPage = 'home' | 'recipes' | 'diet-log' | 'chat' | 'settings'

export interface LocalToolExecutionContext {
  navigate?: (path: string) => void
}

const PAGE_PATHS: Record<AgentPage, string> = {
  home: '/',
  recipes: '/recipes',
  'diet-log': '/diet-log',
  chat: '/chat',
  settings: '/settings',
}

const toolDefinitions: AgentToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_today_nutrition',
      description: '获取今天的营养摄入汇总。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_diet_log',
      description: '获取指定日期的饮食记录。',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: '日期，格式 YYYY-MM-DD。',
          },
        },
        required: ['date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_week_summary',
      description: '获取本周或指定周的营养汇总。',
      parameters: {
        type: 'object',
        properties: {
          startDate: {
            type: 'string',
            description: '可选，指定一周开始日期，格式 YYYY-MM-DD。',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_recipe',
      description: '按关键词搜索菜谱，可搜索菜名、分类和食材。',
      parameters: {
        type: 'object',
        properties: {
          keyword: {
            type: 'string',
            description: '搜索关键词。',
          },
        },
        required: ['keyword'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_recipe_detail',
      description: '获取某道菜谱的详情。',
      parameters: {
        type: 'object',
        properties: {
          recipeId: {
            type: 'string',
            description: '菜谱 ID。',
          },
        },
        required: ['recipeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_recipes_by_category',
      description: '根据分类获取菜谱列表。',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: '分类名称，如 炒菜 / 汤羹 / 主食。',
          },
        },
        required: ['category'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_settings',
      description: '获取当前用户设置。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_meal',
      description: '添加一条饮食记录。',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: '日期，格式 YYYY-MM-DD。',
          },
          mealType: {
            type: 'string',
            enum: ['breakfast', 'lunch', 'dinner', 'snack'],
            description: '餐次类型。',
          },
          recipeId: {
            type: 'string',
            description: '菜谱 ID。',
          },
          servings: {
            type: 'number',
            description: '份数，默认 1。',
          },
        },
        required: ['date', 'mealType', 'recipeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_meal_item',
      description: '删除饮食记录中的某一项。',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: '日期，格式 YYYY-MM-DD。',
          },
          mealType: {
            type: 'string',
            enum: ['breakfast', 'lunch', 'dinner', 'snack'],
            description: '餐次类型。',
          },
          itemIndex: {
            type: 'number',
            description: '要删除的项目索引，从 0 开始。',
          },
        },
        required: ['date', 'mealType', 'itemIndex'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_settings',
      description: '更新用户昵称或卡路里目标。',
      parameters: {
        type: 'object',
        properties: {
          nickname: {
            type: 'string',
            description: '新的昵称。',
          },
          calorieGoal: {
            type: 'number',
            description: '新的每日卡路里目标。',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recommend_recipe',
      description: '根据条件推荐菜谱。',
      parameters: {
        type: 'object',
        properties: {
          preference: {
            type: 'string',
            description: '偏好关键词，例如 鸡肉 / 清淡 / 汤。',
          },
          maxCalories: {
            type: 'number',
            description: '最大卡路里限制。',
          },
          category: {
            type: 'string',
            description: '菜谱分类。',
          },
          excludeIds: {
            type: 'array',
            items: {
              type: 'string',
            },
            description: '需要排除的菜谱 ID。',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_nutrition_balance',
      description: '分析今天或本周的营养均衡情况。',
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            enum: ['today', 'week'],
            description: '分析周期。',
          },
        },
        required: ['period'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'navigate_to',
      description: '打开应用内的某个页面。',
      parameters: {
        type: 'object',
        properties: {
          page: {
            type: 'string',
            enum: ['home', 'recipes', 'diet-log', 'chat', 'settings'],
            description: '页面标识。',
          },
        },
        required: ['page'],
      },
    },
  },
]

function toKeyword(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function toPositiveNumber(value: unknown, fallback = 1): number {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback
}

function isMealType(value: unknown): value is MealType {
  return value === 'breakfast' || value === 'lunch' || value === 'dinner' || value === 'snack'
}

function searchRecipes(keyword: string): Recipe[] {
  const normalizedKeyword = toKeyword(keyword)
  if (!normalizedKeyword) {
    return recipes.slice(0, 8)
  }

  return recipes
    .filter((recipe) => {
      const searchPool = [
        recipe.name,
        recipe.category,
        ...recipe.ingredients.map((ingredient) => ingredient.name),
      ]

      return searchPool.some((value) => value.toLowerCase().includes(normalizedKeyword))
    })
    .slice(0, 8)
}

function pickRecipeById(recipeId: unknown): Recipe {
  const recipe = recipes.find((entry) => entry.id === recipeId)
  if (!recipe) {
    throw new Error('没有找到对应的菜谱。')
  }
  return recipe
}

function getMacroRatios(calories: number, protein: number, carbs: number, fat: number): {
  proteinRatio: number
  carbsRatio: number
  fatRatio: number
} {
  const proteinCalories = protein * 4
  const carbsCalories = carbs * 4
  const fatCalories = fat * 9
  const totalMacroCalories = proteinCalories + carbsCalories + fatCalories

  if (calories <= 0 || totalMacroCalories <= 0) {
    return {
      proteinRatio: 0,
      carbsRatio: 0,
      fatRatio: 0,
    }
  }

  return {
    proteinRatio: proteinCalories / totalMacroCalories,
    carbsRatio: carbsCalories / totalMacroCalories,
    fatRatio: fatCalories / totalMacroCalories,
  }
}

function buildNutritionSuggestions(
  summary: ReturnType<typeof summarizeDietLog>,
  calorieGoal: number,
  period: 'today' | 'week',
  trackedDays: number,
): string[] {
  const suggestions: string[] = []
  const baselineCalories = period === 'week' && trackedDays > 0
    ? Math.round(summary.calories / trackedDays)
    : summary.calories

  if (summary.mealCount === 0) {
    suggestions.push('先记录一餐吧，猫猫虫才能继续帮你分析喵。')
    return suggestions
  }

  if (baselineCalories < calorieGoal * 0.7) {
    suggestions.push('整体热量偏低，可以适当补一点优质主食或蛋白质。')
  } else if (baselineCalories > calorieGoal * 1.1) {
    suggestions.push('整体热量略高，下一餐可以清淡一点。')
  }

  const { proteinRatio, carbsRatio, fatRatio } = getMacroRatios(
    summary.calories,
    summary.protein,
    summary.carbs,
    summary.fat,
  )

  if (proteinRatio < 0.16) {
    suggestions.push('蛋白质占比偏低，可以多选鸡蛋、豆腐、鱼虾或鸡胸肉。')
  }

  if (fatRatio > 0.35) {
    suggestions.push('脂肪占比偏高，少一点油炸或重油菜会更稳妥。')
  }

  if (carbsRatio > 0.6) {
    suggestions.push('碳水占比偏高，搭配更多蔬菜和蛋白质会更均衡。')
  }

  if (summary.mealCount < Math.max(3, trackedDays)) {
    suggestions.push('记录餐次偏少，尽量把三餐都记上，统计会更准确。')
  }

  return suggestions.length > 0 ? suggestions : ['整体搭配比较稳，可以继续保持这个节奏。']
}

function buildRecommendationReason(
  recipe: Recipe,
  params: {
    preference?: string
    maxCalories?: number
    category?: string
  },
): string {
  const reasons: string[] = []

  if (params.preference) {
    reasons.push(`和「${params.preference}」偏好匹配`)
  }

  if (params.category) {
    reasons.push(`属于 ${recipe.category}`)
  }

  if (params.maxCalories) {
    reasons.push(`约 ${recipe.calories} kcal`)
  } else {
    reasons.push(`热量约 ${recipe.calories} kcal`)
  }

  return reasons.join('，')
}

function formatToolStatusContent(toolName: string, args: Record<string, unknown>, result: unknown): string {
  switch (toolName) {
    case 'add_meal':
      return `🔧 已帮你记录${mealTypeLabels[args.mealType as MealType] ?? '餐次'}`
    case 'remove_meal_item':
      return `🧹 已删除${mealTypeLabels[args.mealType as MealType] ?? '餐次'}中的一项记录`
    case 'update_settings':
      return '⚙️ 已同步你的设置'
    case 'navigate_to':
      return '🧭 已帮你打开对应页面'
    case 'get_today_nutrition':
      return '📊 已整理今天的营养汇总'
    case 'get_diet_log':
      return `📝 已读取 ${String(args.date ?? '')} 的饮食记录`
    case 'get_week_summary':
      return '📅 已整理本周饮食汇总'
    case 'search_recipe':
      return `🔎 已搜索和「${String(args.keyword ?? '')}」相关的菜谱`
    case 'get_recipe_detail':
      return '🍳 已找到对应菜谱详情'
    case 'get_recipes_by_category':
      return `📚 已整理 ${String(args.category ?? '')} 分类菜谱`
    case 'get_settings':
      return '👤 已读取当前设置'
    case 'recommend_recipe':
      return '🍽️ 已挑好几道适合你的菜谱'
    case 'analyze_nutrition_balance':
      return `📈 已分析${args.period === 'week' ? '本周' : '今天'}的营养情况`
    default:
      return `🔧 已执行工具 ${toolName}`
  }
}

export const AGENT_TOOLS = toolDefinitions

export function describeToolExecution(toolCall: AgentToolInvocation, result: unknown): string {
  return formatToolStatusContent(toolCall.name, toolCall.arguments, result)
}

export async function executeToolCall(
  toolCall: AgentToolInvocation,
  context: LocalToolExecutionContext,
): Promise<unknown> {
  const args = toolCall.arguments ?? {}
  const settings = getSettings()

  switch (toolCall.name) {
    case 'get_today_nutrition': {
      const summary = summarizeDietLog(getTodayLog())
      return {
        ...summary,
        date: dayjs().format('YYYY-MM-DD'),
      }
    }

    case 'get_diet_log': {
      const date = String(args.date ?? '').trim()
      if (!date) {
        throw new Error('缺少 date 参数。')
      }

      return {
        date,
        meals: getDietLog(date)?.meals ?? [],
      }
    }

    case 'get_week_summary': {
      const baseDate = String(args.startDate ?? dayjs().format('YYYY-MM-DD')).trim() || dayjs().format('YYYY-MM-DD')
      return getWeeklyDietReport(baseDate, settings.calorieGoal)
    }

    case 'search_recipe': {
      const keyword = String(args.keyword ?? '').trim()
      return searchRecipes(keyword).map((recipe) => ({
        id: recipe.id,
        name: recipe.name,
        emoji: recipe.emoji,
        category: recipe.category,
        calories: recipe.calories,
        nutrition: recipe.nutrition,
      }))
    }

    case 'get_recipe_detail': {
      const recipe = pickRecipeById(args.recipeId)
      return {
        ...recipe,
      }
    }

    case 'get_recipes_by_category': {
      const category = String(args.category ?? '').trim()
      if (!category) {
        throw new Error('缺少 category 参数。')
      }

      return recipes
        .filter((recipe) => recipe.category === category)
        .map((recipe) => ({
          id: recipe.id,
          name: recipe.name,
          emoji: recipe.emoji,
          calories: recipe.calories,
          nutrition: recipe.nutrition,
        }))
    }

    case 'get_settings': {
      return {
        nickname: settings.nickname,
        calorieGoal: settings.calorieGoal,
        agentProvider: settings.agent.provider,
      }
    }

    case 'add_meal': {
      const date = String(args.date ?? '').trim()
      const mealType = args.mealType
      if (!date || !isMealType(mealType)) {
        throw new Error('date 或 mealType 参数无效。')
      }

      const recipe = pickRecipeById(args.recipeId)
      const nextLog = addRecipeToDietLog({
        date,
        mealType,
        recipe,
        servings: toPositiveNumber(args.servings, 1),
      })
      const summary = summarizeDietLog(nextLog)

      return {
        success: true,
        totalCalories: summary.calories,
        mealType,
        recipeName: recipe.name,
        servings: toPositiveNumber(args.servings, 1),
      }
    }

    case 'remove_meal_item': {
      const date = String(args.date ?? '').trim()
      const mealType = args.mealType
      const itemIndex = Number(args.itemIndex)

      if (!date || !isMealType(mealType) || !Number.isInteger(itemIndex)) {
        throw new Error('remove_meal_item 参数无效。')
      }

      const nextLog = removeMealItemFromDietLog({
        date,
        mealType,
        itemIndex,
      })

      if (!nextLog) {
        throw new Error('没有找到要删除的记录。')
      }

      return {
        success: true,
        date,
        mealType,
        itemIndex,
      }
    }

    case 'update_settings': {
      const nextSettings = {
        ...settings,
        nickname: typeof args.nickname === 'string' ? args.nickname : settings.nickname,
        calorieGoal: typeof args.calorieGoal === 'number' ? args.calorieGoal : settings.calorieGoal,
      }

      saveSettings(nextSettings)

      return {
        success: true,
        nickname: nextSettings.nickname,
        calorieGoal: nextSettings.calorieGoal,
      }
    }

    case 'recommend_recipe': {
      const preference = String(args.preference ?? '').trim()
      const maxCalories = args.maxCalories ? Number(args.maxCalories) : undefined
      const category = String(args.category ?? '').trim()
      const excludeIds = Array.isArray(args.excludeIds)
        ? args.excludeIds.map((item) => String(item))
        : []
      const preferenceKeyword = toKeyword(preference)

      const candidates = recipes
        .filter((recipe) => {
          if (maxCalories && recipe.calories > maxCalories) {
            return false
          }

          if (category && recipe.category !== category) {
            return false
          }

          if (excludeIds.includes(recipe.id)) {
            return false
          }

          return true
        })
        .map((recipe) => {
          let score = 0
          if (!preferenceKeyword) {
            score += 1
          } else {
            if (recipe.name.toLowerCase().includes(preferenceKeyword)) {
              score += 4
            }

            if (recipe.category.toLowerCase().includes(preferenceKeyword)) {
              score += 3
            }

            if (recipe.ingredients.some((ingredient) => ingredient.name.toLowerCase().includes(preferenceKeyword))) {
              score += 2
            }
          }

          if (maxCalories && recipe.calories <= maxCalories) {
            score += 1
          }

          return { recipe, score }
        })
        .sort((left, right) => {
          if (right.score !== left.score) {
            return right.score - left.score
          }
          return left.recipe.calories - right.recipe.calories
        })
        .slice(0, 5)

      return candidates.map(({ recipe }) => ({
        id: recipe.id,
        name: recipe.name,
        emoji: recipe.emoji,
        calories: recipe.calories,
        category: recipe.category,
        reason: buildRecommendationReason(recipe, {
          preference: preference || undefined,
          maxCalories,
          category: category || undefined,
        }),
      }))
    }

    case 'analyze_nutrition_balance': {
      const period = args.period === 'week' ? 'week' : 'today'
      const calorieGoal = settings.calorieGoal ?? 2000

      if (period === 'today') {
        const summary = summarizeDietLog(getTodayLog())
        return {
          period,
          summary: `今天一共摄入 ${summary.calories} kcal，蛋白质 ${summary.protein}g，碳水 ${summary.carbs}g，脂肪 ${summary.fat}g。`,
          suggestions: buildNutritionSuggestions(summary, calorieGoal, 'today', 1),
        }
      }

      const weeklyReport = getWeeklyDietReport(dayjs().format('YYYY-MM-DD'), calorieGoal)
      const summary = weeklyReport.totals
      const averageCalories = weeklyReport.averagePerDay.calories

      return {
        period,
        summary: `本周累计 ${summary.calories} kcal，日均约 ${averageCalories} kcal，蛋白质累计 ${summary.protein}g。`,
        suggestions: buildNutritionSuggestions(summary, calorieGoal, 'week', weeklyReport.loggedDays),
        report: {
          startDate: weeklyReport.startDate,
          endDate: weeklyReport.endDate,
          loggedDays: weeklyReport.loggedDays,
          completionRate: weeklyReport.completionRate,
          goalHitDays: weeklyReport.goalHitDays,
        },
      }
    }

    case 'navigate_to': {
      const page = args.page as AgentPage
      const path = PAGE_PATHS[page]
      if (!path) {
        throw new Error('无效的页面标识。')
      }

      if (context.navigate) {
        context.navigate(path)
      } else {
        window.location.hash = path
      }

      return {
        success: true,
        page,
        path,
      }
    }

    default:
      throw new Error(`未知工具：${toolCall.name}`)
  }
}
