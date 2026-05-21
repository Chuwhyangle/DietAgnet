/**
 * Example tests for `stores/planning.ts` (task 4.13, Requirements
 * 2.5, 2.7).
 *
 * The planning store wraps Dexie tables behind an async API.
 * We exercise read/write paths plus the migration-equivalent path
 * (re-opening the DB via `resetPlanningDb`).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import {
  getCurrentPlanningProfile,
  savePlanningProfile,
  savePersonalDietPlan,
  getLatestPersonalDietPlan,
  getRecentPersonalDietPlans,
  saveDailyPlanAdjustment,
  getLatestDailyPlanAdjustment,
  clearDailyPlanAdjustments,
  updateDailyPlanAdjustmentResponse,
  saveProactiveEvent,
  getRecentProactiveEvents,
  saveUserMemory,
  getUserMemory,
  archiveUserMemory,
  updateUserMemoryConfidence,
  markUserMemoryUsed,
  savePlannedMeal,
  getPlannedMealsForDate,
  updatePlannedMealStatus,
  deletePlannedMeal,
  planningDb,
} from '../planning'
import { resetPlanningDb } from '../../../../test/doubles/dexie'

describe('stores/planning', () => {
  beforeEach(async () => {
    await resetPlanningDb()
    vi.useFakeTimers({
      now: new Date('2024-06-15T10:00:00Z'),
      toFake: ['Date'],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('profile (read + write + migration)', () => {
    it('returns null when no profile is saved (post-migration empty schema)', async () => {
      expect(await getCurrentPlanningProfile()).toBeNull()
    })

    it('round-trips a saved profile', async () => {
      const saved = await savePlanningProfile({
        age: 30,
        gender: 'male',
        heightCm: 175,
      })
      expect(saved.id).toBe('current')
      expect(saved.age).toBe(30)
      const loaded = await getCurrentPlanningProfile()
      expect(loaded).toEqual(saved)
    })

    it('survives reset (migration) with an empty schema', async () => {
      await savePlanningProfile({ age: 30 })
      await resetPlanningDb()
      expect(await getCurrentPlanningProfile()).toBeNull()
    })
  })

  describe('plans', () => {
    const planInput = {
      title: '减脂计划',
      summary: '',
      mealGuidance: ['少油'],
      cautionNotes: [],
      profileSnapshot: {
        id: 'current' as const,
        completionStatus: 'completed' as const,
        updatedAt: '2024-06-15T10:00:00.000Z',
      },
      generationMode: 'local' as const,
      dailyCalorieTarget: 1700,
      proteinTarget: 100,
      carbsTarget: 200,
      fatTarget: 50,
    }

    async function ensureProfile(): Promise<void> {
      // savePersonalDietPlan reads the current profile; provide one.
      await savePlanningProfile({ age: 30 })
    }

    it('savePersonalDietPlan persists and getLatest returns it', async () => {
      await ensureProfile()
      const saved = await savePersonalDietPlan(planInput)
      expect(saved.id).toBeTypeOf('number')
      // The save path doesn't set `status`; it's added by other code paths.
      const latest = await getLatestPersonalDietPlan()
      expect(latest?.id).toBe(saved.id)
      expect(latest?.title).toBe('减脂计划')
    })

    it('getRecentPersonalDietPlans honours the limit', async () => {
      await ensureProfile()
      for (let i = 0; i < 5; i += 1) {
        await savePersonalDietPlan(planInput)
      }
      const recent = await getRecentPersonalDietPlans(3)
      expect(recent).toHaveLength(3)
    })
  })

  describe('daily plan adjustments', () => {
    it('round-trips and clears adjustments by date', async () => {
      await saveDailyPlanAdjustment({
        date: '2024-06-15',
        ruleId: 'reduce',
        plannedCalories: 2000,
        actualCalories: 2400,
        deltaCalories: 400,
        suggestedCalories: -200,
        suggestionType: 'reduce',
        suggestionText: '少一份米饭',
        generatedBy: 'local_rule',
      })

      expect(await getLatestDailyPlanAdjustment('2024-06-15')).not.toBeNull()
      expect(await clearDailyPlanAdjustments('2024-06-15')).toBe(1)
      expect(await getLatestDailyPlanAdjustment('2024-06-15')).toBeNull()
    })

    it('writes an audit entry when an adjustment is saved', async () => {
      const saved = await saveDailyPlanAdjustment({
        date: '2024-06-15',
        ruleId: 'after_meal_plan_gap',
        mealType: 'lunch',
        plannedCalories: 800,
        actualCalories: 400,
        deltaCalories: 400,
        suggestedCalories: 320,
        suggestionType: 'supplement',
        suggestionText: 'Add a gentle snack later today.',
        generatedBy: 'agent',
      })

      const auditRows = await planningDb.coachingAuditLog.toArray()
      expect(auditRows).toHaveLength(1)
      expect(auditRows[0]).toMatchObject({
        actor: 'agent',
        action: 'daily_plan_adjustment.saved',
      })
      expect(auditRows[0].payload).toMatchObject({
        adjustmentId: saved.id,
        date: '2024-06-15',
        ruleId: 'after_meal_plan_gap',
        mealType: 'lunch',
        suggestionType: 'supplement',
        deltaCalories: 400,
        generatedBy: 'agent',
      })
    })

    it('persists user response and audits adjustment feedback', async () => {
      const saved = await saveDailyPlanAdjustment({
        date: '2024-06-15',
        ruleId: 'after_meal_plan_gap',
        mealType: 'dinner',
        plannedCalories: 700,
        actualCalories: 980,
        deltaCalories: -280,
        suggestedCalories: -220,
        suggestionType: 'reduce',
        suggestionText: 'Keep the next meal lighter without skipping it.',
        generatedBy: 'local_rule',
      })

      const updated = await updateDailyPlanAdjustmentResponse(saved.id!, 'dismissed')

      expect(updated?.userResponse).toBe('dismissed')
      expect((await getLatestDailyPlanAdjustment('2024-06-15'))?.userResponse).toBe('dismissed')
      const auditRows = await planningDb.coachingAuditLog.orderBy('timestamp').toArray()
      expect(auditRows.map((row) => row.action)).toEqual([
        'daily_plan_adjustment.saved',
        'daily_plan_adjustment.response',
      ])
      expect(auditRows[1]).toMatchObject({
        actor: 'user',
        action: 'daily_plan_adjustment.response',
      })
      expect(auditRows[1].payload).toMatchObject({
        adjustmentId: saved.id,
        date: '2024-06-15',
        ruleId: 'after_meal_plan_gap',
        mealType: 'dinner',
        suggestionType: 'reduce',
        userResponse: 'dismissed',
        deltaCalories: -280,
      })
    })
  })

  describe('proactive events', () => {
    it('round-trips a proactive event', async () => {
      const event = await saveProactiveEvent({
        ruleId: 'meal_breakfast',
        trigger: 'context',
        priority: 'low',
        delivered: true,
        message: '早餐还没记哦',
        payload: { mealType: 'breakfast' },
      })
      expect(event.id).toBeTypeOf('number')
      const recent = await getRecentProactiveEvents()
      expect(recent[0].id).toBe(event.id)
    })
  })

  describe('user memories', () => {
    const memoryInput = {
      type: 'preference' as const,
      content: '喜欢清淡',
      normalizedContent: '喜欢清淡',
      tags: ['preference'],
      source: 'user_explicit' as const,
      confidence: 0.8,
      mergedFromIds: [] as number[],
    }

    it('round-trips a memory and returns it via getUserMemory', async () => {
      const saved = await saveUserMemory(memoryInput)
      const loaded = await getUserMemory(saved.id!)
      expect(loaded?.content).toBe('喜欢清淡')
      expect(loaded?.status).toBe('active')
    })

    it('archiveUserMemory marks the row archived with the given reason', async () => {
      const saved = await saveUserMemory(memoryInput)
      const archived = await archiveUserMemory(saved.id!, 'no_longer_relevant')
      expect(archived?.status).toBe('archived')
      expect(archived?.archivedReason).toBe('no_longer_relevant')
    })

    it('updateUserMemoryConfidence clamps and updates the row', async () => {
      const saved = await saveUserMemory(memoryInput)
      const updated = await updateUserMemoryConfidence(saved.id!, 1.5)
      expect(updated?.confidence).toBe(1)
    })

    it('markUserMemoryUsed updates lastUsedAt without throwing', async () => {
      const saved = await saveUserMemory(memoryInput)
      await markUserMemoryUsed(saved.id!)
      const loaded = await getUserMemory(saved.id!)
      expect(loaded?.lastUsedAt).toBe('2024-06-15T10:00:00.000Z')
    })
  })

  describe('planned meals', () => {
    const plannedMealInput = {
      date: '2024-06-15',
      mealType: 'lunch' as const,
      items: [
        {
          name: '便当',
          servings: 1,
          estimatedCalories: 600,
          estimatedProtein: 25,
          estimatedCarbs: 70,
          estimatedFat: 18,
        },
      ],
      totalCalories: 600,
      totalProtein: 25,
      totalCarbs: 70,
      totalFat: 18,
      source: 'ai_suggested' as const,
      status: 'suggested' as const,
    }

    it('round-trips a planned meal', async () => {
      const saved = await savePlannedMeal(plannedMealInput)
      const list = await getPlannedMealsForDate('2024-06-15')
      expect(list).toHaveLength(1)
      expect(list[0].id).toBe(saved.id)
    })

    it('updatePlannedMealStatus updates status; deletePlannedMeal removes the row', async () => {
      const saved = await savePlannedMeal(plannedMealInput)
      await updatePlannedMealStatus(saved.id!, 'confirmed')
      const after = await getPlannedMealsForDate('2024-06-15')
      expect(after[0].status).toBe('confirmed')
      const deleted = await deletePlannedMeal(saved.id!)
      expect(deleted).toBe(true)
      expect(await getPlannedMealsForDate('2024-06-15')).toEqual([])
    })
  })
})
