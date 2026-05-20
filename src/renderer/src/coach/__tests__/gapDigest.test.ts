/**
 * Example tests for `coach/gapDigest.ts` (task 4.3, Requirement 2.2).
 *
 * `gapDigest.ts` exports two pure formatters that turn a `DailyPlanGap`
 * + optional `DynamicPlanSuggestion` into the user-facing strings
 * surfaced by the coach (`buildPlanGapDigestPlain` for desktop
 * notifications, `buildCoachDigestMarkdown` for in-chat).
 *
 * The functions are deterministic — the only time-dependent value is
 * the `M月D日` date label, which we feed via the gap's `date` field
 * (no wall-clock reads).
 */

import { describe, it, expect } from 'vitest'

import { buildCoachDigestMarkdown, buildPlanGapDigestPlain } from '../gapDigest'
import type { DailyPlanGap, DynamicPlanSuggestion } from '../../planning/dynamicPlan'

function makeGap(overrides: Partial<DailyPlanGap> = {}): DailyPlanGap {
  return {
    date: '2024-06-15',
    dailyTarget: 2000,
    actualCalories: 1500,
    remainingCalories: 500,
    actualProtein: 80,
    actualCarbs: 200,
    actualFat: 50,
    proteinTarget: 100,
    carbsTarget: 250,
    fatTarget: 60,
    remainingProtein: 20,
    remainingCarbs: 50,
    remainingFat: 10,
    plan: undefined,
    ...overrides,
  } as unknown as DailyPlanGap
}

describe('coach/gapDigest', () => {
  describe('buildPlanGapDigestPlain', () => {
    it('reports remaining calories when under the daily target', () => {
      const text = buildPlanGapDigestPlain(makeGap())
      expect(text).toMatch(/^6月15日：/)
      expect(text).toContain('已记录 1500 kcal')
      expect(text).toContain('目标 2000 kcal')
      expect(text).toContain('全天还剩约 500 kcal')
    })

    it('reports overage when actual calories exceed the daily target', () => {
      const text = buildPlanGapDigestPlain(
        makeGap({ actualCalories: 2300, remainingCalories: -300 }),
      )
      expect(text).toContain('当前比计划多出约 300 kcal')
      expect(text).not.toContain('全天还剩约')
    })

    it('treats actual === target as under-budget (no overage branch)', () => {
      const text = buildPlanGapDigestPlain(
        makeGap({ actualCalories: 2000, remainingCalories: 0 }),
      )
      expect(text).toContain('全天还剩约 0 kcal')
    })
  })

  describe('buildCoachDigestMarkdown', () => {
    it('returns a single-line headline plus a calm note when no suggestion is available', () => {
      const md = buildCoachDigestMarkdown({
        gap: makeGap(),
        suggestion: null,
      })
      expect(md).toContain('**【饮食快照 · 6月15日】**')
      expect(md).toContain('节奏与计划接近，继续按平常吃就好。')
      expect(md).not.toContain('展开建议')
    })

    it('returns the calm note when the suggestion is "maintain"', () => {
      const suggestion: DynamicPlanSuggestion = {
        date: '2024-06-15',
        suggestionType: 'maintain',
        suggestionText: '保持节奏即可',
        recommendedMealWindow: undefined,
        suggestedCalories: 0,
        deltaCalories: 0,
        plannedCalories: 2000,
        actualCalories: 1500,
        ruleId: 'maintain',
        sourcePlanId: 1,
        mealType: undefined,
      } as unknown as DynamicPlanSuggestion

      const md = buildCoachDigestMarkdown({ gap: makeGap(), suggestion })
      expect(md).toContain('节奏与计划接近')
      expect(md).not.toContain('展开建议')
    })

    it('appends the suggestion body and saved-adjustment hint when an id is provided', () => {
      const suggestion: DynamicPlanSuggestion = {
        date: '2024-06-15',
        suggestionType: 'supplement',
        suggestionText: '建议补一份高蛋白餐',
        recommendedMealWindow: '14:00-15:00',
        suggestedCalories: 300,
        deltaCalories: -300,
        plannedCalories: 2000,
        actualCalories: 1500,
        ruleId: 'supplement_low',
        sourcePlanId: 1,
        mealType: 'snack',
      } as unknown as DynamicPlanSuggestion

      const md = buildCoachDigestMarkdown({
        gap: makeGap(),
        suggestion,
        savedAdjustmentId: 42,
      })

      expect(md).toContain('展开建议')
      expect(md).toContain('建议补一份高蛋白餐')
      expect(md).toContain('建议记录 ID：42')
    })

    it('appends a "not persisted" hint when no savedAdjustmentId is provided', () => {
      const suggestion: DynamicPlanSuggestion = {
        date: '2024-06-15',
        suggestionType: 'reduce',
        suggestionText: '今晚可以少一份米饭',
        recommendedMealWindow: '18:30-19:00',
        suggestedCalories: -200,
        deltaCalories: 200,
        plannedCalories: 2000,
        actualCalories: 2200,
        ruleId: 'reduce_high',
        sourcePlanId: 1,
        mealType: 'dinner',
      } as unknown as DynamicPlanSuggestion

      const md = buildCoachDigestMarkdown({
        gap: makeGap({
          actualCalories: 2200,
          remainingCalories: -200,
        }),
        suggestion,
      })

      expect(md).toContain('今晚可以少一份米饭')
      expect(md).toContain('未写入待确认建议记录')
      expect(md).not.toContain('建议记录 ID：')
    })
  })
})
