/**
 * Example tests for `coaching/auditLog.ts` (task 4.1, Requirements
 * 2.1, 2.6, 2.7).
 *
 * `auditLog.ts` is a thin Dexie wrapper that:
 *   - `writeAuditEntry` stamps `timestamp = new Date().toISOString()`
 *     and appends to `planningDb.coachingAuditLog`.
 *   - `getRecentAuditEntries(limit)` orders by `timestamp` desc and
 *     enforces `Math.max(1, limit)` (default 50).
 *
 * The shared `src/test/setup.ts` deletes every IndexedDB database in
 * `afterEach`, so each `it` block starts from an empty schema. We
 * pair `vi.useFakeTimers()` with `vi.useRealTimers()` so timestamps
 * are deterministic but the unflushed-timer detector stays happy.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { writeAuditEntry, getRecentAuditEntries } from '../auditLog'
import { resetPlanningDb } from '../../../../test/doubles/dexie'

describe('coaching/auditLog', () => {
  beforeEach(async () => {
    await resetPlanningDb()
    // Fake only `Date` (not setTimeout/setInterval) so Dexie's internal
    // timers continue to fire under real-clock semantics. If we faked
    // setTimeout here, every Dexie write would hang forever.
    vi.useFakeTimers({
      now: new Date('2024-06-15T10:00:00Z'),
      toFake: ['Date'],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('writeAuditEntry', () => {
    it('persists with the current ISO timestamp and returns the row with an id', async () => {
      const saved = await writeAuditEntry({
        actor: 'system',
        action: 'plan.accept',
        payload: { planId: 7 },
      })

      expect(saved.id).toEqual(expect.any(Number))
      expect(saved.timestamp).toBe('2024-06-15T10:00:00.000Z')
      expect(saved.action).toBe('plan.accept')
      expect(saved.payload).toEqual({ planId: 7 })
    })

    it('writes consecutive entries with their own auto-incremented ids', async () => {
      const first = await writeAuditEntry({
        actor: 'user',
        action: 'a',
        payload: {},
      })
      const second = await writeAuditEntry({
        actor: 'user',
        action: 'b',
        payload: {},
      })

      expect(typeof first.id).toBe('number')
      expect(typeof second.id).toBe('number')
      expect(second.id).not.toBe(first.id)
    })
  })

  describe('getRecentAuditEntries', () => {
    it('returns entries ordered by timestamp descending', async () => {
      await writeAuditEntry({ actor: 'system', action: 'first', payload: {} })
      vi.advanceTimersByTime(1_000)
      await writeAuditEntry({ actor: 'system', action: 'second', payload: {} })
      vi.advanceTimersByTime(1_000)
      await writeAuditEntry({ actor: 'system', action: 'third', payload: {} })

      const recent = await getRecentAuditEntries()
      expect(recent.map((entry) => entry.action)).toEqual([
        'third',
        'second',
        'first',
      ])
    })

    it('respects an explicit limit', async () => {
      for (let i = 0; i < 5; i += 1) {
        await writeAuditEntry({
          actor: 'agent',
          action: `action-${i}`,
          payload: {},
        })
        vi.advanceTimersByTime(1_000)
      }

      const recent = await getRecentAuditEntries(2)
      expect(recent).toHaveLength(2)
      // Most-recent two come back first.
      expect(recent.map((entry) => entry.action)).toEqual([
        'action-4',
        'action-3',
      ])
    })

    it('clamps non-positive limits up to 1', async () => {
      await writeAuditEntry({ actor: 'system', action: 'only', payload: {} })

      const zero = await getRecentAuditEntries(0)
      const negative = await getRecentAuditEntries(-3)

      expect(zero).toHaveLength(1)
      expect(negative).toHaveLength(1)
      expect(zero[0].action).toBe('only')
    })

    it('returns an empty array when no entries exist', async () => {
      const recent = await getRecentAuditEntries()
      expect(recent).toEqual([])
    })

    it('defaults to a 50-entry cap when no limit is supplied', async () => {
      // Insert 60 entries with monotonically increasing timestamps so
      // ordering is deterministic and we can see the cut-off.
      for (let i = 0; i < 60; i += 1) {
        await writeAuditEntry({
          actor: 'system',
          action: `entry-${i}`,
          payload: { i },
        })
        vi.advanceTimersByTime(1_000)
      }

      const recent = await getRecentAuditEntries()
      expect(recent).toHaveLength(50)
      // Oldest entry kept should be entry-10 (we wrote 0..59 in order;
      // newest 50 = 10..59 inclusive, then reversed for display).
      expect(recent[0].action).toBe('entry-59')
      expect(recent[recent.length - 1].action).toBe('entry-10')
    })
  })
})
