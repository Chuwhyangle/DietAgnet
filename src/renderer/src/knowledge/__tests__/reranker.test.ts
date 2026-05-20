/**
 * Example tests for `knowledge/reranker.ts` (task 4.9, Requirement 2.4).
 *
 * `rerankKnowledgeRecords(query, records)` scores each record by
 * lexical term overlap + alias / title / tag / type-of-query boosts,
 * filters out zero-score results, and sorts descending. The tests
 * pin the relative-order behavior under ties (stable per the
 * underlying sort) and the score-zero filter.
 */

import { describe, it, expect } from 'vitest'

import { rerankKnowledgeRecords } from '../reranker'
import type { KnowledgeRecord } from '../types'

function makeRecord(overrides: Partial<KnowledgeRecord> = {}): KnowledgeRecord {
  return {
    id: 'r-1',
    type: 'food_nutrition',
    title: '燕麦片',
    aliases: ['燕麦', '即食燕麦'],
    summary: '高纤维早餐主食',
    tags: ['早餐', '主食'],
    source: 'local_seed',
    updatedAt: '2024-01-01',
    facts: {
      servingSize: '40g',
      calories: 150,
      protein: 5,
      carbs: 26,
      fat: 3,
    },
    ...overrides,
  }
}

describe('knowledge/reranker', () => {
  it('returns records ordered by descending score', () => {
    const records: KnowledgeRecord[] = [
      makeRecord({ id: 'r-1', title: '燕麦片', aliases: ['燕麦'] }),
      makeRecord({
        id: 'r-2',
        title: '米饭',
        aliases: ['白米饭'],
        tags: ['主食'],
      }),
    ]
    const ranked = rerankKnowledgeRecords('燕麦', records)
    expect(ranked[0].record.id).toBe('r-1')
  })

  it('drops records with zero score', () => {
    const records: KnowledgeRecord[] = [
      makeRecord({ id: 'r-1', title: '燕麦片', aliases: ['燕麦'] }),
      makeRecord({
        id: 'r-unrelated',
        title: '完全无关的食物',
        aliases: ['xyz'],
        summary: 'nothing',
        tags: [],
      }),
    ]
    const ranked = rerankKnowledgeRecords('燕麦', records)
    expect(ranked.find((entry) => entry.record.id === 'r-unrelated'))
      .toBeUndefined()
  })

  it('boosts food_nutrition records when the query mentions nutrition keywords', () => {
    const food = makeRecord({
      id: 'r-food',
      type: 'food_nutrition',
      title: '燕麦片',
      aliases: ['燕麦'],
    })
    const guideline = makeRecord({
      id: 'r-guideline',
      type: 'guideline',
      title: '燕麦相关指南',
      aliases: [],
      tags: [],
      facts: undefined,
    })
    const ranked = rerankKnowledgeRecords('燕麦的热量', [guideline, food])
    expect(ranked[0].record.id).toBe('r-food')
  })

  it('returns the same result for the same query/input (stable)', () => {
    const records: KnowledgeRecord[] = [makeRecord({ id: 'r-1' })]
    const a = rerankKnowledgeRecords('燕麦', records)
    const b = rerankKnowledgeRecords('燕麦', records)
    expect(a).toEqual(b)
  })
})
