/**
 * Example tests for `planning/engine.ts` (task 4.11, Requirement 2.4).
 *
 * `engine.ts` exposes the onboarding step library + the calorie/macro
 * generator. We test the deterministic helpers (no I/O, no clock):
 *   - `getPlanningSteps` / `getPlanningStep`
 *   - step navigation helpers
 *   - `validatePlanningAnswer` for number, choice, and text branches
 *   - `buildPlanningFollowUps` over edge inputs
 *   - `mergePlanningNote` over the documented merge rules
 *
 * `generatePlanningPlan` is exercised in the AI-fallback (no API key)
 * branch only; the AI narrative branch belongs to integration tests.
 */

import { describe, it, expect, vi } from 'vitest'

import {
  GENDER_LABELS,
  GOAL_LABELS,
  ACTIVITY_LEVEL_LABELS,
  buildPlanningFollowUps,
  buildPlanningPrompt,
  buildProfilePatch,
  formatPlanningAnswer,
  generatePlanningPlan,
  getCompletedPlanningStepKeys,
  getInitialPlanningStepKey,
  getNextPlanningStepKey,
  getPlanGenerationLabel,
  getPlanningProgress,
  getPlanningProfileSummaryItems,
  getPlanningStep,
  getPlanningStepSkipValue,
  getPlanningSteps,
  getPreviousPlanningStepKey,
  mergePlanningNote,
  normalizePlanningAnswer,
  summarizePlanningProfile,
  validatePlanningAnswer,
} from '../engine'

vi.mock('../../stores/settings', () => ({
  getSettings: vi.fn(() => ({
    nickname: '猫猫',
    language: 'en',
    agent: { provider: 'deepseek', apiBaseUrl: '', model: '' },
    reminders: {},
  })),
}))

