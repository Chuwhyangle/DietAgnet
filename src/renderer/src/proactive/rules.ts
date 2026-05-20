import dayjs from 'dayjs'
import {
  getDietLog,
  getLogsForRange,
  getWeekBounds,
  mealTypeLabels,
  summarizeDietLog,
  type MealType,
} from '../stores/dietLog'
import {
  getLatestProactiveEventForRule,
  getRecentProactiveEventsForRule,
  saveProactiveEvent,
  type ProactiveEvent,
} from '../stores/planning'
import { getSettings, type ReminderSettings } from '../stores/settings'

export interface ProactiveReminder {
  event: ProactiveEvent
  title: string
  message: string
  actionLabel: string
  page: 'diet-log' | 'chat' | 'home'
}

interface MealReminderRule {
  id: string
  mealType: MealType
  afterHour: number
  title: string
  message: string
}

const MEAL_REMINDER_RULES: MealReminderRule[] = [
  {
    id: 'breakfast_check',
    mealType: 'breakfast',
    afterHour: 8,
    title: '早餐还没记哦',
    message: '吃过的话我可以帮你补一下；还没吃的话，也可以去挑几个简单早餐。',
  },
  {
    id: 'lunch_check',
    mealType: 'lunch',
    afterHour: 13,
    title: '午餐还没记录呢',
    message: '午餐记一下，猫猫虫才能帮你看下午和晚餐怎么安排。',
  },
  {
    id: 'dinner_check',
    mealType: 'dinner',
    afterHour: 20,
    title: '晚餐可以补记一下',
    message: '如果已经吃过晚餐，补一条记录就能让今天的统计更准。',
  },
]

const DISMISS_PAUSE_THRESHOLD = 3
const DISMISS_PAUSE_HOURS = 24
const MULTI_DAY_LOOKBACK_DAYS = 3

export function isReminderQuietHours(settings: ReminderSettings, now: dayjs.Dayjs): boolean {
  const hour = now.hour()
  const { quietStartHour, quietEndHour } = settings

  if (quietStartHour === quietEndHour) {
    return false
  }

  if (quietStartHour < quietEndHour) {
    return hour >= quietStartHour && hour < quietEndHour
  }

  return hour >= quietStartHour || hour < quietEndHour
}

function hasMealLogged(date: string, mealType: MealType): boolean {
  const log = getDietLog(date)
  const meal = log?.meals.find((entry) => entry.type === mealType)
  return Boolean(meal && meal.items.length > 0)
}

async function isRuleCoolingDown(ruleId: string, cooldownHours: number, now: dayjs.Dayjs): Promise<boolean> {
  const latestEvent = await getLatestProactiveEventForRule(ruleId)

  if (!latestEvent) {
    return false
  }

  if (latestEvent.cooldownUntil && dayjs(latestEvent.cooldownUntil).isAfter(now)) {
    return true
  }

  return dayjs(latestEvent.firedAt).add(cooldownHours, 'hour').isAfter(now)
}

async function isRulePausedByRepeatedDismissals(ruleId: string, now: dayjs.Dayjs): Promise<boolean> {
  const recentEvents = await getRecentProactiveEventsForRule(ruleId, DISMISS_PAUSE_THRESHOLD)

  if (recentEvents.length < DISMISS_PAUSE_THRESHOLD) {
    return false
  }

  const allDismissed = recentEvents.every((event) => event.userResponse === 'dismissed')
  if (!allDismissed) {
    return false
  }

  return dayjs(recentEvents[0].firedAt).add(DISMISS_PAUSE_HOURS, 'hour').isAfter(now)
}

async function canFireRule(ruleId: string, settings: ReminderSettings, now: dayjs.Dayjs): Promise<boolean> {
  if (isReminderQuietHours(settings, now)) {
    return false
  }

  if (await isRuleCoolingDown(ruleId, settings.cooldownHours, now)) {
    return false
  }

  return !(await isRulePausedByRepeatedDismissals(ruleId, now))
}

