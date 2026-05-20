/**
 * Example tests for `memory/matcher.ts` (task 4.10, Requirement 2.4).
 *
 * `matcher.ts` exposes pure helpers — no I/O, no clock — used by the
 * memory manager to score candidates and decide whether two memories
 * should merge:
 *   - `normalizeMemoryContent` — trim/lowercase/collapse-whitespace.
 *   - `normalizeMemoryTags`    — same, plus dedupe and 12-tag cap.
 *   - `getMemoryMatchScore`    — text/tag overlap + confidence.
 *   - `areMemoriesSimilar`     — same type + (exact normalized
 *     content match | ≥75% token overlap | shared tag with substring
 *     containment).
 */

import { describe, it, expect } from 'vitest'

import {
  areMemoriesSimilar,
  getMemoryMatchScore,
  normalizeMemoryContent,
  normalizeMemoryTags,
} from '../matcher'
import { makeUserMemory } from '../../../../test/factories/userMemory'

describe('memory/matcher', () => {
  describe('normalizeMemoryContent', () => {
    it('trims, lowercases, and collapses whitespace', () => {
      expect(normalizeMemoryContent('  Hello   World  ')).toBe('hello world')
    })

    it('is idempotent', () => {
      const once = normalizeMemoryContent(' 喜欢 清淡 口味 ')
      expect(normalizeMemoryContent(once)).toBe(once)
    })
  })

  describe('normalizeMemoryTags', () => {
    it('lowercases, dedupes, and caps at 12 tags', () => {
      const tags = normalizeMemoryTags([
        'Allergy',
        'allergy',
        'Peanut',
        ' peanut ',
        ...Array.from({ length: 15 }, (_, i) => `tag-${i}`),
      ])
      expect(tags).toContain('allergy')
      expect(tags.filter((t) => t === 'allergy')).toHaveLength(1)
      expect(tags).toHaveLength(12)
    })

    it('drops empty strings', () => {
      expect(normalizeMemoryTags(['', '  ', 'kept'])).toEqual(['kept'])
    })
  })

  describe('getMemoryMatchScore', () => {
    it('adds 8 when the query text is a substring of normalizedContent', () => {
      const memory = makeUserMemory({
        type: 'preference',
        content: '喜欢清淡口味',
        normalizedContent: '喜欢清淡口味',
        tags: [],
        confidence: 0.5,
      })
      const score = getMemoryMatchScore(memory, { text: '清淡' })
      expect(score).toBeGreaterThanOrEqual(8)
    })

    it('adds 4 per matched tag', () => {
      const memory = makeUserMemory({
        type: 'allergy',
        content: '花生过敏',
        normalizedContent: '花生过敏',
        tags: ['allergy', 'peanut'],
        confidence: 0,
      })
      const score = getMemoryMatchScore(memory, { tags: ['allergy', 'peanut'] })
      expect(score).toBeGreaterThanOrEqual(8)
    })

    it('returns at least the confidence value when no other terms match', () => {
      const memory = makeUserMemory({
        content: 'unrelated',
        normalizedContent: 'unrelated',
        tags: [],
        confidence: 0.5,
      })
      expect(getMemoryMatchScore(memory, {})).toBeCloseTo(0.5)
    })
  })

  describe('areMemoriesSimilar', () => {
    it('rejects pairs of differing types', () => {
      const left = makeUserMemory({
        type: 'preference',
        normalizedContent: 'foo',
        tags: ['x'],
      })
      expect(
        areMemoriesSimilar(left, {
          type: 'allergy',
          normalizedContent: 'foo',
          tags: ['x'],
        }),
      ).toBe(false)
    })

    it('treats exact normalizedContent as a match', () => {
      const left = makeUserMemory({
        type: 'preference',
        normalizedContent: '喜欢清淡',
        tags: [],
      })
      expect(
        areMemoriesSimilar(left, {
          type: 'preference',
          normalizedContent: '喜欢清淡',
          tags: [],
        }),
      ).toBe(true)
    })

    it('treats high token overlap as a match', () => {
      const left = makeUserMemory({
        type: 'preference',
        normalizedContent: '喜欢清淡 少盐',
        tags: [],
      })
      expect(
        areMemoriesSimilar(left, {
          type: 'preference',
          normalizedContent: '喜欢清淡 少盐 口味',
          tags: [],
        }),
      ).toBe(true)
    })
  })
})
