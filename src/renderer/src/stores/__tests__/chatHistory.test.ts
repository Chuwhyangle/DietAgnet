/**
 * Example tests for `stores/chatHistory.ts` (task 4.13, Requirements
 * 2.5, 2.8).
 *
 * The store is a `localStorage`-backed list capped at 200 entries.
 */

import { describe, it, expect } from 'vitest'

import {
  loadChatHistory,
  saveChatHistory,
  clearChatHistory,
  appendCoachChatMessage,
  type PersistedChatMessage,
} from '../chatHistory'

const STORAGE_KEY = 'diet-agent-chat-history'

function makeMsg(overrides: Partial<PersistedChatMessage> = {}): PersistedChatMessage {
  return {
    id: 'm-1',
    kind: 'user',
    content: 'hello',
    timestamp: '2024-06-15T10:00:00.000Z',
    ...overrides,
  }
}

describe('stores/chatHistory', () => {
  it('returns [] when nothing is persisted', () => {
    expect(loadChatHistory()).toEqual([])
  })

  it('round-trips a persisted history', () => {
    saveChatHistory([makeMsg(), makeMsg({ id: 'm-2', kind: 'assistant' })])
    const loaded = loadChatHistory()
    expect(loaded).toHaveLength(2)
    expect(loaded[1].kind).toBe('assistant')
  })

  it('drops malformed entries during load', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([
      { id: 'good', kind: 'user', content: 'ok', timestamp: '' },
      { id: 'bad', content: 'no kind' },
      'string-not-object',
    ]))
    const loaded = loadChatHistory()
    expect(loaded.map((m) => m.id)).toEqual(['good'])
  })

  it('returns [] when JSON is invalid', () => {
    localStorage.setItem(STORAGE_KEY, 'not-json')
    expect(loadChatHistory()).toEqual([])
  })

  it('caps the persisted history at 200 entries (most recent kept)', () => {
    const messages = Array.from({ length: 250 }, (_, i) =>
      makeMsg({ id: `m-${i}`, content: String(i) }),
    )
    saveChatHistory(messages)
    const loaded = loadChatHistory()
    expect(loaded).toHaveLength(200)
    expect(loaded[0].id).toBe('m-50')
    expect(loaded[loaded.length - 1].id).toBe('m-249')
  })

  it('clearChatHistory empties the store', () => {
    saveChatHistory([makeMsg()])
    clearChatHistory()
    expect(loadChatHistory()).toEqual([])
  })

  describe('appendCoachChatMessage', () => {
    it('appends a coach message and returns it', () => {
      const appended = appendCoachChatMessage('digest')
      expect(appended).not.toBeNull()
      expect(appended?.kind).toBe('coach')
      expect(loadChatHistory()).toHaveLength(1)
    })

    it('skips appending when the previous coach message has identical content', () => {
      appendCoachChatMessage('digest')
      const dup = appendCoachChatMessage('digest')
      expect(dup).toBeNull()
      expect(loadChatHistory()).toHaveLength(1)
    })

    it('appends when content differs from the previous coach message', () => {
      appendCoachChatMessage('first')
      const second = appendCoachChatMessage('second')
      expect(second).not.toBeNull()
      expect(loadChatHistory()).toHaveLength(2)
    })
  })
})