describe('planning/engine helpers', () => {
  describe('step library', () => {
    it('returns 13 ordered steps with stable keys', () => {
      const steps = getPlanningSteps()
      expect(steps).toHaveLength(13)
      expect(steps[0].key).toBe('age')
      expect(steps[steps.length - 1].key).toBe('scheduleNotes')
    })

    it('throws for unknown step keys', () => {
      // @ts-expect-error — intentionally invalid key
      expect(() => getPlanningStep('nope')).toThrow(/Unknown planning step/)
    })

    it('navigates next/previous correctly', () => {
      expect(getNextPlanningStepKey('age')).toBe('gender')
      expect(getNextPlanningStepKey(undefined)).toBe('age')
      expect(getNextPlanningStepKey('scheduleNotes')).toBeNull()
      expect(getPreviousPlanningStepKey('age')).toBeNull()
      expect(getPreviousPlanningStepKey('gender')).toBe('age')
    })

    it('exposes skip defaults only for optional text steps', () => {
      expect(getPlanningStepSkipValue('dietPreference')).toBe('No special preference')
      expect(getPlanningStepSkipValue('dietPreference', 'zh')).toBe('无特别偏好')
      expect(getPlanningStepSkipValue('age')).toBeUndefined()
    })
  })

  describe('validatePlanningAnswer', () => {
    it('rejects out-of-range numeric values', () => {
      expect(validatePlanningAnswer('age', 7)).toMatch(/cannot be below/)
      expect(validatePlanningAnswer('age', 105)).toMatch(/cannot be above/)
      expect(validatePlanningAnswer('age', 7, 'zh')).toMatch(/不能低于/)
      expect(validatePlanningAnswer('age', 30)).toBeNull()
    })

    it('rejects non-numeric values for number steps', () => {
      expect(validatePlanningAnswer('weightKg', 'heavy')).toMatch(/valid current weight/)
      expect(validatePlanningAnswer('weightKg', 'heavy', 'zh')).toMatch(/有效的/)
    })

    it('accepts valid choice values and rejects unknown ones', () => {
      expect(validatePlanningAnswer('gender', 'male')).toBeNull()
      expect(validatePlanningAnswer('gender', 'space-alien')).toMatch(/Please choose/)
      expect(validatePlanningAnswer('gender', 'space-alien', 'zh')).toMatch(/请选择/)
    })

    it('only requires a text answer when the step is non-optional', () => {
      // dietPreference is optional → empty is ok
      expect(validatePlanningAnswer('dietPreference', '')).toBeNull()
    })
  })

  describe('buildProfilePatch + formatPlanningAnswer', () => {
    it('returns the right field/type for each step', () => {
      expect(buildProfilePatch('age', '30')).toEqual({ age: 30 })
      expect(buildProfilePatch('gender', 'male')).toEqual({ gender: 'male' })
      expect(buildProfilePatch('weightKg', '70.5')).toEqual({ weightKg: 70.5 })
      expect(buildProfilePatch('dietPreference', '  清淡   口味 ')).toEqual({
        dietPreference: '清淡 口味',
      })
    })

    it('formats answers using human-readable labels', () => {
      expect(formatPlanningAnswer('age', 30)).toBe('30 years')
      expect(formatPlanningAnswer('gender', 'male')).toBe('Male')
      expect(formatPlanningAnswer('goal', 'lose_fat')).toBe('Fat loss')
      expect(formatPlanningAnswer('activityLevel', 'high')).toBe('Frequent training')
      expect(formatPlanningAnswer('age', 30, 'zh')).toBe('30 岁')
      expect(formatPlanningAnswer('gender', 'male', 'zh')).toBe(GENDER_LABELS.male)
      expect(formatPlanningAnswer('goal', 'lose_fat', 'zh')).toBe(GOAL_LABELS.lose_fat)
      expect(formatPlanningAnswer('activityLevel', 'high', 'zh')).toBe(
        ACTIVITY_LEVEL_LABELS.high,
      )
    })
  })

  describe('progress + initial step', () => {
    it('counts completed answers', () => {
      const progress = getPlanningProgress({
        age: 30,
        gender: 'male',
        weightKg: 70,
      })
      expect(progress.totalCount).toBe(13)
      expect(progress.completedCount).toBe(3)
      expect(progress.percent).toBe(Math.round((3 / 13) * 100))
    })

    it('returns the first incomplete step as the initial step', () => {
      expect(
        getInitialPlanningStepKey({ age: 30, gender: 'male' }),
      ).toBe('heightCm')
    })

    it('returns null when every profile step is complete', () => {
      expect(
        getInitialPlanningStepKey({
          age: 30,
          gender: 'male',
          heightCm: 175,
          weightKg: 70,
          targetWeightKg: 65,
          goal: 'lose_fat',
          activityLevel: 'medium',
          mealsPerDay: 3,
          dietPreference: 'simple meals',
          allergies: 'none',
          medicalNotes: 'none',
          cookingPreference: 'cook at home',
          scheduleNotes: 'regular office hours',
        }),
      ).toBeNull()
    })

    it('lists completed step keys in order', () => {
      expect(
        getCompletedPlanningStepKeys({ age: 30, gender: 'male', weightKg: 70 }),
      ).toEqual(['age', 'gender', 'weightKg'])
    })
  })

  describe('buildPlanningPrompt', () => {
    it('uses the step prompt when no value exists', () => {
      const prompt = buildPlanningPrompt('age', {})
      expect(prompt).toContain('age')
      expect(buildPlanningPrompt('age', {}, 'zh')).toContain('年龄')
    })

    it('produces a confirmation prompt when a value already exists', () => {
      const prompt = buildPlanningPrompt('age', { age: 30 })
      expect(prompt).toContain('30 years')
      expect(buildPlanningPrompt('age', { age: 30 }, 'zh')).toContain('30 岁')
    })
  })

  describe('buildPlanningFollowUps', () => {
    it('triggers age_caution when age < 18', () => {
      const questions = buildPlanningFollowUps({ age: 15 }, [])
      expect(questions.some((q) => q.code === 'age_caution')).toBe(true)
    })

    it('triggers bmi_low when bmi falls below 18.5', () => {
      const questions = buildPlanningFollowUps(
        { heightCm: 180, weightKg: 50 },
        [],
      )
      expect(questions.some((q) => q.code === 'bmi_low')).toBe(true)
    })

    it('does not duplicate codes already known', () => {
      const questions = buildPlanningFollowUps({ age: 15 }, ['age_caution'])
      expect(questions.some((q) => q.code === 'age_caution')).toBe(false)
    })
  })

  describe('mergePlanningNote', () => {
    it('returns the addition when current is empty / placeholder', () => {
      expect(mergePlanningNote(undefined, '新内容')).toBe('新内容')
      expect(mergePlanningNote('无', '新内容')).toBe('新内容')
      expect(mergePlanningNote('暂无额外安排', '新内容')).toBe('新内容')
    })

    it('returns current unchanged if it already contains the addition', () => {
      expect(mergePlanningNote('已有 含 新内容', '新内容')).toBe('已有 含 新内容')
    })

    it('joins with a Chinese semicolon when both have content', () => {
      expect(mergePlanningNote('existing', 'new')).toBe('existing; new')
      expect(mergePlanningNote('原有', '新增', 'zh')).toBe('原有；新增')
    })
  })

  describe('summarizePlanningProfile', () => {
    it('skips fields that are not set', () => {
      expect(summarizePlanningProfile({})).toEqual([])
      const partial = summarizePlanningProfile({ age: 30 })
      expect(partial).toContainEqual({ label: 'Age', value: '30 years' })
      expect(summarizePlanningProfile({ age: 30 }, 'zh')).toContainEqual({ label: '年龄', value: '30 岁' })
    })

    it('provides keyed profile summary items for direct editing', () => {
      const items = getPlanningProfileSummaryItems({
        age: 30,
        gender: 'male',
        dietPreference: 'simple meals',
      })

      expect(items).toContainEqual({ key: 'age', label: 'Age', value: '30 years' })
      expect(items).toContainEqual({ key: 'gender', label: 'Gender', value: 'Male' })
      expect(items).toContainEqual({ key: 'dietPreference', label: 'Diet preference', value: 'simple meals' })
    })
  })

  describe('normalizePlanningAnswer', () => {
    it('rounds integer fields and keeps 1 decimal for weight', () => {
      expect(normalizePlanningAnswer('age', 30.7)).toBe(31)
      expect(normalizePlanningAnswer('weightKg', 70.45)).toBe(70.5)
      expect(normalizePlanningAnswer('dietPreference', '  清淡  口味')).toBe(
        '清淡 口味',
      )
    })
  })

  describe('getPlanGenerationLabel', () => {
    it('reports model-name for AI plans and local-template labels', () => {
      expect(
        getPlanGenerationLabel({ generationMode: 'ai', generatedWithModel: 'gpt' }),
      ).toBe('AI generated · gpt')
      expect(
        getPlanGenerationLabel({ generationMode: 'local' }),
      ).toBe('Local template')
      expect(
        getPlanGenerationLabel({ generationMode: 'ai', generatedWithModel: 'gpt' }, 'zh'),
      ).toBe('模型生成 · gpt')
      expect(
        getPlanGenerationLabel({ generationMode: 'local' }, 'zh'),
      ).toBe('本地模板')
    })
  })

  describe('generatePlanningPlan (local fallback)', () => {
    it('returns a deterministic plan using the local template when no AI is configured', async () => {
      const plan = await generatePlanningPlan({
        id: 'current',
        age: 30,
        gender: 'male',
        heightCm: 175,
        weightKg: 70,
        targetWeightKg: 65,
        goal: 'lose_fat',
        activityLevel: 'medium',
        mealsPerDay: 3,
        completionStatus: 'completed',
        updatedAt: '2024-06-15T10:00:00Z',
      })

      expect(plan.generationMode).toBe('local')
      expect(plan.dailyCalorieTarget).toBeGreaterThan(1200)
      expect(plan.proteinTarget).toBeGreaterThanOrEqual(60)
      expect(plan.mealGuidance.length).toBeGreaterThanOrEqual(3)
      expect(plan.cautionNotes.length).toBeGreaterThanOrEqual(1)
    })
  })
})