function getLoggedDaysInRecentWindow(now: dayjs.Dayjs, days: number): Array<{
  date: string
  calories: number
}> {
  const startDate = now.subtract(days - 1, 'day').format('YYYY-MM-DD')
  const endDate = now.format('YYYY-MM-DD')

  return getLogsForRange(startDate, endDate)
    .map((log) => ({
      date: log.date,
      calories: summarizeDietLog(log).calories,
    }))
    .filter((day) => day.calories > 0)
}

export async function checkMealReminder(now = dayjs()): Promise<ProactiveReminder | null> {
  const settings = getSettings()
  const reminderSettings = settings.reminders

  if (!reminderSettings.enabled || !reminderSettings.mealReminders) {
    return null
  }

  if (isReminderQuietHours(reminderSettings, now)) {
    return null
  }

  const date = now.format('YYYY-MM-DD')
  const candidateRule = MEAL_REMINDER_RULES.find((rule) => {
    return now.hour() >= rule.afterHour && !hasMealLogged(date, rule.mealType)
  })

  if (!candidateRule) {
    return null
  }

  if (!(await canFireRule(candidateRule.id, reminderSettings, now))) {
    return null
  }

  const event = await saveProactiveEvent({
    ruleId: candidateRule.id,
    trigger: 'context',
    priority: candidateRule.mealType === 'dinner' ? 'medium' : 'low',
    delivered: true,
    message: candidateRule.message,
    payload: {
      date,
      mealType: candidateRule.mealType,
      mealLabel: mealTypeLabels[candidateRule.mealType],
    },
  })

  return {
    event,
    title: candidateRule.title,
    message: candidateRule.message,
    actionLabel: '去记录',
    page: 'diet-log',
  }
}

export async function checkWeeklyReportReminder(now = dayjs()): Promise<ProactiveReminder | null> {
  const settings = getSettings()
  const reminderSettings = settings.reminders
  const ruleId = 'weekly_report'

  if (!reminderSettings.enabled || !reminderSettings.weeklyReportReminders) {
    return null
  }

  if (now.day() !== 0 || now.hour() < 20) {
    return null
  }

  if (!(await canFireRule(ruleId, reminderSettings, now))) {
    return null
  }

  const { startDate, endDate } = getWeekBounds(now.format('YYYY-MM-DD'))
  const latestEvent = await getLatestProactiveEventForRule(ruleId)
  if (latestEvent?.payload?.weekStart === startDate) {
    return null
  }

  const loggedDays = getLogsForRange(startDate, endDate)
    .filter((log) => summarizeDietLog(log).itemCount > 0)
    .length
  const message = `本周饮食记录已经到复盘时间：${startDate} 到 ${endDate}，已记录 ${loggedDays}/7 天。可以看看趋势，再决定下周怎么微调。`

  const event = await saveProactiveEvent({
    ruleId,
    trigger: 'cron',
    priority: 'medium',
    delivered: true,
    message,
    payload: {
      weekStart: startDate,
      weekEnd: endDate,
      loggedDays,
    },
  })

  return {
    event,
    title: '本周饮食复盘时间',
    message,
    actionLabel: '查看周报',
    page: 'diet-log',
  }
}

