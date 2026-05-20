import dayjs from 'dayjs'
import {
  type AgentToolDefinition,
  type AgentToolInvocation,
} from '../../../shared/agent'
import { recipes, type Recipe } from '../data/recipes'
import { validateRecipes } from '../data/recipeValidation'
import {
  addMealItemToDietLog,
  addRecipeToDietLog,
  createMealItemFromNutrition,
  getDietLog,
  getTodayLog,
  getWeeklyDietReport,
  mealTypeLabels,
  removeMealItemFromDietLog,
  summarizeDietLog,
  type MealType,
} from '../stores/dietLog'
import {
  findRecipeByIdWithCustomFoods,
  getAllRecipesWithCustomFoods,
  saveCustomFood,
} from '../stores/customFoods'
import {
  getLatestPersonalDietPlan,
  getRecentProactiveEvents,
  updateDailyPlanAdjustmentResponse,
  savePlannedMeal,
  getPlannedMealsForDate,
  updatePlannedMealStatus,
  deletePlannedMeal,
  type PlannedMealItem,
  type PlannedMealStatus,
} from '../stores/planning'
import { getSettings, saveSettings } from '../stores/settings'
import { evaluateDailyPlanAdjustment, getDailyPlanGap } from '../planning/dynamicPlan'
import {
  forget,
  listUserFacts,
  recall,
  remember,
  updateMemoryConfidence,
} from '../memory/manager'
import {
  findFoodsByCriteria,
  getGuidelineAdvice,
  lookupFoodNutrition,
  searchKnowledgeBase,
} from '../knowledge/retriever'
import {
  createRecipeCalibrationRecord,
  getRecipeCalibrationRecords,
  getRecipeCalibrationSummary,
  updateRecipeCalibrationStatus,
  type RecipeCalibrationStatus,
} from '../stores/recipeCalibration'
import type { UserMemoryType } from '../stores/planning'
import { buildRhythmSummaryStructured, formatRhythmSummaryForPrompt } from '../habits/rhythmSummary'

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
      name: 'get_current_plan',
      description: '读取当前最新的正式饮食计划和热量/宏量目标。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_today_plan_gap',
      description: '比较指定日期的计划目标与实际摄入，返回当天剩余热量和各餐偏差。',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: '可选，日期，格式 YYYY-MM-DD，默认今天。',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'suggest_plan_adjustment',
      description: '根据当天计划偏差生成补餐或减餐建议，并写入本地审计记录。',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: '可选，日期，格式 YYYY-MM-DD，默认今天。',
          },
          mealType: {
            type: 'string',
            enum: ['breakfast', 'lunch', 'dinner', 'snack'],
            description: '可选，指定要检查的餐次。不填时检查当天总摄入。',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'record_adjustment_response',
      description: '记录用户对动态计划建议的响应，例如采纳、忽略或稍后提醒。',
      parameters: {
        type: 'object',
        properties: {
          adjustmentId: {
            type: 'number',
            description: '动态计划建议记录 ID。',
          },
          response: {
            type: 'string',
            enum: ['accepted', 'dismissed', 'snoozed'],
            description: '用户响应。',
          },
        },
        required: ['adjustmentId', 'response'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_proactive_event_history',
      description: '查询近期主动提醒历史，包括触发规则、消息、时间和用户响应。',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: '可选，返回数量，默认 8。',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_reminder_preferences',
      description: '更新主动提醒偏好，包括总开关、餐次提醒、动态计划建议、周报提醒、记录后对话/桌面摘要、静音时段和冷却时间。',
      parameters: {
        type: 'object',
        properties: {
          enabled: {
            type: 'boolean',
            description: '主动提醒总开关。',
          },
          mealReminders: {
            type: 'boolean',
            description: '餐次未记录提醒开关。',
          },
          planAdjustmentReminders: {
            type: 'boolean',
            description: '动态计划建议提醒开关。',
          },
          weeklyReportReminders: {
            type: 'boolean',
            description: '周报提醒开关。',
          },
          postLogGapSummaryInChat: {
            type: 'boolean',
            description: '是否在记录饮食后向 AI 对话追加当日与计划偏差摘要。',
          },
          postLogGapDesktopNotify: {
            type: 'boolean',
            description: '是否在记录饮食后发送桌面通知（受总开关与静音时段影响）。',
          },
          quietStartHour: {
            type: 'number',
            description: '静音开始小时，0-23。',
          },
          quietEndHour: {
            type: 'number',
            description: '静音结束小时，0-23。',
          },
          cooldownHours: {
            type: 'number',
            description: '同类提醒冷却小时，1-24。',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'validate_recipe_library',
      description: '校验当前菜谱库的数据质量，检查重复 ID、缺失字段、异常热量、宏量营养偏差和分类统计。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'estimate_recipe_nutrition',
      description: '把模型估算出的菜谱热量和宏量营养写入待审核校准记录；不会直接修改正式菜谱数据。',
      parameters: {
        type: 'object',
        properties: {
          recipeId: {
            type: 'string',
            description: '要校准的菜谱 ID。',
          },
          estimatedCalories: {
            type: 'number',
            description: '估算总热量，单位 kcal。',
          },
          estimatedProtein: {
            type: 'number',
            description: '估算蛋白质，单位克。',
          },
          estimatedCarbs: {
            type: 'number',
            description: '估算碳水，单位克。',
          },
          estimatedFat: {
            type: 'number',
            description: '估算脂肪，单位克。',
          },
          reasoning: {
            type: 'string',
            description: '估算依据，必须说明主要食材、份量假设和热量变化原因。',
          },
          confidence: {
            type: 'number',
            description: '置信度，0 到 1。',
          },
          riskNotes: {
            type: 'array',
            items: {
              type: 'string',
            },
            description: '风险备注，例如份量不确定、油量不确定、烹饪方式差异等。',
          },
          model: {
            type: 'string',
            description: '可选，执行估算的模型名称。',
          },
        },
        required: [
          'recipeId',
          'estimatedCalories',
          'estimatedProtein',
          'estimatedCarbs',
          'estimatedFat',
          'reasoning',
          'confidence',
        ],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_recipe_calibrations',
      description: '查看菜谱热量校准审计记录，可按菜谱或状态筛选。',
      parameters: {
        type: 'object',
        properties: {
          recipeId: {
            type: 'string',
            description: '可选，指定菜谱 ID。',
          },
          status: {
            type: 'string',
            enum: ['pending', 'approved', 'rejected', 'needs_review'],
            description: '可选，筛选审核状态。',
          },
          limit: {
            type: 'number',
            description: '可选，返回数量，默认 10。',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'review_recipe_calibration',
      description: '更新菜谱热量校准记录的审核状态；只更新审计记录，不直接覆盖正式菜谱。',
      parameters: {
        type: 'object',
        properties: {
          calibrationId: {
            type: 'number',
            description: '校准记录 ID。',
          },
          status: {
            type: 'string',
            enum: ['pending', 'approved', 'rejected', 'needs_review'],
            description: '新的审核状态。',
          },
          reviewerNote: {
            type: 'string',
            description: '可选，审核备注。',
          },
        },
        required: ['calibrationId', 'status'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remember',
      description: '记录用户明确表达的长期事实，例如偏好、过敏、忌口、作息、习惯、健康备注或目标。',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['preference', 'allergy', 'avoidance', 'habit', 'schedule', 'health_note', 'goal', 'other'],
            description: '记忆类型。',
          },
          content: {
            type: 'string',
            description: '要记住的事实，必须来自用户明确表达或确认。',
          },
          tags: {
            type: 'array',
            items: {
              type: 'string',
            },
            description: '可选标签，例如 花生 / 晚餐 / 辣 / 早餐。',
          },
          confidence: {
            type: 'number',
            description: '置信度，0 到 1。用户明确表达通常为 0.8 以上。',
          },
        },
        required: ['type', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recall',
      description: '按文本、类型或标签召回长期记忆，用于推荐、提醒和计划建议前检查偏好/忌口。',
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: '可选，查询文本。',
          },
          types: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['preference', 'allergy', 'avoidance', 'habit', 'schedule', 'health_note', 'goal', 'other'],
            },
            description: '可选，记忆类型筛选。',
          },
          tags: {
            type: 'array',
            items: {
              type: 'string',
            },
            description: '可选，标签筛选。',
          },
          limit: {
            type: 'number',
            description: '可选，返回数量，默认 8。',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'forget',
      description: '删除或归档一条长期记忆，适合用户纠正旧偏好、过敏或习惯时使用。',
      parameters: {
        type: 'object',
        properties: {
          memoryId: {
            type: 'number',
            description: '记忆 ID。',
          },
          reason: {
            type: 'string',
            description: '可选，删除原因。',
          },
        },
        required: ['memoryId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_user_facts',
      description: '列出当前已保存的长期记忆事实，可用于设置页、用户核对或纠错。',
      parameters: {
        type: 'object',
        properties: {
          types: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['preference', 'allergy', 'avoidance', 'habit', 'schedule', 'health_note', 'goal', 'other'],
            },
          },
          tags: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
          includeArchived: {
            type: 'boolean',
            description: '是否包含已归档记忆。',
          },
          limit: {
            type: 'number',
            description: '可选，返回数量，默认 50。',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_user_rhythm_summary',
      description:
        '读取过去若干天内本地饮食日志聚合的「记录节奏」摘要：有记录天数占比、各餐次记录频率、工作日记录覆盖、常见食物出现次数等；用于个性化建议，不作医学判断。',
      parameters: {
        type: 'object',
        properties: {
          lookbackDays: {
            type: 'number',
            description: '可选，统计天数，默认 14，范围 7~30。',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_memory_confidence',
      description: '更新一条长期记忆的置信度，适合用户确认或质疑某条记忆时使用。',
      parameters: {
        type: 'object',
        properties: {
          memoryId: {
            type: 'number',
            description: '记忆 ID。',
          },
          confidence: {
            type: 'number',
            description: '新的置信度，0 到 1。',
          },
        },
        required: ['memoryId', 'confidence'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_knowledgebase',
      description: '搜索本地轻量知识库，覆盖常见食物营养、动态计划处理原则和安全边界；第一阶段使用词法检索，不加载大体积 embedding 模型。',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索问题或关键词。',
          },
          limit: {
            type: 'number',
            description: '可选，返回数量，默认 6。',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'lookup_food_nutrition',
      description: '查询常见食物的每份热量和宏量营养估算，用于聊天回答、补餐建议和菜谱搭配。',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: '食物名称，例如 鸡胸肉 / 米饭 / 鸡蛋。',
          },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_foods_by_criteria',
      description: '按营养条件查找常见食物，例如低热量、高蛋白、低脂或适合加餐。',
      parameters: {
        type: 'object',
        properties: {
          maxCalories: {
            type: 'number',
            description: '可选，每份最高热量。',
          },
          minProtein: {
            type: 'number',
            description: '可选，每份最低蛋白质克数。',
          },
          maxFat: {
            type: 'number',
            description: '可选，每份最高脂肪克数。',
          },
          tags: {
            type: 'array',
            items: {
              type: 'string',
            },
            description: '可选标签，例如 加餐 / 低脂 / 蛋白质 / 主食。',
          },
          limit: {
            type: 'number',
            description: '可选，返回数量，默认 6。',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_guideline_advice',
      description: '查询本地饮食建议原则，例如计划偏差、晚餐清淡、蛋白质优先级和健康安全边界。',
      parameters: {
        type: 'object',
        properties: {
          topic: {
            type: 'string',
            description: '建议主题或用户问题。',
          },
        },
        required: ['topic'],
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
      name: 'add_custom_food_meal',
      description: '记录一个菜谱库中暂时没有的食物。适合用户说出食物名称、份量和大致做法后，由 AI 先估算每份热量和宏量营养，再保存到本地自定义食物并写入当天饮食记录。',
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
          name: {
            type: 'string',
            description: '食物名称，例如 牛奶 / 饭团 / 辣条。',
          },
          servings: {
            type: 'number',
            description: '份数，默认 1。',
          },
          calories: {
            type: 'number',
            description: '按 1 份估算的热量，单位 kcal。',
          },
          protein: {
            type: 'number',
            description: '按 1 份估算的蛋白质，单位克。',
          },
          carbs: {
            type: 'number',
            description: '按 1 份估算的碳水，单位克。',
          },
          fat: {
            type: 'number',
            description: '按 1 份估算的脂肪，单位克。',
          },
          emoji: {
            type: 'string',
            description: '可选，食物图标。',
          },
          category: {
            type: 'string',
            description: '可选，分类名称，默认 自定义。',
          },
          notes: {
            type: 'string',
            description: '可选，补充说明，例如品牌、做法或估算依据。',
          },
        },
        required: ['date', 'mealType', 'name', 'calories', 'protein', 'carbs', 'fat'],
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
  {
    type: 'function',
    function: {
      name: 'suggest_meal_plan',
      description: '为指定日期的某一餐生成 AI 推荐的计划用餐方案（从菜谱库选菜或自定义食物），返回建议列表供用户确认。',
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
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                recipeId: {
                  type: 'string',
                  description: '可选，菜谱 ID。如果是菜谱库里的菜就填。',
                },
                name: {
                  type: 'string',
                  description: '食物名称。',
                },
                emoji: {
                  type: 'string',
                  description: '可选，食物图标。',
                },
                servings: {
                  type: 'number',
                  description: '份数，默认 1。',
                },
                estimatedCalories: {
                  type: 'number',
                  description: '估算热量 kcal。',
                },
                estimatedProtein: {
                  type: 'number',
                  description: '估算蛋白质克数。',
                },
                estimatedCarbs: {
                  type: 'number',
                  description: '估算碳水克数。',
                },
                estimatedFat: {
                  type: 'number',
                  description: '估算脂肪克数。',
                },
              },
              required: ['name', 'servings', 'estimatedCalories', 'estimatedProtein', 'estimatedCarbs', 'estimatedFat'],
            },
            description: '建议的食物列表。',
          },
          reasoning: {
            type: 'string',
            description: '推荐理由，说明为什么选这些菜。',
          },
        },
        required: ['date', 'mealType', 'items', 'reasoning'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'confirm_meal_plan',
      description: '用户确认或跳过一条计划用餐建议。确认后该计划会参与当天的计划 vs 实际对比。',
      parameters: {
        type: 'object',
        properties: {
          plannedMealId: {
            type: 'number',
            description: '计划用餐记录 ID。',
          },
          action: {
            type: 'string',
            enum: ['confirm', 'skip', 'delete'],
            description: '用户操作：confirm 确认采纳，skip 跳过不吃，delete 删除该建议。',
          },
        },
        required: ['plannedMealId', 'action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_meal_plans',
      description: '获取指定日期的所有计划用餐（包括 AI 建议和手动添加的）。',
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

function toFiniteNumber(value: unknown, fieldName: string): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    throw new Error(`${fieldName} 必须是有效数字。`)
  }
  return numeric
}

function isRecipeCalibrationStatus(value: unknown): value is RecipeCalibrationStatus {
  return value === 'pending' ||
    value === 'approved' ||
    value === 'rejected' ||
    value === 'needs_review'
}

function isUserMemoryType(value: unknown): value is UserMemoryType {
  return value === 'preference' ||
    value === 'allergy' ||
    value === 'avoidance' ||
    value === 'habit' ||
    value === 'schedule' ||
    value === 'health_note' ||
    value === 'goal' ||
    value === 'other'
}

function toMemoryTypes(value: unknown): UserMemoryType[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const types = value.filter(isUserMemoryType)
  return types.length > 0 ? types : undefined
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : []
}

function toOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function toOptionalBoundedInteger(value: unknown, min: number, max: number): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined
  }

  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return undefined
  }

  return Math.min(Math.max(Math.round(numeric), min), max)
}

function getRecipeCollection(): Recipe[] {
  return getAllRecipesWithCustomFoods(recipes)
}

function searchRecipes(keyword: string): Recipe[] {
  const recipeCollection = getRecipeCollection()
  const normalizedKeyword = toKeyword(keyword)
  if (!normalizedKeyword) {
    return recipeCollection.slice(0, 8)
  }

  return recipeCollection
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
  const recipe = findRecipeByIdWithCustomFoods(recipes, String(recipeId))
  if (!recipe) {
    throw new Error('没有找到对应的菜谱或自定义食物。')
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
    case 'add_custom_food_meal':
      return `🥣 已按估算结果记录${mealTypeLabels[args.mealType as MealType] ?? '餐次'}里的自定义食物`
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
    case 'get_current_plan':
      return '📋 已读取当前专属计划'
    case 'check_today_plan_gap':
      return '🧮 已检查今天的计划差值'
    case 'suggest_plan_adjustment':
      return '🐛 已生成一条动态计划建议'
    case 'record_adjustment_response':
      return '📝 已记录你对动态建议的反馈'
    case 'get_proactive_event_history':
      return '🔔 已读取近期主动提醒历史'
    case 'update_reminder_preferences':
      return '🔕 已更新主动提醒偏好'
    case 'validate_recipe_library':
      return '🧪 已完成菜谱数据质量校验'
    case 'estimate_recipe_nutrition':
      return '🧾 已生成一条待审核菜谱热量校准记录'
    case 'list_recipe_calibrations':
      return '📚 已读取菜谱校准审计记录'
    case 'review_recipe_calibration':
      return '✅ 已更新菜谱校准审核状态'
    case 'remember':
      return '🧠 已记住这条长期偏好'
    case 'recall':
      return '🧠 已召回相关长期记忆'
    case 'forget':
      return '🗑️ 已归档这条长期记忆'
    case 'list_user_facts':
      return '📒 已读取当前长期记忆'
    case 'get_user_rhythm_summary':
      return '📈 已汇总近期饮食记录节奏'
    case 'update_memory_confidence':
      return '🧠 已更新记忆置信度'
    case 'search_knowledgebase':
      return '已检索本地知识库'
    case 'lookup_food_nutrition':
      return '已查询食物营养估算'
    case 'find_foods_by_criteria':
      return '已按营养条件筛选食物'
    case 'get_guideline_advice':
      return '已读取饮食建议原则'
    case 'suggest_meal_plan':
      return '🍽️ 已生成一份计划用餐建议'
    case 'confirm_meal_plan':
      return '✅ 已更新计划用餐状态'
    case 'get_meal_plans':
      return `📋 已读取 ${String(args.date ?? '')} 的计划用餐`
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

      return getRecipeCollection()
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

    case 'add_custom_food_meal': {
      const date = String(args.date ?? '').trim()
      const mealType = args.mealType
      const name = String(args.name ?? '').trim()
      if (!date || !isMealType(mealType) || !name) {
        throw new Error('date、mealType 或 name 参数无效。')
      }

      const servings = toPositiveNumber(args.servings, 1)
      const calories = toFiniteNumber(args.calories, 'calories')
      const protein = toFiniteNumber(args.protein, 'protein')
      const carbs = toFiniteNumber(args.carbs, 'carbs')
      const fat = toFiniteNumber(args.fat, 'fat')
      const category = typeof args.category === 'string' && args.category.trim() ? args.category.trim() : '自定义'
      const emoji = typeof args.emoji === 'string' && args.emoji.trim() ? args.emoji.trim() : '🍽️'
      const notes = typeof args.notes === 'string' && args.notes.trim() ? args.notes.trim() : undefined

      const customFood = saveCustomFood({
        name,
        emoji,
        category,
        calories,
        protein,
        carbs,
        fat,
        source: 'ai_estimated',
        ingredients: [{ name, amount: '1份' }],
        steps: [notes ?? '由 AI 根据用户描述做了保守估算，供后续继续记录参考。'],
      })

      const mealItem = createMealItemFromNutrition({
        recipeId: customFood.id,
        name: customFood.name,
        emoji: customFood.emoji,
        servings,
        calories: customFood.calories,
        protein: customFood.nutrition.protein,
        carbs: customFood.nutrition.carbs,
        fat: customFood.nutrition.fat,
      })

      const nextLog = addMealItemToDietLog({
        date,
        mealType,
        item: mealItem,
      })
      const summary = summarizeDietLog(nextLog)

      return {
        success: true,
        date,
        mealType,
        servings,
        recipeName: customFood.name,
        customFood,
        totalCalories: summary.calories,
        estimated: true,
      }
    }

    case 'remove_meal_item': {
      const date = String(args.date ?? '').trim()
      const mealType = args.mealType
      const itemIndex = Number(args.itemIndex)

      if (!date || !isMealType(mealType) || !Number.isInteger(itemIndex)) {
        throw new Error('remove_meal_item \u53c2\u6570\u65e0\u6548\u3002')
      }

      const previousLog = getDietLog(date)
      const previousMeal = previousLog?.meals.find((entry) => entry.type === mealType)
      if (!previousMeal || itemIndex < 0 || itemIndex >= previousMeal.items.length) {
        throw new Error('没有找到要删除的记录。')
      }

      const nextLog = removeMealItemFromDietLog({
        date,
        mealType,
        itemIndex,
      })

      return {
        success: true,
        date,
        mealType,
        itemIndex,
        dateCleared: nextLog === null,
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

      const candidates = getRecipeCollection()
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

    case 'get_current_plan': {
      const latestPlan = await getLatestPersonalDietPlan()
      return {
        plan: latestPlan,
        fallbackCalorieGoal: settings.calorieGoal,
      }
    }

    case 'check_today_plan_gap': {
      const date = String(args.date ?? dayjs().format('YYYY-MM-DD')).trim() || dayjs().format('YYYY-MM-DD')
      const gap = await getDailyPlanGap(date)
      return {
        date,
        gap,
        available: Boolean(gap),
      }
    }

    case 'suggest_plan_adjustment': {
      const date = String(args.date ?? dayjs().format('YYYY-MM-DD')).trim() || dayjs().format('YYYY-MM-DD')
      const mealType = isMealType(args.mealType) ? args.mealType : undefined
      const result = await evaluateDailyPlanAdjustment({
        date,
        mealType,
        persist: true,
        generatedBy: 'agent',
      })

      return {
        date,
        mealType,
        gap: result.gap,
        suggestion: result.suggestion,
        savedAdjustment: result.savedAdjustment,
        saved: Boolean(result.savedAdjustment),
      }
    }

    case 'record_adjustment_response': {
      const adjustmentId = Number(args.adjustmentId)
      const response = String(args.response ?? '')

      if (!Number.isInteger(adjustmentId) || !['accepted', 'dismissed', 'snoozed'].includes(response)) {
        throw new Error('record_adjustment_response 参数无效。')
      }

      const updatedAdjustment = await updateDailyPlanAdjustmentResponse(
        adjustmentId,
        response as 'accepted' | 'dismissed' | 'snoozed',
      )

      if (!updatedAdjustment) {
        throw new Error('没有找到对应的动态计划建议。')
      }

      return {
        success: true,
        adjustment: updatedAdjustment,
      }
    }

    case 'get_proactive_event_history': {
      const limit = Number.isFinite(Number(args.limit)) ? Number(args.limit) : 8
      return {
        events: await getRecentProactiveEvents(limit),
      }
    }

    case 'update_reminder_preferences': {
      const quietStartHour = toOptionalBoundedInteger(args.quietStartHour, 0, 23)
      const quietEndHour = toOptionalBoundedInteger(args.quietEndHour, 0, 23)
      const cooldownHours = toOptionalBoundedInteger(args.cooldownHours, 1, 24)
      const nextSettings = {
        ...settings,
        reminders: {
          ...settings.reminders,
          enabled: toOptionalBoolean(args.enabled) ?? settings.reminders.enabled,
          mealReminders: toOptionalBoolean(args.mealReminders) ?? settings.reminders.mealReminders,
          planAdjustmentReminders: toOptionalBoolean(args.planAdjustmentReminders) ??
            settings.reminders.planAdjustmentReminders,
          weeklyReportReminders: toOptionalBoolean(args.weeklyReportReminders) ??
            settings.reminders.weeklyReportReminders,
          postLogGapSummaryInChat: toOptionalBoolean(args.postLogGapSummaryInChat) ??
            settings.reminders.postLogGapSummaryInChat,
          postLogGapDesktopNotify: toOptionalBoolean(args.postLogGapDesktopNotify) ??
            settings.reminders.postLogGapDesktopNotify,
          quietStartHour: quietStartHour ?? settings.reminders.quietStartHour,
          quietEndHour: quietEndHour ?? settings.reminders.quietEndHour,
          cooldownHours: cooldownHours ?? settings.reminders.cooldownHours,
        },
      }

      saveSettings(nextSettings)

      return {
        success: true,
        reminders: nextSettings.reminders,
      }
    }

    case 'validate_recipe_library': {
      return validateRecipes(getRecipeCollection())
    }

    case 'estimate_recipe_nutrition': {
      const recipe = pickRecipeById(args.recipeId)
      const estimatedCalories = toFiniteNumber(args.estimatedCalories, 'estimatedCalories')
      const estimatedProtein = toFiniteNumber(args.estimatedProtein, 'estimatedProtein')
      const estimatedCarbs = toFiniteNumber(args.estimatedCarbs, 'estimatedCarbs')
      const estimatedFat = toFiniteNumber(args.estimatedFat, 'estimatedFat')
      const confidence = toFiniteNumber(args.confidence, 'confidence')
      const reasoning = String(args.reasoning ?? '').trim()

      if (!reasoning) {
        throw new Error('估算依据不能为空。')
      }

      const record = createRecipeCalibrationRecord(recipe, {
        estimatedCalories,
        estimatedNutrition: {
          protein: estimatedProtein,
          carbs: estimatedCarbs,
          fat: estimatedFat,
        },
        reasoning,
        confidence,
        riskNotes: Array.isArray(args.riskNotes)
          ? args.riskNotes.map((item) => String(item))
          : [],
        source: 'llm_estimate',
        model: typeof args.model === 'string' ? args.model : settings.agent.model,
      })

      return {
        success: true,
        record,
        sourceRecipeFileUnchanged: true,
      }
    }

    case 'list_recipe_calibrations': {
      const status = isRecipeCalibrationStatus(args.status) ? args.status : undefined
      const recipeId = typeof args.recipeId === 'string' && args.recipeId.trim()
        ? args.recipeId.trim()
        : undefined

      return {
        summary: getRecipeCalibrationSummary(),
        records: getRecipeCalibrationRecords({
          recipeId,
          status,
          limit: Number.isFinite(Number(args.limit)) ? Number(args.limit) : 10,
        }),
      }
    }

    case 'review_recipe_calibration': {
      const calibrationId = Number(args.calibrationId)
      const status = args.status

      if (!Number.isInteger(calibrationId) || !isRecipeCalibrationStatus(status)) {
        throw new Error('review_recipe_calibration 参数无效。')
      }

      const record = updateRecipeCalibrationStatus({
        id: calibrationId,
        status,
        reviewerNote: typeof args.reviewerNote === 'string' ? args.reviewerNote : undefined,
      })

      if (!record) {
        throw new Error('没有找到对应的菜谱校准记录。')
      }

      return {
        success: true,
        record,
        sourceRecipeFileUnchanged: true,
        runtimeNutritionOverlay:
          status === 'approved'
            ? '已通过：应用内读取菜谱时会使用本条 estimated 热量与宏量；将状态改为拒绝或需复核可收回。'
            : '未生效：仅「已通过」状态会参与应用内营养覆盖。',
      }
    }

    case 'remember': {
      if (!isUserMemoryType(args.type)) {
        throw new Error('remember 的 type 参数无效。')
      }

      const result = await remember({
        type: args.type,
        content: String(args.content ?? ''),
        tags: toStringArray(args.tags),
        source: 'user_explicit',
        confidence: Number.isFinite(Number(args.confidence)) ? Number(args.confidence) : 0.85,
      })

      return {
        success: true,
        ...result,
      }
    }

    case 'recall': {
      return {
        memories: await recall({
          text: typeof args.text === 'string' ? args.text : undefined,
          types: toMemoryTypes(args.types),
          tags: toStringArray(args.tags),
          limit: Number.isFinite(Number(args.limit)) ? Number(args.limit) : 8,
        }),
      }
    }

    case 'forget': {
      const memoryId = Number(args.memoryId)
      if (!Number.isInteger(memoryId)) {
        throw new Error('forget 的 memoryId 参数无效。')
      }

      const memory = await forget(memoryId, typeof args.reason === 'string' ? args.reason : undefined)
      return {
        success: true,
        memory,
      }
    }

    case 'list_user_facts': {
      return {
        memories: await listUserFacts({
          types: toMemoryTypes(args.types),
          tags: toStringArray(args.tags),
          includeArchived: args.includeArchived === true,
          limit: Number.isFinite(Number(args.limit)) ? Number(args.limit) : 50,
        }),
      }
    }

    case 'get_user_rhythm_summary': {
      const raw = Number(args.lookbackDays)
      const lookbackDays = Number.isFinite(raw)
        ? Math.min(30, Math.max(7, Math.floor(raw)))
        : 14
      const structured = buildRhythmSummaryStructured(lookbackDays)
      return {
        lookbackDays,
        structured,
        promptSummary: formatRhythmSummaryForPrompt(structured),
      }
    }

    case 'update_memory_confidence': {
      const memoryId = Number(args.memoryId)
      const confidence = Number(args.confidence)
      if (!Number.isInteger(memoryId) || !Number.isFinite(confidence)) {
        throw new Error('update_memory_confidence 参数无效。')
      }

      const memory = await updateMemoryConfidence(memoryId, confidence)
      return {
        success: true,
        memory,
      }
    }

    case 'search_knowledgebase': {
      const query = String(args.query ?? '').trim()
      if (!query) {
        throw new Error('search_knowledgebase 缺少 query 参数。')
      }

      return {
        query,
        mode: 'lexical_local',
        results: searchKnowledgeBase(
          query,
          Number.isFinite(Number(args.limit)) ? Number(args.limit) : undefined,
        ).map((result) => ({
          id: result.record.id,
          type: result.record.type,
          title: result.record.title,
          summary: result.record.summary,
          tags: result.record.tags,
          facts: result.record.facts,
          score: result.score,
          matchedTerms: result.matchedTerms,
          source: result.record.source,
          updatedAt: result.record.updatedAt,
        })),
      }
    }

    case 'lookup_food_nutrition': {
      const name = String(args.name ?? '').trim()
      if (!name) {
        throw new Error('lookup_food_nutrition 缺少 name 参数。')
      }

      const record = lookupFoodNutrition(name)
      return {
        query: name,
        found: Boolean(record),
        record,
      }
    }

    case 'find_foods_by_criteria': {
      return {
        foods: findFoodsByCriteria({
          maxCalories: Number.isFinite(Number(args.maxCalories)) ? Number(args.maxCalories) : undefined,
          minProtein: Number.isFinite(Number(args.minProtein)) ? Number(args.minProtein) : undefined,
          maxFat: Number.isFinite(Number(args.maxFat)) ? Number(args.maxFat) : undefined,
          tags: toStringArray(args.tags),
          limit: Number.isFinite(Number(args.limit)) ? Number(args.limit) : undefined,
        }),
      }
    }

    case 'get_guideline_advice': {
      const topic = String(args.topic ?? '').trim()
      if (!topic) {
        throw new Error('get_guideline_advice 缺少 topic 参数。')
      }

      return {
        topic,
        guidelines: getGuidelineAdvice(topic),
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

    case 'suggest_meal_plan': {
      const date = String(args.date ?? '').trim()
      const mealType = args.mealType
      if (!date || !isMealType(mealType)) {
        throw new Error('date 或 mealType 参数无效。')
      }

      const rawItems = Array.isArray(args.items) ? args.items : []
      if (rawItems.length === 0) {
        throw new Error('items 不能为空。')
      }

      const items: PlannedMealItem[] = rawItems.map((item: Record<string, unknown>) => ({
        recipeId: typeof item.recipeId === 'string' ? item.recipeId : undefined,
        name: String(item.name ?? ''),
        emoji: typeof item.emoji === 'string' ? item.emoji : undefined,
        servings: toPositiveNumber(item.servings, 1),
        estimatedCalories: toFiniteNumber(item.estimatedCalories, 'estimatedCalories'),
        estimatedProtein: toFiniteNumber(item.estimatedProtein, 'estimatedProtein'),
        estimatedCarbs: toFiniteNumber(item.estimatedCarbs, 'estimatedCarbs'),
        estimatedFat: toFiniteNumber(item.estimatedFat, 'estimatedFat'),
      }))

      const totalCalories = items.reduce((sum, item) => sum + item.estimatedCalories * item.servings, 0)
      const totalProtein = items.reduce((sum, item) => sum + item.estimatedProtein * item.servings, 0)
      const totalCarbs = items.reduce((sum, item) => sum + item.estimatedCarbs * item.servings, 0)
      const totalFat = items.reduce((sum, item) => sum + item.estimatedFat * item.servings, 0)

      const savedMeal = await savePlannedMeal({
        date,
        mealType,
        items,
        totalCalories: Math.round(totalCalories),
        totalProtein: Math.round(totalProtein),
        totalCarbs: Math.round(totalCarbs),
        totalFat: Math.round(totalFat),
        source: 'ai_suggested',
        status: 'suggested',
        reasoning: typeof args.reasoning === 'string' ? args.reasoning : undefined,
        suggestedByModel: settings.agent.model,
      })

      return {
        success: true,
        plannedMeal: savedMeal,
        hint: '已生成建议，等待用户确认。用户说"好的"或"就这样吧"时请调用 confirm_meal_plan 确认。',
      }
    }

    case 'confirm_meal_plan': {
      const plannedMealId = Number(args.plannedMealId)
      const action = String(args.action ?? '')

      if (!Number.isInteger(plannedMealId)) {
        throw new Error('plannedMealId 参数无效。')
      }

      if (action === 'delete') {
        const deleted = await deletePlannedMeal(plannedMealId)
        if (!deleted) {
          throw new Error('没有找到对应的计划用餐记录。')
        }
        return { success: true, action: 'deleted' }
      }

      const statusMap: Record<string, PlannedMealStatus> = {
        confirm: 'confirmed',
        skip: 'skipped',
      }

      const newStatus = statusMap[action]
      if (!newStatus) {
        throw new Error('action 参数无效，可选值：confirm / skip / delete。')
      }

      const updatedMeal = await updatePlannedMealStatus(plannedMealId, newStatus)
      if (!updatedMeal) {
        throw new Error('没有找到对应的计划用餐记录。')
      }

      return {
        success: true,
        plannedMeal: updatedMeal,
        action,
      }
    }

    case 'get_meal_plans': {
      const date = String(args.date ?? '').trim()
      if (!date) {
        throw new Error('缺少 date 参数。')
      }

      const meals = await getPlannedMealsForDate(date)
      return {
        date,
        plannedMeals: meals,
        count: meals.length,
      }
    }

    default:
      throw new Error(`未知工具：${toolCall.name}`)
  }
}
