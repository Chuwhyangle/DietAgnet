/**
 * Tier 2 integration tests for `agent/tools.ts`.
 *
 * For every tool registered in `tools.ts`:
 *   - Assert input-schema rejection of malformed input (Req 4.4)
 *   - Assert output-shape conformance on the success path (Req 4.4, 4.6, 4.7)
 *
 * Seeds Fake_Dexie and Fake_LocalStorage with the minimum rows each tool reads.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { resetPlanningDb, seedPlanningDb } from '../../../../test/doubles/dexie'
import type { AgentToolInvocation } from '../../../../shared/agent'
import {
  getRecentProactiveEvents,
  saveDailyPlanAdjustment,
  savePersonalDietPlan,
  savePlannedMeal,
  savePlanningProfile,
} from '../../stores/planning'

// Seed settings into localStorage before importing tools
const TEST_SETTINGS = {
  nickname: '测试用户',
  calorieGoal: 2000,
  onboarded: true,
  agent: {
    provider: 'deepseek',
    apiBaseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
    toolCompatibility: 'auto',
  },
  usagePricing: {},
  reminders: {
    enabled: true,
    mealReminders: true,
    planAdjustmentReminders: true,
    weeklyReportReminders: false,
    postLogGapSummaryInChat: true,
    postLogGapDesktopNotify: false,
    quietStartHour: 23,
    quietEndHour: 7,
    cooldownHours: 4,
  },
}

function seedSettings(): void {
  localStorage.setItem('diet-agent-settings', JSON.stringify(TEST_SETTINGS))
}

function seedDietLog(date: string, calories = 180): void {
  const log = {
    date,
    meals: [
      {
        type: 'lunch',
        items: [
          {
            recipeId: 'chinese-1',
            name: '番茄炒蛋',
            emoji: '🍳',
            servings: 1,
            calories,
            protein: 12,
            carbs: 8,
            fat: 12,
          },
        ],
      },
    ],
  }
  localStorage.setItem(`diet-agent-log-${date}`, JSON.stringify(log))
}

function stripDescriptions(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripDescriptions)
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'description')
      .map(([key, entry]) => [key, stripDescriptions(entry)]),
  )
}

async function seedPlanGapFixture(date = '2024-06-15'): Promise<void> {
  await savePlanningProfile({
    age: 30,
    gender: 'other',
    mealsPerDay: 3,
    completionStatus: 'completed',
  })

  await savePersonalDietPlan({
    title: 'Test plan',
    summary: 'Plan for tool tests',
    dailyCalorieTarget: 2000,
    proteinTarget: 100,
    carbsTarget: 220,
    fatTarget: 60,
    mealGuidance: ['Keep meals balanced.'],
    cautionNotes: [],
    generationMode: 'local',
  })

  await savePlannedMeal({
    date,
    mealType: 'lunch',
    items: [
      {
        name: 'Planned lunch',
        servings: 1,
        estimatedCalories: 800,
        estimatedProtein: 32,
        estimatedCarbs: 90,
        estimatedFat: 24,
      },
    ],
    totalCalories: 800,
    totalProtein: 32,
    totalCarbs: 90,
    totalFat: 24,
    source: 'manual',
    status: 'confirmed',
  })
}

// Import executeToolCall and AGENT_TOOLS after environment is ready
const { executeToolCall, AGENT_TOOLS, getToolDefinitions } = await import('../tools')

function invoke(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const toolCall: AgentToolInvocation = { id: 'test-call-1', name, arguments: args }
  return executeToolCall(toolCall, {})
}

describe('agent/tools - executeToolCall', () => {
  beforeEach(async () => {
    seedSettings()
    await resetPlanningDb()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('AGENT_TOOLS registry', () => {
    it('exports a non-empty array of tool definitions', () => {
      expect(AGENT_TOOLS).toBeDefined()
      expect(AGENT_TOOLS.length).toBeGreaterThan(0)
    })

    it('every tool has a unique name', () => {
      const names = AGENT_TOOLS.map((t) => t.function.name)
      expect(new Set(names).size).toBe(names.length)
    })

    it('localizes descriptions without changing tool names or schemas', () => {
      const enTools = getToolDefinitions('en')
      const zhTools = getToolDefinitions('zh')

      expect(enTools.map((tool) => tool.function.name)).toEqual(
        zhTools.map((tool) => tool.function.name),
      )
      expect(enTools.map((tool) => stripDescriptions(tool.function.parameters))).toEqual(
        zhTools.map((tool) => stripDescriptions(tool.function.parameters)),
      )

      const enToday = enTools.find((tool) => tool.function.name === 'get_today_nutrition')
      const zhToday = zhTools.find((tool) => tool.function.name === 'get_today_nutrition')
      expect(enToday?.function.description).toMatch(/today/i)
      expect(zhToday?.function.description).toMatch(/今天/)
      expect(enToday?.function.description).not.toMatch(/[\u3400-\u9fff]/)
    })
  })

  describe('unknown tool', () => {
    it('throws for an unregistered tool name', async () => {
      await expect(invoke('nonexistent_tool')).rejects.toThrow('Unknown tool')
    })
  })

  // ─── get_today_nutrition ───────────────────────────────────────────────────

  describe('get_today_nutrition', () => {
    it('returns nutrition summary with date on success', async () => {
      const result = (await invoke('get_today_nutrition')) as Record<string, unknown>
      expect(result).toHaveProperty('date')
      expect(result).toHaveProperty('calories')
      expect(result).toHaveProperty('protein')
      expect(result).toHaveProperty('carbs')
      expect(result).toHaveProperty('fat')
      expect(typeof result.calories).toBe('number')
    })
  })

  // ─── get_diet_log ─────────────────────────────────────────────────────────

  describe('get_diet_log', () => {
    it('rejects when date is missing', async () => {
      await expect(invoke('get_diet_log', {})).rejects.toThrow('date')
    })

    it('rejects when date is empty string', async () => {
      await expect(invoke('get_diet_log', { date: '  ' })).rejects.toThrow('date')
    })

    it('returns meals array on success', async () => {
      seedDietLog('2024-06-15')
      const result = (await invoke('get_diet_log', { date: '2024-06-15' })) as Record<string, unknown>
      expect(result).toHaveProperty('date', '2024-06-15')
      expect(result).toHaveProperty('meals')
      expect(Array.isArray(result.meals)).toBe(true)
    })
  })

  // ─── get_week_summary ─────────────────────────────────────────────────────

  describe('get_week_summary', () => {
    it('returns weekly report shape on success', async () => {
      const result = (await invoke('get_week_summary')) as Record<string, unknown>
      expect(result).toHaveProperty('startDate')
      expect(result).toHaveProperty('endDate')
      expect(result).toHaveProperty('totals')
    })
  })

  // ─── search_recipe ────────────────────────────────────────────────────────

  describe('search_recipe', () => {
    it('rejects when keyword is missing (returns empty results for empty keyword)', async () => {
      // search_recipe does not throw on empty keyword; it returns top 8
      const result = (await invoke('search_recipe', { keyword: '' })) as unknown[]
      expect(Array.isArray(result)).toBe(true)
    })

    it('returns array of recipe summaries on success', async () => {
      const result = (await invoke('search_recipe', { keyword: '鸡' })) as Array<Record<string, unknown>>
      expect(Array.isArray(result)).toBe(true)
      if (result.length > 0) {
        expect(result[0]).toHaveProperty('id')
        expect(result[0]).toHaveProperty('name')
        expect(result[0]).toHaveProperty('calories')
      }
    })
  })

  // ─── get_recipe_detail ────────────────────────────────────────────────────

  describe('get_recipe_detail', () => {
    it('throws when recipeId does not exist', async () => {
      await expect(invoke('get_recipe_detail', { recipeId: 'nonexistent-id' })).rejects.toThrow()
    })

    it('returns full recipe on success', async () => {
      const result = (await invoke('get_recipe_detail', { recipeId: 'tomato-egg' })) as Record<string, unknown>
      expect(result).toHaveProperty('id', 'tomato-egg')
      expect(result).toHaveProperty('name')
      expect(result).toHaveProperty('calories')
      expect(result).toHaveProperty('nutrition')
    })
  })

  // ─── get_recipes_by_category ──────────────────────────────────────────────

  describe('get_recipes_by_category', () => {
    it('rejects when category is missing', async () => {
      await expect(invoke('get_recipes_by_category', {})).rejects.toThrow('category')
    })

    it('rejects when category is empty', async () => {
      await expect(invoke('get_recipes_by_category', { category: '  ' })).rejects.toThrow('category')
    })

    it('returns array on success', async () => {
      const result = (await invoke('get_recipes_by_category', { category: '炒菜' })) as unknown[]
      expect(Array.isArray(result)).toBe(true)
    })
  })

  // ─── get_settings ─────────────────────────────────────────────────────────

  describe('get_settings', () => {
    it('returns settings shape on success', async () => {
      const result = (await invoke('get_settings')) as Record<string, unknown>
      expect(result).toHaveProperty('nickname')
      expect(result).toHaveProperty('calorieGoal')
      expect(result).toHaveProperty('agentProvider')
    })
  })

  // ─── add_meal ─────────────────────────────────────────────────────────────

  describe('add_meal', () => {
    it('rejects when date is missing', async () => {
      await expect(invoke('add_meal', { mealType: 'lunch', recipeId: 'chinese-1' })).rejects.toThrow()
    })

    it('rejects when mealType is invalid', async () => {
      await expect(invoke('add_meal', { date: '2024-06-15', mealType: 'brunch', recipeId: 'chinese-1' })).rejects.toThrow()
    })

    it('rejects when recipeId does not exist', async () => {
      await expect(invoke('add_meal', { date: '2024-06-15', mealType: 'lunch', recipeId: 'nonexistent' })).rejects.toThrow()
    })

    it('returns success shape on valid input', async () => {
      const result = (await invoke('add_meal', {
        date: '2024-06-15',
        mealType: 'lunch',
        recipeId: 'tomato-egg',
        servings: 1,
      })) as Record<string, unknown>
      expect(result).toHaveProperty('success', true)
      expect(result).toHaveProperty('totalCalories')
      expect(result).toHaveProperty('mealType', 'lunch')
      expect(result).toHaveProperty('recipeName')
      expect(typeof result.totalCalories).toBe('number')
    })
  })

  // ─── add_custom_food_meal ─────────────────────────────────────────────────

  describe('add_custom_food_meal', () => {
    it('rejects when date is missing', async () => {
      await expect(invoke('add_custom_food_meal', {
        mealType: 'lunch', name: '牛奶', calories: 150, protein: 8, carbs: 12, fat: 8,
      })).rejects.toThrow()
    })

    it('rejects when name is missing', async () => {
      await expect(invoke('add_custom_food_meal', {
        date: '2024-06-15', mealType: 'lunch', name: '', calories: 150, protein: 8, carbs: 12, fat: 8,
      })).rejects.toThrow()
    })

    it('rejects when calories is not a number', async () => {
      await expect(invoke('add_custom_food_meal', {
        date: '2024-06-15', mealType: 'lunch', name: '牛奶', calories: 'abc', protein: 8, carbs: 12, fat: 8,
      })).rejects.toThrow()
    })

    it('returns success shape on valid input', async () => {
      const result = (await invoke('add_custom_food_meal', {
        date: '2024-06-15',
        mealType: 'breakfast',
        name: '牛奶',
        calories: 150,
        protein: 8,
        carbs: 12,
        fat: 8,
      })) as Record<string, unknown>
      expect(result).toHaveProperty('success', true)
      expect(result).toHaveProperty('totalCalories')
      expect(result).toHaveProperty('recipeName', '牛奶')
      expect(result).toHaveProperty('customFood')
      expect(result).toHaveProperty('estimated', true)
    })
  })

  // ─── remove_meal_item ─────────────────────────────────────────────────────

  describe('remove_meal_item', () => {
    it('rejects when date is missing', async () => {
      await expect(invoke('remove_meal_item', { mealType: 'lunch', itemIndex: 0 })).rejects.toThrow()
    })

    it('rejects when mealType is invalid', async () => {
      await expect(invoke('remove_meal_item', { date: '2024-06-15', mealType: 'brunch', itemIndex: 0 })).rejects.toThrow()
    })

    it('rejects when itemIndex is not an integer', async () => {
      await expect(invoke('remove_meal_item', { date: '2024-06-15', mealType: 'lunch', itemIndex: 'abc' })).rejects.toThrow()
    })

    it('throws when no matching record exists', async () => {
      await expect(invoke('remove_meal_item', { date: '2024-06-15', mealType: 'lunch', itemIndex: 0 })).rejects.toThrow()
    })

    it('returns success shape when item exists', async () => {
      // First add a meal, then remove it
      await invoke('add_meal', { date: '2024-06-15', mealType: 'lunch', recipeId: 'tomato-egg' })
      const result = (await invoke('remove_meal_item', {
        date: '2024-06-15', mealType: 'lunch', itemIndex: 0,
      })) as Record<string, unknown>
      expect(result).toHaveProperty('success', true)
      expect(result).toHaveProperty('date', '2024-06-15')
      expect(result).toHaveProperty('mealType', 'lunch')
    })
  })

  // ─── update_settings ──────────────────────────────────────────────────────

  describe('update_settings', () => {
    it('returns success shape even with no changes', async () => {
      const result = (await invoke('update_settings', {})) as Record<string, unknown>
      expect(result).toHaveProperty('success', true)
      expect(result).toHaveProperty('nickname')
      expect(result).toHaveProperty('calorieGoal')
    })

    it('updates nickname when provided', async () => {
      const result = (await invoke('update_settings', { nickname: '新昵称' })) as Record<string, unknown>
      expect(result).toHaveProperty('nickname', '新昵称')
    })

    it('updates calorieGoal when provided', async () => {
      const result = (await invoke('update_settings', { calorieGoal: 1800 })) as Record<string, unknown>
      expect(result).toHaveProperty('calorieGoal', 1800)
    })
  })

  // ─── recommend_recipe ─────────────────────────────────────────────────────

  describe('recommend_recipe', () => {
    it('returns array of recommendations on success', async () => {
      const result = (await invoke('recommend_recipe', { preference: '鸡' })) as Array<Record<string, unknown>>
      expect(Array.isArray(result)).toBe(true)
      if (result.length > 0) {
        expect(result[0]).toHaveProperty('id')
        expect(result[0]).toHaveProperty('name')
        expect(result[0]).toHaveProperty('reason')
      }
    })

    it('respects maxCalories filter', async () => {
      const result = (await invoke('recommend_recipe', { maxCalories: 200 })) as Array<Record<string, unknown>>
      expect(Array.isArray(result)).toBe(true)
      for (const item of result) {
        expect(item.calories).toBeLessThanOrEqual(200)
      }
    })
  })

  // ─── analyze_nutrition_balance ────────────────────────────────────────────

  describe('analyze_nutrition_balance', () => {
    it('rejects when period is missing (defaults to today)', async () => {
      // Does not actually reject - defaults to 'today'
      const result = (await invoke('analyze_nutrition_balance', {})) as Record<string, unknown>
      expect(result).toHaveProperty('period', 'today')
    })

    it('returns today analysis shape', async () => {
      const result = (await invoke('analyze_nutrition_balance', { period: 'today' })) as Record<string, unknown>
      expect(result).toHaveProperty('period', 'today')
      expect(result).toHaveProperty('summary')
      expect(result).toHaveProperty('suggestions')
      expect(Array.isArray(result.suggestions)).toBe(true)
    })

    it('returns week analysis shape', async () => {
      const result = (await invoke('analyze_nutrition_balance', { period: 'week' })) as Record<string, unknown>
      expect(result).toHaveProperty('period', 'week')
      expect(result).toHaveProperty('summary')
      expect(result).toHaveProperty('suggestions')
      expect(result).toHaveProperty('report')
    })
  })

  // ─── navigate_to ──────────────────────────────────────────────────────────

  describe('navigate_to', () => {
    it('throws for invalid page', async () => {
      await expect(invoke('navigate_to', { page: 'nonexistent' })).rejects.toThrow()
    })

    it('returns success shape for valid page', async () => {
      const result = (await invoke('navigate_to', { page: 'home' })) as Record<string, unknown>
      expect(result).toHaveProperty('success', true)
      expect(result).toHaveProperty('page', 'home')
      expect(result).toHaveProperty('path', '/')
    })

    it('uses navigate callback when provided', async () => {
      const navigate = vi.fn()
      const toolCall: AgentToolInvocation = { id: 'nav-1', name: 'navigate_to', arguments: { page: 'recipes' } }
      const result = (await executeToolCall(toolCall, { navigate })) as Record<string, unknown>
      expect(navigate).toHaveBeenCalledWith('/recipes')
      expect(result).toHaveProperty('success', true)
    })
  })

  // ─── get_current_plan ─────────────────────────────────────────────────────

  describe('get_current_plan', () => {
    it('returns plan shape with fallbackCalorieGoal', async () => {
      const result = (await invoke('get_current_plan')) as Record<string, unknown>
      expect(result).toHaveProperty('plan')
      expect(result).toHaveProperty('fallbackCalorieGoal')
      expect(typeof result.fallbackCalorieGoal).toBe('number')
    })
  })

  // ─── check_today_plan_gap ─────────────────────────────────────────────────

  describe('check_today_plan_gap', () => {
    it('returns gap shape with available flag', async () => {
      const result = (await invoke('check_today_plan_gap')) as Record<string, unknown>
      expect(result).toHaveProperty('date')
      expect(result).toHaveProperty('available')
      expect(typeof result.available).toBe('boolean')
    })

    it('rejects invalid date input', async () => {
      await expect(invoke('check_today_plan_gap', { date: '2024-99-99' })).rejects.toThrow('date')
    })

    it('returns planned-vs-actual meal gap details', async () => {
      await seedPlanGapFixture()
      seedDietLog('2024-06-15', 400)

      const result = (await invoke('check_today_plan_gap', { date: '2024-06-15' })) as Record<string, unknown>
      const gap = result.gap as Record<string, unknown>
      const mealGaps = gap.mealGaps as Array<Record<string, unknown>>
      const lunchGap = mealGaps.find((item) => item.mealType === 'lunch')

      expect(result).toMatchObject({
        date: '2024-06-15',
        available: true,
      })
      expect(gap).toMatchObject({
        dailyTarget: 2000,
        actualCalories: 400,
        remainingCalories: 1600,
      })
      expect(lunchGap).toMatchObject({
        mealType: 'lunch',
        plannedCalories: 800,
        actualCalories: 400,
        deltaCalories: 400,
        hasPlannedMeal: true,
      })
    })
  })

  // ─── suggest_plan_adjustment ──────────────────────────────────────────────

  describe('suggest_plan_adjustment', () => {
    it('returns adjustment shape', async () => {
      const result = (await invoke('suggest_plan_adjustment')) as Record<string, unknown>
      expect(result).toHaveProperty('date')
      expect(result).toHaveProperty('gap')
      expect(result).toHaveProperty('saved')
      expect(typeof result.saved).toBe('boolean')
    })

    it('rejects invalid date input', async () => {
      await expect(invoke('suggest_plan_adjustment', { date: 'not-a-date' })).rejects.toThrow('date')
    })

    it('saves a supplement suggestion for an under-target lunch', async () => {
      await seedPlanGapFixture()
      seedDietLog('2024-06-15', 400)

      const result = (await invoke('suggest_plan_adjustment', {
        date: '2024-06-15',
        mealType: 'lunch',
      })) as Record<string, unknown>
      const suggestion = result.suggestion as Record<string, unknown>
      const savedAdjustment = result.savedAdjustment as Record<string, unknown>

      expect(result).toMatchObject({
        date: '2024-06-15',
        mealType: 'lunch',
        saved: true,
      })
      expect(suggestion).toMatchObject({
        ruleId: 'after_meal_plan_gap',
        mealType: 'lunch',
        plannedCalories: 800,
        actualCalories: 400,
        deltaCalories: 400,
        suggestionType: 'supplement',
      })
      expect(savedAdjustment).toMatchObject({
        mealType: 'lunch',
        suggestionType: 'supplement',
        generatedBy: 'agent',
      })
      expect(savedAdjustment.id).toBeTypeOf('number')
    })
  })

  // ─── record_adjustment_response ───────────────────────────────────────────

  describe('record_adjustment_response', () => {
    it('rejects when adjustmentId is missing', async () => {
      await expect(invoke('record_adjustment_response', { response: 'accepted' })).rejects.toThrow()
    })

    it('rejects when response is invalid', async () => {
      await expect(invoke('record_adjustment_response', { adjustmentId: 1, response: 'invalid' })).rejects.toThrow()
    })

    it('rejects when adjustmentId is not an integer', async () => {
      await expect(invoke('record_adjustment_response', { adjustmentId: 'abc', response: 'accepted' })).rejects.toThrow()
    })

    it('persists valid feedback for an adjustment', async () => {
      const adjustment = await saveDailyPlanAdjustment({
        date: '2024-06-15',
        ruleId: 'after_meal_plan_gap',
        mealType: 'lunch',
        plannedCalories: 800,
        actualCalories: 1200,
        deltaCalories: -400,
        suggestedCalories: 320,
        suggestionType: 'reduce',
        suggestionText: 'Keep the next meal lighter without skipping it.',
        generatedBy: 'agent',
      })

      const result = (await invoke('record_adjustment_response', {
        adjustmentId: adjustment.id,
        response: 'dismissed',
      })) as Record<string, unknown>
      const updatedAdjustment = result.adjustment as Record<string, unknown>

      expect(result).toHaveProperty('success', true)
      expect(updatedAdjustment).toMatchObject({
        id: adjustment.id,
        userResponse: 'dismissed',
      })
    })
  })

  // ─── get_proactive_event_history ──────────────────────────────────────────

  describe('get_proactive_event_history', () => {
    it('returns events array on success', async () => {
      const result = (await invoke('get_proactive_event_history')) as Record<string, unknown>
      expect(result).toHaveProperty('events')
      expect(Array.isArray(result.events)).toBe(true)
    })
  })

  // ─── update_reminder_preferences ──────────────────────────────────────────

  describe('update_reminder_preferences', () => {
    it('returns success shape with reminders object', async () => {
      const result = (await invoke('update_reminder_preferences', { enabled: false })) as Record<string, unknown>
      expect(result).toHaveProperty('success', true)
      expect(result).toHaveProperty('reminders')
      const reminders = result.reminders as Record<string, unknown>
      expect(reminders).toHaveProperty('enabled', false)
    })

    it('clamps quietStartHour to 0-23 range', async () => {
      const result = (await invoke('update_reminder_preferences', { quietStartHour: 25 })) as Record<string, unknown>
      const reminders = result.reminders as Record<string, unknown>
      expect(reminders.quietStartHour).toBeLessThanOrEqual(23)
    })

    it('snoozes meal reminder rules for the rest of today without disabling settings', async () => {
      vi.useFakeTimers({
        now: new Date('2024-06-15T10:00:00Z'),
        toFake: ['Date'],
      })

      const result = (await invoke('update_reminder_preferences', {
        disableMealRemindersToday: true,
      })) as Record<string, unknown>
      const reminders = result.reminders as Record<string, unknown>
      const snoozedRules = result.snoozedRules as Array<Record<string, unknown>>

      expect(result).toHaveProperty('success', true)
      expect(reminders.mealReminders).toBe(true)
      expect(snoozedRules).toHaveLength(3)
      expect(snoozedRules.map((event) => event.ruleId)).toEqual([
        'coaching_breakfast_reminder',
        'coaching_lunch_reminder',
        'coaching_dinner_reminder',
      ])
      expect(snoozedRules.every((event) => event.userResponse === 'snoozed')).toBe(true)
      expect(snoozedRules.every((event) => typeof event.cooldownUntil === 'string')).toBe(true)

      const events = await getRecentProactiveEvents(3)
      expect(events.map((event) => event.ruleId).sort()).toEqual([
        'coaching_breakfast_reminder',
        'coaching_dinner_reminder',
        'coaching_lunch_reminder',
      ].sort())
      expect(events.every((event) => event.delivered === false)).toBe(true)
      expect(events.every((event) => event.userResponse === 'snoozed')).toBe(true)
      expect(events.every((event) => event.payload.reason === 'user_disabled_meal_reminders_today')).toBe(true)
    })
  })

  // ─── validate_recipe_library ──────────────────────────────────────────────

  describe('validate_recipe_library', () => {
    it('returns validation report shape', async () => {
      const result = (await invoke('validate_recipe_library')) as Record<string, unknown>
      expect(result).toHaveProperty('totalRecipes')
      expect(result).toHaveProperty('status')
      expect(result).toHaveProperty('categoryCounts')
      expect(typeof result.totalRecipes).toBe('number')
      expect(result.totalRecipes).toBeGreaterThan(0)
    })
  })

  // ─── estimate_recipe_nutrition ────────────────────────────────────────────

  describe('estimate_recipe_nutrition', () => {
    it('rejects when recipeId does not exist', async () => {
      await expect(invoke('estimate_recipe_nutrition', {
        recipeId: 'nonexistent',
        estimatedCalories: 200,
        estimatedProtein: 15,
        estimatedCarbs: 20,
        estimatedFat: 8,
        reasoning: '估算依据',
        confidence: 0.8,
      })).rejects.toThrow()
    })

    it('rejects when reasoning is empty', async () => {
      await expect(invoke('estimate_recipe_nutrition', {
        recipeId: 'tomato-egg',
        estimatedCalories: 200,
        estimatedProtein: 15,
        estimatedCarbs: 20,
        estimatedFat: 8,
        reasoning: '',
        confidence: 0.8,
      })).rejects.toThrow('Reasoning')
    })

    it('rejects when estimatedCalories is not a number', async () => {
      await expect(invoke('estimate_recipe_nutrition', {
        recipeId: 'tomato-egg',
        estimatedCalories: 'abc',
        estimatedProtein: 15,
        estimatedCarbs: 20,
        estimatedFat: 8,
        reasoning: '估算依据',
        confidence: 0.8,
      })).rejects.toThrow()
    })

    it('returns success shape on valid input', async () => {
      const result = (await invoke('estimate_recipe_nutrition', {
        recipeId: 'tomato-egg',
        estimatedCalories: 200,
        estimatedProtein: 15,
        estimatedCarbs: 20,
        estimatedFat: 8,
        reasoning: '根据食材份量估算',
        confidence: 0.8,
      })) as Record<string, unknown>
      expect(result).toHaveProperty('success', true)
      expect(result).toHaveProperty('record')
      expect(result).toHaveProperty('sourceRecipeFileUnchanged', true)
    })
  })

  // ─── list_recipe_calibrations ─────────────────────────────────────────────

  describe('list_recipe_calibrations', () => {
    it('returns summary and records on success', async () => {
      const result = (await invoke('list_recipe_calibrations')) as Record<string, unknown>
      expect(result).toHaveProperty('summary')
      expect(result).toHaveProperty('records')
      expect(Array.isArray(result.records)).toBe(true)
    })
  })

  // ─── review_recipe_calibration ────────────────────────────────────────────

  describe('review_recipe_calibration', () => {
    it('rejects when calibrationId is missing', async () => {
      await expect(invoke('review_recipe_calibration', { status: 'approved' })).rejects.toThrow()
    })

    it('rejects when status is invalid', async () => {
      await expect(invoke('review_recipe_calibration', { calibrationId: 1, status: 'invalid' })).rejects.toThrow()
    })

    it('throws when calibration record does not exist', async () => {
      await expect(invoke('review_recipe_calibration', { calibrationId: 999, status: 'approved' })).rejects.toThrow()
    })

    it('returns success shape when record exists', async () => {
      // First create a calibration record
      await invoke('estimate_recipe_nutrition', {
        recipeId: 'tomato-egg',
        estimatedCalories: 200,
        estimatedProtein: 15,
        estimatedCarbs: 20,
        estimatedFat: 8,
        reasoning: '根据食材份量估算',
        confidence: 0.8,
      })
      const result = (await invoke('review_recipe_calibration', {
        calibrationId: 1,
        status: 'approved',
      })) as Record<string, unknown>
      expect(result).toHaveProperty('success', true)
      expect(result).toHaveProperty('record')
    })
  })

  // ─── remember ─────────────────────────────────────────────────────────────

  describe('remember', () => {
    it('rejects when type is invalid', async () => {
      await expect(invoke('remember', { type: 'invalid_type', content: '不吃花生' })).rejects.toThrow()
    })

    it('rejects when content is too short', async () => {
      await expect(invoke('remember', { type: 'allergy', content: 'x' })).rejects.toThrow()
    })

    it('returns success shape on valid input', async () => {
      const result = (await invoke('remember', {
        type: 'allergy',
        content: '对花生过敏',
        tags: ['花生'],
        confidence: 0.9,
      })) as Record<string, unknown>
      expect(result).toHaveProperty('success', true)
      expect(result).toHaveProperty('memory')
      expect(result).toHaveProperty('merged')
    })
  })

  // ─── recall ───────────────────────────────────────────────────────────────

  describe('recall', () => {
    it('returns memories array on success', async () => {
      // Seed a memory first
      await invoke('remember', { type: 'preference', content: '喜欢清淡口味' })
      const result = (await invoke('recall', { text: '清淡' })) as Record<string, unknown>
      expect(result).toHaveProperty('memories')
      expect(Array.isArray(result.memories)).toBe(true)
    })

    it('returns empty memories when nothing matches', async () => {
      const result = (await invoke('recall', { text: '完全不存在的内容xyz' })) as Record<string, unknown>
      expect(result).toHaveProperty('memories')
      expect(Array.isArray(result.memories)).toBe(true)
    })
  })

  // ─── forget ───────────────────────────────────────────────────────────────

  describe('forget', () => {
    it('rejects when memoryId is not an integer', async () => {
      await expect(invoke('forget', { memoryId: 'abc' })).rejects.toThrow()
    })

    it('throws when memory does not exist', async () => {
      await expect(invoke('forget', { memoryId: 9999 })).rejects.toThrow()
    })

    it('returns success shape when memory exists', async () => {
      const rememberResult = (await invoke('remember', { type: 'habit', content: '每天早上跑步' })) as Record<string, unknown>
      const memory = rememberResult.memory as Record<string, unknown>
      const result = (await invoke('forget', { memoryId: memory.id })) as Record<string, unknown>
      expect(result).toHaveProperty('success', true)
      expect(result).toHaveProperty('memory')
    })
  })

  // ─── list_user_facts ──────────────────────────────────────────────────────

  describe('list_user_facts', () => {
    it('returns memories array on success', async () => {
      const result = (await invoke('list_user_facts')) as Record<string, unknown>
      expect(result).toHaveProperty('memories')
      expect(Array.isArray(result.memories)).toBe(true)
    })
  })

  // ─── get_user_rhythm_summary ──────────────────────────────────────────────

  describe('get_user_rhythm_summary', () => {
    it('returns rhythm summary shape', async () => {
      const result = (await invoke('get_user_rhythm_summary')) as Record<string, unknown>
      expect(result).toHaveProperty('lookbackDays')
      expect(result).toHaveProperty('structured')
      expect(result).toHaveProperty('promptSummary')
      expect(typeof result.lookbackDays).toBe('number')
      expect(result.lookbackDays).toBeGreaterThanOrEqual(7)
      expect(result.lookbackDays).toBeLessThanOrEqual(30)
    })

    it('clamps lookbackDays to 7-30 range', async () => {
      const result = (await invoke('get_user_rhythm_summary', { lookbackDays: 3 })) as Record<string, unknown>
      expect(result.lookbackDays).toBe(7)

      const result2 = (await invoke('get_user_rhythm_summary', { lookbackDays: 50 })) as Record<string, unknown>
      expect(result2.lookbackDays).toBe(30)
    })
  })

  // ─── update_memory_confidence ─────────────────────────────────────────────

  describe('update_memory_confidence', () => {
    it('rejects when memoryId is not an integer', async () => {
      await expect(invoke('update_memory_confidence', { memoryId: 'abc', confidence: 0.9 })).rejects.toThrow()
    })

    it('rejects when confidence is not a number', async () => {
      await expect(invoke('update_memory_confidence', { memoryId: 1, confidence: 'high' })).rejects.toThrow()
    })

    it('returns success shape when memory exists', async () => {
      const rememberResult = (await invoke('remember', { type: 'goal', content: '每天摄入2000卡' })) as Record<string, unknown>
      const memory = rememberResult.memory as Record<string, unknown>
      const result = (await invoke('update_memory_confidence', {
        memoryId: memory.id,
        confidence: 0.95,
      })) as Record<string, unknown>
      expect(result).toHaveProperty('success', true)
      expect(result).toHaveProperty('memory')
    })
  })

  // ─── search_knowledgebase ─────────────────────────────────────────────────

  describe('search_knowledgebase', () => {
    it('rejects when query is missing', async () => {
      await expect(invoke('search_knowledgebase', {})).rejects.toThrow('query')
    })

    it('rejects when query is empty', async () => {
      await expect(invoke('search_knowledgebase', { query: '  ' })).rejects.toThrow('query')
    })

    it('returns results shape on success', async () => {
      const result = (await invoke('search_knowledgebase', { query: '蛋白质' })) as Record<string, unknown>
      expect(result).toHaveProperty('query', '蛋白质')
      expect(result).toHaveProperty('mode', 'lexical_local')
      expect(result).toHaveProperty('results')
      expect(Array.isArray(result.results)).toBe(true)
    })
  })

  // ─── lookup_food_nutrition ────────────────────────────────────────────────

  describe('lookup_food_nutrition', () => {
    it('rejects when name is missing', async () => {
      await expect(invoke('lookup_food_nutrition', {})).rejects.toThrow('name')
    })

    it('rejects when name is empty', async () => {
      await expect(invoke('lookup_food_nutrition', { name: '  ' })).rejects.toThrow('name')
    })

    it('returns lookup shape on success', async () => {
      const result = (await invoke('lookup_food_nutrition', { name: '鸡蛋' })) as Record<string, unknown>
      expect(result).toHaveProperty('query', '鸡蛋')
      expect(result).toHaveProperty('found')
      expect(typeof result.found).toBe('boolean')
    })
  })

  // ─── find_foods_by_criteria ───────────────────────────────────────────────

  describe('find_foods_by_criteria', () => {
    it('returns foods array on success', async () => {
      const result = (await invoke('find_foods_by_criteria', { maxCalories: 200 })) as Record<string, unknown>
      expect(result).toHaveProperty('foods')
      expect(Array.isArray(result.foods)).toBe(true)
    })

    it('returns foods array with no criteria', async () => {
      const result = (await invoke('find_foods_by_criteria', {})) as Record<string, unknown>
      expect(result).toHaveProperty('foods')
      expect(Array.isArray(result.foods)).toBe(true)
    })
  })

  // ─── get_guideline_advice ─────────────────────────────────────────────────

  describe('get_guideline_advice', () => {
    it('rejects when topic is missing', async () => {
      await expect(invoke('get_guideline_advice', {})).rejects.toThrow('topic')
    })

    it('rejects when topic is empty', async () => {
      await expect(invoke('get_guideline_advice', { topic: '  ' })).rejects.toThrow('topic')
    })

    it('returns guidelines shape on success', async () => {
      const result = (await invoke('get_guideline_advice', { topic: '蛋白质' })) as Record<string, unknown>
      expect(result).toHaveProperty('topic', '蛋白质')
      expect(result).toHaveProperty('guidelines')
      expect(Array.isArray(result.guidelines)).toBe(true)
    })
  })

  // ─── suggest_meal_plan ────────────────────────────────────────────────────

  describe('suggest_meal_plan', () => {
    it('rejects when date is missing', async () => {
      await expect(invoke('suggest_meal_plan', {
        mealType: 'lunch',
        items: [{ name: '鸡胸肉', servings: 1, estimatedCalories: 200, estimatedProtein: 30, estimatedCarbs: 0, estimatedFat: 5 }],
        reasoning: '高蛋白',
      })).rejects.toThrow()
    })

    it('rejects when mealType is invalid', async () => {
      await expect(invoke('suggest_meal_plan', {
        date: '2024-06-15',
        mealType: 'brunch',
        items: [{ name: '鸡胸肉', servings: 1, estimatedCalories: 200, estimatedProtein: 30, estimatedCarbs: 0, estimatedFat: 5 }],
        reasoning: '高蛋白',
      })).rejects.toThrow()
    })

    it('rejects when items is empty', async () => {
      await expect(invoke('suggest_meal_plan', {
        date: '2024-06-15',
        mealType: 'lunch',
        items: [],
        reasoning: '高蛋白',
      })).rejects.toThrow('items')
    })

    it('returns success shape on valid input', async () => {
      const result = (await invoke('suggest_meal_plan', {
        date: '2024-06-15',
        mealType: 'lunch',
        items: [
          { name: '鸡胸肉沙拉', servings: 1, estimatedCalories: 300, estimatedProtein: 35, estimatedCarbs: 10, estimatedFat: 12 },
        ],
        reasoning: '高蛋白低脂',
      })) as Record<string, unknown>
      expect(result).toHaveProperty('success', true)
      expect(result).toHaveProperty('plannedMeal')
      expect(result).toHaveProperty('hint')
    })
  })

  // ─── confirm_meal_plan ────────────────────────────────────────────────────

  describe('confirm_meal_plan', () => {
    it('rejects when plannedMealId is not an integer', async () => {
      await expect(invoke('confirm_meal_plan', { plannedMealId: 'abc', action: 'confirm' })).rejects.toThrow()
    })

    it('rejects when action is invalid', async () => {
      await expect(invoke('confirm_meal_plan', { plannedMealId: 1, action: 'invalid' })).rejects.toThrow()
    })

    it('throws when planned meal does not exist', async () => {
      await expect(invoke('confirm_meal_plan', { plannedMealId: 9999, action: 'confirm' })).rejects.toThrow()
    })

    it('returns success shape when planned meal exists', async () => {
      // First create a planned meal
      const suggestResult = (await invoke('suggest_meal_plan', {
        date: '2024-06-15',
        mealType: 'dinner',
        items: [
          { name: '清蒸鱼', servings: 1, estimatedCalories: 250, estimatedProtein: 30, estimatedCarbs: 2, estimatedFat: 12 },
        ],
        reasoning: '清淡晚餐',
      })) as Record<string, unknown>
      const plannedMeal = suggestResult.plannedMeal as Record<string, unknown>

      const result = (await invoke('confirm_meal_plan', {
        plannedMealId: plannedMeal.id,
        action: 'confirm',
      })) as Record<string, unknown>
      expect(result).toHaveProperty('success', true)
      expect(result).toHaveProperty('plannedMeal')
      expect(result).toHaveProperty('action', 'confirm')
    })
  })

  // ─── get_meal_plans ───────────────────────────────────────────────────────

  describe('get_meal_plans', () => {
    it('rejects when date is missing', async () => {
      await expect(invoke('get_meal_plans', {})).rejects.toThrow('date')
    })

    it('rejects when date is empty', async () => {
      await expect(invoke('get_meal_plans', { date: '  ' })).rejects.toThrow('date')
    })

    it('returns planned meals shape on success', async () => {
      const result = (await invoke('get_meal_plans', { date: '2024-06-15' })) as Record<string, unknown>
      expect(result).toHaveProperty('date', '2024-06-15')
      expect(result).toHaveProperty('plannedMeals')
      expect(result).toHaveProperty('count')
      expect(Array.isArray(result.plannedMeals)).toBe(true)
      expect(typeof result.count).toBe('number')
    })
  })
})
