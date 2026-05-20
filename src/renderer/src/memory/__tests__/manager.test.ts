/**
 * Example tests for `memory/manager.ts` (task 4.10, Requirements
 * 2.4, 2.7).
 *
 * The manager wraps the planning store with merge-on-similar logic
 * for `remember`, scored ranking for `recall`, and small wrappers
 * for forget / list / confidence updates. We drive it against
 * `Fake_Dexie` (planningDb under fake-indexeddb) seeded with a clean
 * schema by `setup.ts`.
 */

import { describe, it, expect, beforeEach } from 'vitest'

import {
  remember,
  recall,
  forget,
  listUserFacts,
  updateMemoryConfidence,
} from '../manager'
import { resetPlanningDb } from '../../../../test/doubles/dexie'

describe('memory/manager', () => {
  beforeEach(async () => {
    await resetPlanningDb()
  })

  describe('remember', () => {
    it('saves a new memory and returns merged=false', async () => {
      const result = await remember({
        type: 'preference',
        content: '喜欢清淡口味',
        tags: ['preference'],
        confidence: 0.8,
      })

      expect(result.merged).toBe(false)
      expect(result.memory.id).toBeTypeOf('number')
      expect(result.memory.type).toBe('preference')
      expect(result.memory.confidence).toBe(0.8)
    })

    it('merges with an existing similar memory when called twice', async () => {
      const first = await remember({
        type: 'preference',
        content: '喜欢清淡',
        confidence: 0.7,
      })
      const second = await remember({
        type: 'preference',
        content: '喜欢清淡',
        confidence: 0.85,
      })

      expect(second.merged).toBe(true)
      expect(second.memory.id).toBe(first.memory.id)
      expect(second.memory.confidence).toBe(0.85)
    })

    it('throws when the content is too short', async () => {
      await expect(
        remember({ type: 'preference', content: 'x' }),
      ).rejects.toThrow(/记忆内容太短/)
    })

    it('clamps confidence above 1 down to 1 and below 0 up to 0', async () => {
      const high = await remember({
        type: 'preference',
        content: 'very confident memory',
        confidence: 5,
      })
      const low = await remember({
        type: 'goal',
        content: 'very low confidence memory',
        confidence: -1,
      })
      expect(high.memory.confidence).toBe(1)
      expect(low.memory.confidence).toBe(0)
    })
  })

  describe('recall', () => {
    it('returns memories ranked by score for a text query', async () => {
      await remember({
        type: 'preference',
        content: '喜欢清淡口味',
        tags: ['preference', 'flavor'],
      })
      await remember({
        type: 'allergy',
        content: '花生过敏',
        tags: ['allergy', 'peanut'],
      })

      const matches = await recall({ text: '清淡' })
      expect(matches.length).toBeGreaterThanOrEqual(1)
      expect(matches[0].content).toContain('清淡')
    })

    it('returns up to `limit` memories, default 8', async () => {
      for (let i = 0; i < 12; i += 1) {
        await remember({
          type: 'preference',
          content: `偏好 ${i} 号`,
          confidence: 0.7,
        })
      }
      const all = await recall()
      expect(all.length).toBeLessThanOrEqual(8)
    })
  })

  describe('forget', () => {
    it('archives the targeted memory and returns it', async () => {
      const { memory } = await remember({
        type: 'preference',
        content: '过期的偏好',
      })
      const archived = await forget(memory.id!, 'no_longer_relevant')
      expect(archived.status).toBe('archived')
      expect(archived.archivedReason).toBe('no_longer_relevant')
    })

    it('throws when the memory id does not exist', async () => {
      await expect(forget(99_999)).rejects.toThrow(/没有找到要删除的记忆/)
    })
  })

  describe('listUserFacts', () => {
    it('returns active memories by default', async () => {
      await remember({ type: 'preference', content: 'active fact' })
      const list = await listUserFacts()
      expect(list).toHaveLength(1)
      expect(list[0].status).toBe('active')
    })
  })

  describe('updateMemoryConfidence', () => {
    it('updates an existing memory and clamps the value', async () => {
      const { memory } = await remember({
        type: 'preference',
        content: '可调节信心的记忆',
      })
      const updated = await updateMemoryConfidence(memory.id!, 1.7)
      expect(updated.confidence).toBe(1)
    })

    it('throws when the memory id does not exist', async () => {
      await expect(updateMemoryConfidence(99_999, 0.5)).rejects.toThrow(
        /没有找到要更新的记忆/,
      )
    })
  })
})