export async function checkOvercalorieStreakReminder(now = dayjs()): Promise<ProactiveReminder | null> {
  const settings = getSettings()
  const reminderSettings = settings.reminders
  const calorieGoal = settings.calorieGoal
  const ruleId = 'overcalorie_streak'

  if (!reminderSettings.enabled || !reminderSettings.planAdjustmentReminders || !calorieGoal) {
    return null
  }

  if (!(await canFireRule(ruleId, reminderSettings, now))) {
    return null
  }

  const recentDays = getLoggedDaysInRecentWindow(now, MULTI_DAY_LOOKBACK_DAYS)
  if (recentDays.length < MULTI_DAY_LOOKBACK_DAYS) {
    return null
  }

  const threshold = calorieGoal * 1.1
  const streakDays = recentDays.slice(-MULTI_DAY_LOOKBACK_DAYS)
  if (!streakDays.every((day) => day.calories > threshold)) {
    return null
  }

  const latestEvent = await getLatestProactiveEventForRule(ruleId)
  const windowKey = streakDays.map((day) => day.date).join(',')
  if (latestEvent?.payload?.windowKey === windowKey) {
    return null
  }

  const averageCalories = Math.round(
    streakDays.reduce((sum, day) => sum + day.calories, 0) / streakDays.length,
  )
  const message = `最近 ${MULTI_DAY_LOOKBACK_DAYS} 个有记录的日子平均 ${averageCalories} kcal，已经连续高于目标区间。建议先从晚餐油脂、饮料和零食频次做小调整。`
  const event = await saveProactiveEvent({
    ruleId,
    trigger: 'context',
    priority: 'medium',
    delivered: true,
    message,
    payload: {
      windowKey,
      dates: streakDays.map((day) => day.date),
      calorieGoal,
      averageCalories,
    },
  })

  return {
    event,
    title: '连续几天热量偏高',
    message,
    actionLabel: '看今日记录',
    page: 'diet-log',
  }
}

export async function checkPlanDriftReminder(now = dayjs()): Promise<ProactiveReminder | null> {
  const settings = getSettings()
  const reminderSettings = settings.reminders
  const calorieGoal = settings.calorieGoal
  const ruleId = 'open_app_plandrift'

  if (!reminderSettings.enabled || !reminderSettings.planAdjustmentReminders || !calorieGoal) {
    return null
  }

  if (!(await canFireRule(ruleId, reminderSettings, now))) {
    return null
  }

  const { startDate, endDate } = getWeekBounds(now.format('YYYY-MM-DD'))
  const loggedDays = getLogsForRange(startDate, endDate)
    .map((log) => ({
      date: log.date,
      summary: summarizeDietLog(log),
    }))
    .filter((day) => day.summary.itemCount > 0)

  if (loggedDays.length < 3) {
    return null
  }

  const averageCalories = Math.round(
    loggedDays.reduce((sum, day) => sum + day.summary.calories, 0) / loggedDays.length,
  )
  const driftRatio = (averageCalories - calorieGoal) / calorieGoal

  if (Math.abs(driftRatio) < 0.15) {
    return null
  }

  const latestEvent = await getLatestProactiveEventForRule(ruleId)
  const windowKey = `${startDate}:${endDate}:${driftRatio > 0 ? 'high' : 'low'}`
  if (latestEvent?.payload?.windowKey === windowKey) {
    return null
  }

  const isHigh = driftRatio > 0
  const message = isHigh
    ? `本周已记录日均 ${averageCalories} kcal，比目标高约 ${Math.round(driftRatio * 100)}%。建议把接下来一两餐调清淡一点，而不是删除已经发生的记录。`
    : `本周已记录日均 ${averageCalories} kcal，比目标低约 ${Math.abs(Math.round(driftRatio * 100))}%。如果不是刻意控制，建议安排蛋白质和适量主食补足。`
  const event = await saveProactiveEvent({
    ruleId,
    trigger: 'context',
    priority: 'medium',
    delivered: true,
    message,
    payload: {
      windowKey,
      weekStart: startDate,
      weekEnd: endDate,
      calorieGoal,
      averageCalories,
      driftRatio,
      loggedDays: loggedDays.length,
    },
  })

  return {
    event,
    title: isHigh ? '本周计划有点偏高' : '本周摄入可能偏低',
    message,
    actionLabel: '查看周报',
    page: 'diet-log',
  }
}

export async function checkProactiveReminder(now = dayjs()): Promise<ProactiveReminder | null> {
  return (
    await checkOvercalorieStreakReminder(now) ??
    await checkPlanDriftReminder(now) ??
    await checkWeeklyReportReminder(now) ??
    await checkMealReminder(now)
  )
}

export function getSnoozeUntil(hours = 2): string {
  return dayjs().add(hours, 'hour').toISOString()
}
