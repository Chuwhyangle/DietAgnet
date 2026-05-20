/**
 * Example tests for `knowledge/embedder.ts` (task 4.9, Requirement 2.4).
 *
 * `tokenizeKnowledgeText` and `embedKnowledgeText` are the lexical
 * helpers consumed by the reranker. Both are deterministic — given
 * identical input, they return an identical token list.
 */

import { describe, it, expect } from 'vitest'

import { embedKnowledgeText, tokenizeKnowledgeText } from '../embedder'

describe('knowledge/embedder', () => {
  it('returns deterministic tokens for the same input', () => {
    expect(tokenizeKnowledgeText('燕麦片 oats')).toEqual(
      tokenizeKnowledgeText('燕麦片 oats'),
    )
  })

  it('lowercases ASCII tokens', () => {
    expect(tokenizeKnowledgeText('Oats RICE')).toContain('oats')
    expect(tokenizeKnowledgeText('Oats RICE')).toContain('rice')
  })

  it('emits each Chinese character as its own token', () => {
    const tokens = tokenizeKnowledgeText('熟米饭')
    expect(tokens).toContain('熟')
    expect(tokens).toContain('米')
    expect(tokens).toContain('饭')
  })

  it('deduplicates repeated tokens', () => {
    const tokens = tokenizeKnowledgeText('rice rice 米饭 米饭')
    expect(tokens.filter((token) => token === 'rice')).toHaveLength(1)
    expect(tokens.filter((token) => token === '米')).toHaveLength(1)
  })

  it('returns an empty array for whitespace-only input', () => {
    expect(tokenizeKnowledgeText('   ')).toEqual([])
  })

  it('embedKnowledgeText wraps tokens in { terms }', () => {
    const result = embedKnowledgeText('hello 世界')
    expect(result).toEqual({
      terms: expect.arrayContaining(['hello', '世', '界']),
    })
  })
})
