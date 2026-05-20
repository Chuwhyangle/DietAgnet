import dayjs from 'dayjs'
import type {
  DietLogExportRequest,
  DietLogExportResponse,
} from '../../../shared/dietLog'
import {
  getAllDietLogs,
  getDietLog,
  getLogsForRange,
  getWeekBounds,
  mealTypeLabels,
  summarizeDietLog,
  type DietLog,
  type MealItem,
  type MealType,
  type NutritionSummary,
} from '../stores/dietLog'

export type DietLogExportScope = 'day' | 'week' | 'all'
export type DietLogExportFormat = 'json' | 'csv'

export interface DietLogExportPayload {
  version: 1
  exportedAt: string
  scope: DietLogExportScope
  startDate?: string
  endDate?: string
  logs: DietLog[]
  summary: NutritionSummary
}

interface DietLogExportOptions {
  scope: DietLogExportScope
  date: string
}

interface CsvRow {
  date: string
  mealType: MealType
  mealLabel: string
  itemIndex: number
  recipeId: string
  name: string
  servings: number
  calories: number
  protein: number
  carbs: number
  fat: number
}

function summarizeLogs(logs: DietLog[]): NutritionSummary {
  return logs.reduce<NutritionSummary>(
    (summary, log) => {
      const current = summarizeDietLog(log)
      summary.calories += current.calories
      summary.protein += current.protein
      summary.carbs += current.carbs
      summary.fat += current.fat
      summary.mealCount += current.mealCount
      summary.itemCount += current.itemCount
      return summary
    },
    {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      mealCount: 0,
      itemCount: 0,
    },
  )
}

function getLogsForScope(options: DietLogExportOptions): {
  logs: DietLog[]
  startDate?: string
  endDate?: string
} {
  if (options.scope === 'all') {
    const logs = getAllDietLogs()
    return {
      logs,
      startDate: logs[0]?.date,
      endDate: logs[logs.length - 1]?.date,
    }
  }

  if (options.scope === 'week') {
    const { startDate, endDate } = getWeekBounds(options.date)
    return {
      logs: getLogsForRange(startDate, endDate),
      startDate,
      endDate,
    }
  }

  const log = getDietLog(options.date)
  return {
    logs: log ? [log] : [],
    startDate: options.date,
    endDate: options.date,
  }
}

function flattenLogs(logs: DietLog[]): CsvRow[] {
  return logs.flatMap((log) => {
    return log.meals.flatMap((meal) => {
      return meal.items.map((item: MealItem, itemIndex) => ({
        date: log.date,
        mealType: meal.type,
        mealLabel: mealTypeLabels[meal.type],
        itemIndex,
        recipeId: item.recipeId,
        name: item.name,
        servings: item.servings,
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
      }))
    })
  })
}

function csvEscape(value: string | number): string {
  const text = String(value)
  if (!/[",\n\r]/.test(text)) {
    return text
  }

  return `"${text.replace(/"/g, '""')}"`
}

function toCsv(payload: DietLogExportPayload): string {
  const header = [
    'date',
    'mealType',
    'mealLabel',
    'itemIndex',
    'recipeId',
    'name',
    'servings',
    'calories',
    'protein',
    'carbs',
    'fat',
  ]
  const rows = flattenLogs(payload.logs).map((row) => {
    return [
      row.date,
      row.mealType,
      row.mealLabel,
      row.itemIndex,
      row.recipeId,
      row.name,
      row.servings,
      row.calories,
      row.protein,
      row.carbs,
      row.fat,
    ].map(csvEscape).join(',')
  })

  return [header.join(','), ...rows].join('\n')
}

export function serializeDietLogExport(
  payload: DietLogExportPayload,
  format: DietLogExportFormat,
): {
  content: string
  mimeType: string
  extension: 'json' | 'csv'
} {
  if (format === 'json') {
    return {
      content: JSON.stringify(payload, null, 2),
      mimeType: 'application/json;charset=utf-8',
      extension: 'json',
    }
  }

  return {
    content: `\uFEFF${toCsv(payload)}`,
    mimeType: 'text/csv;charset=utf-8',
    extension: 'csv',
  }
}

function buildExportRequest(params: {
  payload: DietLogExportPayload
  format: DietLogExportFormat
  date: string
  scope: DietLogExportScope
}): DietLogExportRequest {
  const { payload, format, date, scope } = params
  const serialized = serializeDietLogExport(payload, format)
  const dateLabel = scope === 'all'
    ? 'all'
    : scope === 'week'
      ? `${payload.startDate ?? date}_to_${payload.endDate ?? date}`
      : date
  const defaultFileName = `diet-log-${scope}-${dateLabel}-${dayjs().format('YYYYMMDD-HHmmss')}.${serialized.extension}`

  return {
    defaultFileName,
    mimeType: serialized.mimeType,
    content: serialized.content,
    filters: [
      {
        name: format.toUpperCase(),
        extensions: [serialized.extension],
      },
    ],
  }
}

export function buildDietLogExportPayload(options: DietLogExportOptions): DietLogExportPayload {
  const { logs, startDate, endDate } = getLogsForScope(options)

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    scope: options.scope,
    startDate,
    endDate,
    logs,
    summary: summarizeLogs(logs),
  }
}

export async function exportDietLogs(options: DietLogExportOptions & {
  format: DietLogExportFormat
}): Promise<{
  payload: DietLogExportPayload
  result: DietLogExportResponse
}> {
  const payload = buildDietLogExportPayload(options)
  const request = buildExportRequest({
    payload,
    format: options.format,
    date: options.date,
    scope: options.scope,
  })
  const result = await window.dietLog.exportFile(request)

  return {
    payload,
    result,
  }
}
