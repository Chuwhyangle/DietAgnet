import dayjs from 'dayjs'
import {
  getLogsForRange,
  summarizeDietLog,
  type DietLog,
  type MealType,
} from '../stores/dietLog'

const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export interface RhythmSummaryReport {
  windowStart: string
  windowEnd: string
  windowDays: number
  loggedDays: number
  loggingRate: number
  avgCaloriesOnLoggedDays: number
  mealLogRates: Record<MealType, number>
  weekdayLoggedRates: Array<{ weekday: number; label: string; rate: number }>
  frequentFoods: Array<{ name: string; count: number }>
}

function mealHadItems(log: DietLog | null, mealType: MealType): boolean {
  if (!log) {
    return false
  }

  const meal = log.meals.find((m) => m.type === mealType)
  return Boolean(meal && meal.items.length > 0)
}

export function buildRhythmSummaryStructured(lookbackDays = 14): RhythmSummaryReport {
  const end = dayjs()
  const start = end.subtract(lookbackDays - 1, 'day')
  const startDate = start.format('YYYY-MM-DD')
  const endDate = end.format('YYYY-MM-DD')
  const logs = getLogsForRange(startDate, endDate)

  const byDate = new Map<string, DietLog>()
  for (const log of logs) {
    byDate.set(log.date, log)
  }

  let cursor = start.clone()
  let loggedDays = 0
  let totalCalOnLogged = 0
  const weekdayLogged = new Array(7).fill(0) as number[]
  const weekdayTotal = new Array(7).fill(0) as number[]
  const mealDaysWith: Record<MealType, number> = {
    breakfast: 0,
    lunch: 0,
    dinner: 0,
    snack: 0,
  }
  const foodCounts = new Map<string, number>()

  while (!cursor.isAfter(end, 'day')) {
    const dateStr = cursor.format('YYYY-MM-DD')
    const wd = cursor.day()
    weekdayTotal[wd] += 1

    const log = byDate.get(dateStr) ?? null
    const summary = summarizeDietLog(log)
    if (summary.itemCount > 0) {
      loggedDays += 1
      totalCalOnLogged += summary.calories
      weekdayLogged[wd] += 1
      for (const mt of MEAL_ORDER) {
        if (mealHadItems(log, mt)) {
          mealDaysWith[mt] += 1
        }
      }

      if (log) {
        for (const meal of log.meals) {
          for (const item of meal.items) {
            const key = item.name.trim()
            if (key) {
              foodCounts.set(key, (foodCounts.get(key) ?? 0) + 1)
            }
          }
        }
      }
    }

    cursor = cursor.add(1, 'day')
  }

  const windowDays = lookbackDays
  const loggingRate = windowDays > 0 ? Math.round((loggedDays / windowDays) * 100) : 0
  const avgCaloriesOnLoggedDays = loggedDays > 0 ? Math.round(totalCalOnLogged / loggedDays) : 0

  const mealLogRates = {} as Record<MealType, number>
  for (const mt of MEAL_ORDER) {
    mealLogRates[mt] = windowDays > 0 ? Math.round((mealDaysWith[mt] / windowDays) * 100) : 0
  }

  const weekdayLoggedRates = weekdayTotal.map((total, weekday) => ({
    weekday,
    label: WEEKDAY_LABELS[weekday],
    rate: total > 0 ? Math.round((weekdayLogged[weekday] / total) * 100) : 0,
  }))

  const frequentFoods = Array.from(foodCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  return {
    windowStart: startDate,
    windowEnd: endDate,
    windowDays,
    loggedDays,
    loggingRate,
    avgCaloriesOnLoggedDays,
    mealLogRates,
    weekdayLoggedRates,
    frequentFoods,
  }
}

export function formatRhythmSummaryForPrompt(report: RhythmSummaryReport): string {
  if (report.loggedDays === 0) {
    return [
      '## 近期记录节奏（本地统计）',
      `- 统计窗口：${report.windowStart} ~ ${report.windowEnd}（${report.windowDays} 天）`,
      '- 该窗口内几乎没有有效饮食条目；不要推断用户作息，可温和建议从固定一餐开始记录。',
      '',
    ].join('\n')
  }

  const mealLines = MEAL_ORDER.map((mt) => {
    const label = mt === 'breakfast' ? '早餐' : mt === 'lunch' ? '午餐' : mt === 'dinner' ? '晚餐' : '加餐'
    return `- ${label}有记录的天数占比：${report.mealLogRates[mt]}%`
  }).join('\n')

  const weakWeekdays = report.weekdayLoggedRates
    .filter((d) => d.rate < 35 && d.weekday >= 1 && d.weekday <= 5)
    .map((d) => d.label)

  const topFoods = report.frequentFoods.length > 0
    ? report.frequentFoods.map((f) => `${f.name}×${f.count}`).join('、')
    : '（暂无重复条目）'

  const weekdayLine = weakWeekdays.length > 0
    ? `- 工作日中记录偏少的星期：${weakWeekdays.join('、')}（仅表示「有没有记」，不代表没吃）`
    : '- 工作日各天记录覆盖相对均匀'

  return [
    '## 近期记录节奏（本地统计）',
    `- 统计窗口：${report.windowStart} ~ ${report.windowEnd}（${report.windowDays} 天）`,
    `- 有记录的天数：${report.loggedDays}/${report.windowDays}（约 ${report.loggingRate}%）`,
    `- 有记录日的平均热量：约 ${report.avgCaloriesOnLoggedDays} kcal/天`,
    mealLines,
    weekdayLine,
    `- 常出现的食物（按出现次数）：${topFoods}`,
    '',
    '使用说明：这是从本地饮食日志聚合的客观统计，不要当成医学结论；若用户当天说法与统计冲突，以用户当下说法为准。',
  ].join('\n')
}
