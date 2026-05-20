/**
 * Example tests for `export/dietLogExport.ts` (task 4.7, Requirement 2.4).
 *
 * The module exposes three pure-ish helpers:
 *   - `buildDietLogExportPayload` — reads `dietLog` store rows and
 *     wraps them in a versioned `DietLogExportPayload`.
 *   - `serializeDietLogExport`     — turns a payload into JSON or CSV.
 *   - `exportDietLogs`             — composes the two and forwards the
 *     serialized blob to `window.dietLog.exportFile`.
 *
 * The store reads from `localStorage` under `LOG_PREFIX = 'diet-agent-log-'`
 * (see `stores/dietLog.ts`), so we seed via that prefix rather than
 * mocking the store. The shared setup file in `src/test/setup.ts`
 * clears `localStorage` between tests, so each `it` starts clean.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

import {
  buildDietLogExportPayload,
  serializeDietLogExport,
  exportDietLogs,
} from '../dietLogExport'
import type { DietLog } from '../../stores/dietLog'

const LOG_PREFIX = 'diet-agent-log-'

function seedDietLog(log: DietLog): void {
  localStorage.setItem(`${LOG_PREFIX}${log.date}`, JSON.stringify(log))
}

const sampleLog: DietLog = {
  date: '2024-06-15',
  meals: [
    {
      type: 'lunch',
      items: [
        {
          recipeId: 'r-1',
          name: '番茄炒蛋',
          emoji: '🍳',
          servings: 1,
          calories: 400,
          protein: 25,
          carbs: 40,
          fat: 16,
        },
      ],
    },
  ],
}

describe('export/dietLogExport', () => {
  describe('buildDietLogExportPayload', () => {
    it('produces an empty payload when no logs are seeded', () => {
      const payload = buildDietLogExportPayload({
        scope: 'day',
        date: '2024-06-15',
      })
      expect(payload.version).toBe(1)
      expect(payload.scope).toBe('day')
      expect(payload.logs).toEqual([])
      expect(payload.summary.calories).toBe(0)
      expect(payload.summary.itemCount).toBe(0)
    })

    it('returns the seeded log for scope="day" with a matching summary', () => {
      seedDietLog(sampleLog)
      const payload = buildDietLogExportPayload({
        scope: 'day',
        date: '2024-06-15',
      })
      expect(payload.logs).toEqual([sampleLog])
      expect(payload.summary.calories).toBe(400)
      expect(payload.summary.protein).toBe(25)
      expect(payload.summary.itemCount).toBe(1)
      expect(payload.summary.mealCount).toBe(1)
    })

    it('returns all seeded logs for scope="all"', () => {
      seedDietLog({ ...sampleLog, date: '2024-06-15' })
      seedDietLog({ ...sampleLog, date: '2024-06-16' })

      const payload = buildDietLogExportPayload({
        scope: 'all',
        date: '2024-06-15',
      })
      expect(payload.logs.map((log) => log.date).sort()).toEqual([
        '2024-06-15',
        '2024-06-16',
      ])
    })
  })

  describe('serializeDietLogExport', () => {
    it('produces pretty JSON for format="json"', () => {
      const payload = {
        version: 1 as const,
        exportedAt: '2024-06-15T10:00:00.000Z',
        scope: 'day' as const,
        startDate: '2024-06-15',
        endDate: '2024-06-15',
        logs: [sampleLog],
        summary: {
          calories: 400,
          protein: 25,
          carbs: 40,
          fat: 16,
          mealCount: 1,
          itemCount: 1,
        },
      }
      const result = serializeDietLogExport(payload, 'json')
      expect(result.extension).toBe('json')
      expect(result.mimeType).toBe('application/json;charset=utf-8')
      const parsed = JSON.parse(result.content)
      expect(parsed.version).toBe(1)
      expect(parsed.logs).toHaveLength(1)
      expect(parsed.logs[0].meals[0].items[0].name).toBe('番茄炒蛋')
    })

    it('produces a UTF-8 BOM-prefixed CSV with header + one row per item', () => {
      const payload = {
        version: 1 as const,
        exportedAt: '2024-06-15T10:00:00.000Z',
        scope: 'day' as const,
        startDate: '2024-06-15',
        endDate: '2024-06-15',
        logs: [sampleLog],
        summary: {
          calories: 400,
          protein: 25,
          carbs: 40,
          fat: 16,
          mealCount: 1,
          itemCount: 1,
        },
      }
      const result = serializeDietLogExport(payload, 'csv')
      expect(result.extension).toBe('csv')
      expect(result.mimeType).toBe('text/csv;charset=utf-8')
      // First char is the UTF-8 BOM so Excel renders Chinese correctly.
      expect(result.content.charCodeAt(0)).toBe(0xfeff)
      const lines = result.content.slice(1).split('\n')
      expect(lines[0]).toBe(
        'date,mealType,mealLabel,itemIndex,recipeId,name,servings,calories,protein,carbs,fat',
      )
      expect(lines[1]).toContain('番茄炒蛋')
      expect(lines[1]).toContain('400')
    })

    it('escapes commas and quotes in CSV values', () => {
      const tricky: DietLog = {
        date: '2024-06-16',
        meals: [
          {
            type: 'snack',
            items: [
              {
                recipeId: 'r-tricky',
                name: '苹果, 香蕉 "拼盘"',
                servings: 1,
                calories: 120,
                protein: 1,
                carbs: 30,
                fat: 0,
              },
            ],
          },
        ],
      }
      const result = serializeDietLogExport(
        {
          version: 1,
          exportedAt: '2024-06-16T08:00:00.000Z',
          scope: 'day',
          startDate: '2024-06-16',
          endDate: '2024-06-16',
          logs: [tricky],
          summary: {
            calories: 120,
            protein: 1,
            carbs: 30,
            fat: 0,
            mealCount: 1,
            itemCount: 1,
          },
        },
        'csv',
      )
      expect(result.content).toContain('"苹果, 香蕉 ""拼盘"""')
    })
  })

  describe('exportDietLogs', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('forwards the serialized payload to window.dietLog.exportFile', async () => {
      seedDietLog(sampleLog)
      const exportFile = vi.fn(() =>
        Promise.resolve({ canceled: false, filePath: '/tmp/x.json' }),
      )
      vi.stubGlobal('dietLog', { exportFile })

      const { payload, result } = await exportDietLogs({
        scope: 'day',
        date: '2024-06-15',
        format: 'json',
      })

      expect(payload.logs).toEqual([sampleLog])
      expect(result.canceled).toBe(false)
      expect(exportFile).toHaveBeenCalledTimes(1)
      const request = exportFile.mock.calls[0][0]
      expect(request.mimeType).toBe('application/json;charset=utf-8')
      expect(request.defaultFileName).toMatch(
        /^diet-log-day-2024-06-15-\d{8}-\d{6}\.json$/,
      )
      expect(request.filters[0].extensions).toEqual(['json'])
    })
  })
})
