/**
 * Property 8: Memory matcher order insensitivity
 *
 * Invariant: shuffling the active `UserMemory[]` input yields an equal
 * match decision — i.e. the scores returned by `getMemoryMatchScore`
 * for each memory are independent of the order in which the list is
 * processed, and `areMemoriesSimilar` comparisons are symmetric with
 * respect to list ordering.
 *
 * **Validates: Requirement 3.8**
 */

import * as fc from 'fast-check'
import { describe, it, expect } from 'vitest'

import { getMemoryMatchScore, areMemoriesSimilar } from '../matcher'
import { arbUserMemory } from '../../../../test/arbitraries/memory'
import { defaultRunConfig } from '../../../../test/arbitraries/runConfig'
import type { UserMemory } from '../../stores/planning'

/**
 * Generate a query object with optional text and tags for scoring.
 */
const arbQuery = fc.record({
  text: fc.option(
    fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim().length > 0),
    { nil: undefined },
  ),
  tags: fc.option(
    fc.array(
      fc.string({ minLength: 1, maxLength: 16 }).filter((s) => s.trim().length > 0).map((s) => s.toLowerCase()),
      { minLength: 0, maxLength: 4 },
    ),
    { nil: undefined },
  ),
})

describe('Property 8: Memory matcher order insensitivity', () => {
  it('shuffling active UserMemory[] yields equal match scores', async () => {
    /**
     * Validates: Requirement 3.8
     *
     * For any list of active memories and any query, scoring each
     * memory individually produces the same set of (id, score) pairs
     * regardless of the order the memories appear in the list.
     */
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbUserMemory(), { minLength: 1, maxLength: 10 })
          .map((memories) => memories.filter((m) => m.status === 'active'))
          .filter((memories) => memories.length >= 2),
        arbQuery,
        fc.nat(),
        async (activeMemories, query, seed) => {
          // Assign unique indices so we can track identity after shuffle
          const indexed = activeMemories.map((m, i) => ({ ...m, _idx: i }))

          // Score in original order
          const originalScores = indexed.map((m) => ({
            idx: m._idx,
            score: getMemoryMatchScore(m as UserMemory, query),
          }))

          // Create a shuffled copy using the seed for determinism
          const shuffled = [...indexed]
          // Fisher-Yates shuffle seeded by the generated nat
          let s = seed
          for (let i = shuffled.length - 1; i > 0; i--) {
            s = (s * 1664525 + 1013904223) >>> 0
            const j = s % (i + 1)
            ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
          }

          // Score in shuffled order
          const shuffledScores = shuffled.map((m) => ({
            idx: m._idx,
            score: getMemoryMatchScore(m as UserMemory, query),
          }))

          // Sort both by index for comparison
          const sortByIdx = (a: { idx: number; score: number }, b: { idx: number; score: number }) => a.idx - b.idx
          originalScores.sort(sortByIdx)
          shuffledScores.sort(sortByIdx)

          expect(shuffledScores).toEqual(originalScores)
        },
      ),
      defaultRunConfig(),
    )
  })

  it('areMemoriesSimilar is independent of list position', async () => {
    /**
     * Validates: Requirement 3.8
     *
     * For any pair of memories drawn from a shuffled list, the
     * similarity decision is the same regardless of which order
     * the pair is encountered during iteration.
     */
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbUserMemory(), { minLength: 2, maxLength: 8 })
          .map((memories) => memories.filter((m) => m.status === 'active'))
          .filter((memories) => memories.length >= 2),
        async (activeMemories) => {
          // Compare all pairs in original order
          const originalDecisions: boolean[] = []
          for (let i = 0; i < activeMemories.length; i++) {
            for (let j = i + 1; j < activeMemories.length; j++) {
              const left = activeMemories[i]
              const right = activeMemories[j]
              originalDecisions.push(
                areMemoriesSimilar(left, {
                  type: right.type,
                  normalizedContent: right.normalizedContent,
                  tags: right.tags,
                }),
              )
            }
          }

          // Reverse the list and compare all pairs again
          const reversed = [...activeMemories].reverse()
          const reversedDecisions: boolean[] = []
          for (let i = 0; i < reversed.length; i++) {
            for (let j = i + 1; j < reversed.length; j++) {
              const left = reversed[i]
              const right = reversed[j]
              reversedDecisions.push(
                areMemoriesSimilar(left, {
                  type: right.type,
                  normalizedContent: right.normalizedContent,
                  tags: right.tags,
                }),
              )
            }
          }

          // The set of all pairwise decisions should be the same
          // (same pairs, just encountered in different order)
          expect(originalDecisions.sort()).toEqual(reversedDecisions.sort())
        },
      ),
      defaultRunConfig(),
    )
  })
})
