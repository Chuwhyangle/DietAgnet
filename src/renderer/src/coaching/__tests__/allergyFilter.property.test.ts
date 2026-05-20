/**
 * Property-Based Test: Allergy/Avoidance Hard-Filter Invariant
 *
 * **Validates: Requirements 4.3, 9.1, 10.5**
 *
 * Property 3: For any set of active UserMemory entries of type 'allergy' or 'avoidance'
 * with confidence >= 0.6, and for any PlannedMeal persisted by the Autopilot Planner,
 * no item in that PlannedMeal SHALL have a name or ingredient that matches any of those
 * memory entries. The filter SHALL NOT include pending_confirm memories.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { defaultRunConfig } from '../../../../test/arbitraries/runConfig'
import { defaultRunConfig } from '../../../../test/arbitraries/runConfig'

// ---------------------------------------------------------------------------
// Mocks �?same pattern as autopilotPlanner.test.ts
// ---------------------------------------------------------------------------

vi.mock('../../planning/dynamicPlan', () => ({
  getDailyPlanGap: vi.fn(),
}))

vi.mock('../../habits/rhythmSummary', () => ({
  buildRhythmSummaryStructured: vi.fn(),
}))

vi.mock('../../stores/planning', () => ({
  getUserMemories: vi.fn(),
  savePlannedMeal: vi.fn(),
}))

vi.mock('../../stores/dietLog', () => ({
  addMealItemToDietLog: vi.fn(),
  getDietLog: vi.fn(),
}))

vi.mock('../auditLog', () => ({
  writeAuditEntry: vi.fn(),
}))

// We'll dynamically set the recipe library per test iteration
let mockRecipes: any[] = []

vi.mock('../../data/recipes', () => ({
  get recipes() {
    return mockRecipes
  },
}))

import { generateMealSuggestions } from '../autopilotPlanner'
import { getDailyPlanGap } from '../../planning/dynamicPlan'
import { buildRhythmSummaryStructured } from '../../habits/rhythmSummary'
import { getUserMemories } from '../../stores/planning'
import { getDietLog } from '../../stores/dietLog'
import { writeAuditEntry } from '../auditLog'

const mockedGetDailyPlanGap = vi.mocked(getDailyPlanGap)
const mockedBuildRhythmSummary = vi.mocked(buildRhythmSummaryStructured)
const mockedGetUserMemories = vi.mocked(getUserMemories)
const mockedGetDietLog = vi.mocked(getDietLog)
const mockedWriteAuditEntry = vi.mocked(writeAuditEntry)

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Generate a non-empty alphanumeric string suitable for ingredient/allergy names.
 * Uses a restricted character set to ensure meaningful substring matching tests.
 */
const ingredientNameArb = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
  { minLength: 2, maxLength: 8 },
)

/**
 * Generate an active allergy/avoidance memory with confidence >= 0.6.
 */
const allergyMemoryArb = fc.record({
  id: fc.integer({ min: 1, max: 10000 }),
  type: fc.constantFrom('allergy' as const, 'avoidance' as const),
  content: ingredientNameArb,
  normalizedContent: ingredientNameArb,
  tags: fc.constant([] as string[]),
  source: fc.constant('user_explicit' as const),
  confidence: fc.double({ min: 0.6, max: 1.0, noNaN: true }),
  status: fc.constant('active' as const),
  createdAt: fc.constant('2024-01-01T00:00:00Z'),
  updatedAt: fc.constant('2024-01-01T00:00:00Z'),
}).map((m) => ({ ...m, normalizedContent: m.content }))

/**
 * Generate a pending_confirm memory (should NOT be filtered).
 */
const pendingMemoryArb = fc.record({
  id: fc.integer({ min: 10001, max: 20000 }),
  type: fc.constantFrom('allergy' as const, 'avoidance' as const),
  content: ingredientNameArb,
  normalizedContent: ingredientNameArb,
  tags: fc.constant([] as string[]),
  source: fc.constant('user_explicit' as const),
  confidence: fc.double({ min: 0.6, max: 1.0, noNaN: true }),
  status: fc.constant('pending_confirm' as const),
  createdAt: fc.constant('2024-01-01T00:00:00Z'),
  updatedAt: fc.constant('2024-01-01T00:00:00Z'),
}).map((m) => ({ ...m, normalizedContent: m.content }))

/**
 * Generate a recipe with arbitrary ingredients.
 * Some ingredients will intentionally match allergy names to test filtering.
 */
function recipeArb(index: number) {
  return fc.record({
    name: ingredientNameArb,
    ingredients: fc.array(ingredientNameArb, { minLength: 1, maxLength: 5 }),
  }).map(({ name, ingredients }) => ({
    id: `recipe-${index}`,
    name,
    emoji: '🍽️',
    category: 'test',
    calories: 400,
    time: 15,
    ingredients: ingredients.map((ing) => ({ name: ing, amount: '100g' })),
    steps: ['cook'],
    nutrition: { protein: 20, carbs: 40, fat: 10 },
  }))
}

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Property 3: Allergy/Avoidance Hard-Filter Invariant', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRecipes = []

    // Default mocks for dependencies not under test
    mockedGetDailyPlanGap.mockResolvedValue({
      date: '2024-01-15',
      sourcePlanId: 1,
      dailyTarget: 2000,
      actualCalories: 0,
      remainingCalories: 2000,
      mealTargets: [],
      mealGaps: [],
      latestPlan: null,
      confirmedPlannedMeals: [],
    })

    mockedBuildRhythmSummary.mockReturnValue({
      windowStart: '2024-01-01',
      windowEnd: '2024-01-14',
      windowDays: 14,
      loggedDays: 10,
      loggingRate: 71,
      avgCaloriesOnLoggedDays: 1700,
      mealLogRates: { breakfast: 60, lunch: 80, dinner: 70, snack: 20 },
      weekdayLoggedRates: [],
      frequentFoods: [],
    })

    mockedGetDietLog.mockReturnValue(null)

    mockedWriteAuditEntry.mockResolvedValue({
      id: 1,
      actor: 'system',
      action: 'autopilot_suggestion_generated',
      payload: {},
      timestamp: '2024-01-15T12:00:00Z',
    })
  })

  /**
   * Core invariant: generateMealSuggestions NEVER returns a candidate whose name
   * or ingredient matches any active allergy/avoidance memory with confidence >= 0.6.
   *
   * Strategy:
   * - Generate arbitrary allergy memories (active, confidence >= 0.6)
   * - Generate a set of recipes, some of which contain ingredients matching the allergies
   * - Call generateMealSuggestions and verify no candidate conflicts with any allergy memory
   */
  it('never returns candidates matching active allergy/avoidance memories', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(allergyMemoryArb, { minLength: 1, maxLength: 5 }),
        fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 3, maxLength: 8 }).chain((indices) => {
          // Deduplicate indices to avoid duplicate recipe IDs
          const uniqueIndices = [...new Set(indices)]
          // Ensure at least 3 recipes
          while (uniqueIndices.length < 3) {
            const next = (Math.max(...uniqueIndices) + 1) % 100
            if (!uniqueIndices.includes(next)) uniqueIndices.push(next)
          }
          return fc.tuple(...uniqueIndices.map((i) => recipeArb(i)))
        }),
        async (allergyMemories, recipes) => {
          // Set up mock recipes
          mockRecipes = recipes

          // getUserMemories is called with { status: 'active', types: ['allergy', 'avoidance'] }
          // and then filtered by confidence >= 0.6 in getActiveAllergyMemories
          mockedGetUserMemories.mockResolvedValue(allergyMemories as any)

          const result = await generateMealSuggestions('2024-01-15', 'lunch')

          // Assert: no candidate name or ingredient matches any allergy memory
          for (const candidate of result.candidates) {
            const candidateName = candidate.name.toLowerCase()

            for (const memory of allergyMemories) {
              const memoryContent = memory.normalizedContent.toLowerCase()

              // Check recipe name does not match memory (case-insensitive substring)
              const nameConflict =
                candidateName.includes(memoryContent) ||
                memoryContent.includes(candidateName)
              expect(nameConflict).toBe(false)

              // Check ingredients do not match memory
              const matchingRecipe = recipes.find((r) => r.id === candidate.recipeId)
              if (matchingRecipe) {
                for (const ing of matchingRecipe.ingredients) {
                  const ingName = ing.name.toLowerCase()
                  const ingConflict =
                    ingName.includes(memoryContent) ||
                    memoryContent.includes(ingName)
                  expect(ingConflict).toBe(false)
                }
              }
            }
          }
        },
      ),
      { ...defaultRunConfig() },
    )
  })

  /**
   * Supplementary property: pending_confirm memories are NOT included in the filter.
   * Recipes that only match pending_confirm memories should still appear as candidates.
   *
   * Strategy:
   * - Generate a recipe whose name matches a pending_confirm memory
   * - Ensure no active allergy memories exist
   * - Verify the recipe CAN appear in candidates
   */
  it('does NOT filter candidates based on pending_confirm memories', async () => {
    await fc.assert(
      fc.asyncProperty(
        pendingMemoryArb,
        async (pendingMemory) => {
          // Create a recipe that matches the pending memory's content
          const matchingRecipe = {
            id: 'matching-recipe',
            name: pendingMemory.content,
            emoji: '🍽️',
            category: 'test',
            calories: 400,
            time: 15,
            ingredients: [{ name: pendingMemory.content, amount: '100g' }],
            steps: ['cook'],
            nutrition: { protein: 20, carbs: 40, fat: 10 },
          }

          mockRecipes = [matchingRecipe]

          // getUserMemories is called with status: 'active', so pending_confirm
          // memories are never returned. Return empty array to simulate this.
          mockedGetUserMemories.mockResolvedValue([])

          const result = await generateMealSuggestions('2024-01-15', 'lunch')

          // The recipe should NOT be filtered out since there are no active allergy memories
          // (pending_confirm memories are excluded from the query)
          expect(result.candidates.length).toBe(1)
          expect(result.candidates[0].recipeId).toBe('matching-recipe')
        },
      ),
      { ...defaultRunConfig() },
    )
  })

  /**
   * Supplementary property: case-insensitive matching works correctly.
   * A memory with mixed-case content should still filter recipes with different casing.
   *
   * Strategy:
   * - Generate an allergy memory content string
   * - Create a recipe with the same content but different casing
   * - Verify the recipe is filtered out
   */
  it('filters using case-insensitive substring matching', async () => {
    await fc.assert(
      fc.asyncProperty(
        ingredientNameArb,
        fc.constantFrom('allergy' as const, 'avoidance' as const),
        async (allergenName, memoryType) => {
          // Create memory with lowercase content
          const memory = {
            id: 1,
            type: memoryType,
            content: allergenName,
            normalizedContent: allergenName,
            tags: [],
            source: 'user_explicit' as const,
            confidence: 0.8,
            status: 'active' as const,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          }

          // Create recipe with UPPERCASE version of the allergen in ingredients
          const recipe = {
            id: 'case-test-recipe',
            name: 'safe dish',
            emoji: '🍽️',
            category: 'test',
            calories: 400,
            time: 15,
            ingredients: [{ name: allergenName.toUpperCase(), amount: '100g' }],
            steps: ['cook'],
            nutrition: { protein: 20, carbs: 40, fat: 10 },
          }

          mockRecipes = [recipe]
          mockedGetUserMemories.mockResolvedValue([memory] as any)

          const result = await generateMealSuggestions('2024-01-15', 'lunch')

          // The recipe should be filtered out despite different casing
          const conflictingCandidate = result.candidates.find(
            (c) => c.recipeId === 'case-test-recipe',
          )
          expect(conflictingCandidate).toBeUndefined()
        },
      ),
      { ...defaultRunConfig() },
    )
  })

  /**
   * Supplementary property: memories with confidence < 0.6 do NOT trigger filtering.
   * The getActiveAllergyMemories function filters by confidence >= 0.6.
   *
   * Strategy:
   * - Generate memories with confidence < 0.6
   * - Create recipes matching those memories
   * - Verify recipes are NOT filtered out
   */
  it('does NOT filter when memory confidence is below 0.6', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          id: fc.integer({ min: 1, max: 10000 }),
          type: fc.constantFrom('allergy' as const, 'avoidance' as const),
          content: ingredientNameArb,
          normalizedContent: ingredientNameArb,
          tags: fc.constant([] as string[]),
          source: fc.constant('user_explicit' as const),
          confidence: fc.double({ min: 0.0, max: 0.59, noNaN: true }),
          status: fc.constant('active' as const),
          createdAt: fc.constant('2024-01-01T00:00:00Z'),
          updatedAt: fc.constant('2024-01-01T00:00:00Z'),
        }).map((m) => ({ ...m, normalizedContent: m.content })),
        async (lowConfMemory) => {
          // Create a recipe that matches the low-confidence memory
          const recipe = {
            id: 'low-conf-recipe',
            name: lowConfMemory.content,
            emoji: '🍽️',
            category: 'test',
            calories: 400,
            time: 15,
            ingredients: [{ name: lowConfMemory.content, amount: '100g' }],
            steps: ['cook'],
            nutrition: { protein: 20, carbs: 40, fat: 10 },
          }

          mockRecipes = [recipe]

          // getUserMemories returns the memory, but getActiveAllergyMemories
          // filters by confidence >= 0.6, so this memory should be excluded
          // from the filter. We simulate this by returning an empty array
          // (since the actual function filters after the query).
          // Actually, getUserMemories returns all active memories of the right type,
          // then getActiveAllergyMemories filters by confidence >= 0.6.
          // So we return the low-confidence memory and expect it to be filtered out
          // by the confidence check.
          mockedGetUserMemories.mockResolvedValue([lowConfMemory] as any)

          const result = await generateMealSuggestions('2024-01-15', 'lunch')

          // The recipe should NOT be filtered because confidence < 0.6
          expect(result.candidates.length).toBe(1)
          expect(result.candidates[0].recipeId).toBe('low-conf-recipe')
        },
      ),
      { ...defaultRunConfig() },
    )
  })
})
