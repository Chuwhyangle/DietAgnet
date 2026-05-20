import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
import { isReminderQuietHours } from '../proactive/rules'
import { getDietLog, getLogsForRange, type MealType, mealTypeLabels } from '../stores/dietLog'
import {
  getLatestProactiveEventForRule,
  getRecentProactiveEventsForRule,
  saveProactiveEvent,
  type ProactiveEvent,
} from '../stores/planning'
import { getSettings } from '../stores/settings'
import type { SchedulerTickResult } from './types'

dayjs.extend(isoWeek)

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FOREGROUND_TICK_INTERVAL_MS = 10 * 60 * 1000 // 10 minutes
const ESCALATION_THRESHOLD_MINUTES = 90
const DISMISS_PAUSE_THRESHOLD = 3
const DISMISS_PAUSE_HOURS = 24
const WEEKLY_CHECKIN_RULE_ID = 'coaching_weekly_checkin'
const WEEKLY_CHECKIN_MIN_LOGGED_DAYS = 3

interface MealReminderConfig {
  ruleId: string
  mealType: MealType
  afterHour: number
  title: string
  message: string
}

const MEAL_REMINDER_CONFIGS: MealReminderConfig[] = [
  {
    ruleId: 'coaching_breakfast_reminder',
    mealType: 'breakfast',
    afterHour: 8,
    title: '早餐还没记哦',
    message: '吃过的话我可以帮你补一下；还没吃的话，也可以去挑几个简单早餐。',
  },
  {
    ruleId: 'coaching_lunch_reminder',
    mealType: 'lunch',
    afterHour: 13,
    title: '午餐还没记录呢',
    message: '午餐记一下，猫猫虫才能帮你看下午和晚餐怎么安排。',
  },
  {
    ruleId: 'coaching_dinner_reminder',
    mealType: 'dinner',
    afterHour: 20,
    title: '晚餐可以补记一下',
    message: '如果已经吃过晚餐，补一条记录就能让今天的统计更准。',
  },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasMealLogged(date: string, mealType: MealType): boolean {
  const log = getDietLog(date)
  const meal = log?.meals.find((entry) => entry.type === mealType)
  return Boolean(meal && meal.items.length > 0)
}

async function isRuleCoolingDown(ruleId: string, now: dayjs.Dayjs): Promise<boolean> {
  const latestEvent = await getLatestProactiveEventForRule(ruleId)
  if (!latestEvent) {
    return false
  }

  if (latestEvent.cooldownUntil && dayjs(latestEvent.cooldownUntil).isAfter(now)) {
    return true
  }

  // Also respect the settings cooldown
  const settings = getSettings()
  const cooldownHours = settings.reminders.cooldownHours
  return dayjs(latestEvent.firedAt).add(cooldownHours, 'hour').isAfter(now)
}

async function isRulePausedByDismissals(ruleId: string, now: dayjs.Dayjs): Promise<boolean> {
  const recentEvents = await getRecentProactiveEventsForRule(ruleId, DISMISS_PAUSE_THRESHOLD)

  if (recentEvents.length < DISMISS_PAUSE_THRESHOLD) {
    return false
  }

  const allDismissed = recentEvents.every((event) => event.userResponse === 'dismissed')
  if (!allDismissed) {
    return false
  }

  // Pause for 24 hours from the most recent (third) dismissal
  return dayjs(recentEvents[0].firedAt).add(DISMISS_PAUSE_HOURS, 'hour').isAfter(now)
}

async function canFireRule(ruleId: string, now: dayjs.Dayjs): Promise<boolean> {
  if (await isRuleCoolingDown(ruleId, now)) {
    return false
  }

  return !(await isRulePausedByDismissals(ruleId, now))
}

/**
 * Determine the consecutive dismiss count for a rule.
 */
async function getDismissCount(ruleId: string): Promise<number> {
  const recentEvents = await getRecentProactiveEventsForRule(ruleId, DISMISS_PAUSE_THRESHOLD)
  let count = 0
  for (const event of recentEvents) {
    if (event.userResponse === 'dismissed') {
      count++
    } else {
      break
    }
  }
  return count
}

/**
 * Check if a meal reminder should be escalated.
 * Escalation happens when a meal reminder fired but the meal is still unlogged
 * after 90 minutes.
 */
async function shouldEscalate(
  ruleId: string,
  mealType: MealType,
  date: string,
  now: dayjs.Dayjs,
): Promise<boolean> {
  if (hasMealLogged(date, mealType)) {
    return false
  }

  const latestEvent = await getLatestProactiveEventForRule(ruleId)
  if (!latestEvent) {
    return false
  }

  // Only escalate events from today
  const eventDate = dayjs(latestEvent.firedAt).format('YYYY-MM-DD')
  if (eventDate !== date) {
    return false
  }

  // Check if already escalated (don't double-escalate)
  const escalationLevel = (latestEvent.payload?.escalationLevel as number) ?? 0
  if (escalationLevel >= 1) {
    return false
  }

  // Check if 90 minutes have passed since the last firing
  const minutesSinceFired = now.diff(dayjs(latestEvent.firedAt), 'minute')
  return minutesSinceFired >= ESCALATION_THRESHOLD_MINUTES
}

/**
 * Get the number of days with diet logs in the current ISO week.
 */
function getLoggedDaysThisWeek(now: dayjs.Dayjs): number {
  const weekStart = now.startOf('isoWeek')
  const startDate = weekStart.format('YYYY-MM-DD')
  const endDate = now.format('YYYY-MM-DD')

  const logs = getLogsForRange(startDate, endDate)
  return logs.filter((log) => log.meals.some((meal) => meal.items.length > 0)).length
}

/**
 * Check if the weekly check-in has already fired this ISO week.
 */
async function hasWeeklyCheckinFiredThisWeek(now: dayjs.Dayjs): Promise<boolean> {
  const latestEvent = await getLatestProactiveEventForRule(WEEKLY_CHECKIN_RULE_ID)
  if (!latestEvent) {
    return false
  }

  const eventWeek = dayjs(latestEvent.firedAt).isoWeek()
  const eventYear = dayjs(latestEvent.firedAt).isoWeekYear()
  const currentWeek = now.isoWeek()
  const currentYear = now.isoWeekYear()

  return eventWeek === currentWeek && eventYear === currentYear
}

// ---------------------------------------------------------------------------
// Main Scheduler Logic
// ---------------------------------------------------------------------------

/**
 * Evaluate a single scheduler tick. Checks meal reminders, escalation,
 * quiet hours, cooldown, dismiss-pause, and weekly check-in.
 *
 * Returns a SchedulerTickResult describing what happened.
 */
export async function evaluateSchedulerTick(now?: dayjs.Dayjs): Promise<SchedulerTickResult> {
  const currentTime = now ?? dayjs()
  const settings = getSettings()
  const reminderSettings = settings.reminders

  // Check quiet hours first — NEVER fire during quiet hours
  if (isReminderQuietHours(reminderSettings, currentTime)) {
    return {
      fired: null,
      escalated: false,
      quietHoursActive: true,
      cooldownActive: false,
    }
  }

  // Check if reminders are globally disabled
  if (!reminderSettings.enabled || !reminderSettings.mealReminders) {
    return {
      fired: null,
      escalated: false,
      quietHoursActive: false,
      cooldownActive: false,
    }
  }

  const date = currentTime.format('YYYY-MM-DD')
  const tickId = `tick-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`

  // --- Meal Reminders with Escalation ---
  for (const config of MEAL_REMINDER_CONFIGS) {
    // Only check rules whose time window has passed
    if (currentTime.hour() < config.afterHour) {
      continue
    }

    // Skip if meal is already logged
    if (hasMealLogged(date, config.mealType)) {
      continue
    }

    // Check escalation first
    const escalate = await shouldEscalate(config.ruleId, config.mealType, date, currentTime)
    if (escalate) {
      // Check if we can fire (cooldown/dismiss-pause still apply)
      if (!(await canFireRule(config.ruleId, currentTime))) {
        return {
          fired: null,
          escalated: false,
          quietHoursActive: false,
          cooldownActive: true,
        }
      }

      const dismissCount = await getDismissCount(config.ruleId)
      const event = await saveProactiveEvent({
        ruleId: config.ruleId,
        trigger: 'cron',
        priority: 'medium', // escalated from low
        delivered: true,
        message: config.message,
        payload: {
          sourceTickId: tickId,
          escalationLevel: 1,
          dismissCount,
          quietHoursActive: false,
          date,
          mealType: config.mealType,
          mealLabel: mealTypeLabels[config.mealType],
        },
      })

      return {
        fired: event,
        escalated: true,
        quietHoursActive: false,
        cooldownActive: false,
      }
    }

    // Normal (non-escalated) firing
    if (!(await canFireRule(config.ruleId, currentTime))) {
      continue
    }

    const dismissCount = await getDismissCount(config.ruleId)
    const event = await saveProactiveEvent({
      ruleId: config.ruleId,
      trigger: 'cron',
      priority: 'low',
      delivered: true,
      message: config.message,
      payload: {
        sourceTickId: tickId,
        escalationLevel: 0,
        dismissCount,
        quietHoursActive: false,
        date,
        mealType: config.mealType,
        mealLabel: mealTypeLabels[config.mealType],
      },
    })

    return {
      fired: event,
      escalated: false,
      quietHoursActive: false,
      cooldownActive: false,
    }
  }

  // --- Weekly Check-In ---
  if (await shouldFireWeeklyCheckin(currentTime)) {
    const loggedDays = getLoggedDaysThisWeek(currentTime)
    const weekStart = currentTime.startOf('isoWeek').format('YYYY-MM-DD')
    const weekEnd = currentTime.endOf('isoWeek').format('YYYY-MM-DD')
    const message = `本周已记录 ${loggedDays} 天，来看看整体趋势和下周计划吧。`

    const event = await saveProactiveEvent({
      ruleId: WEEKLY_CHECKIN_RULE_ID,
      trigger: 'cron',
      priority: 'low',
      delivered: true,
      message,
      payload: {
        sourceTickId: tickId,
        escalationLevel: 0,
        dismissCount: 0,
        quietHoursActive: false,
        weekStart,
        weekEnd,
        loggedDays,
      },
    })

    return {
      fired: event,
      escalated: false,
      quietHoursActive: false,
      cooldownActive: false,
    }
  }

  // Nothing to fire
  return {
    fired: null,
    escalated: false,
    quietHoursActive: false,
    cooldownActive: false,
  }
}

/**
 * Determine if the weekly check-in should fire.
 */
async function shouldFireWeeklyCheckin(now: dayjs.Dayjs): Promise<boolean> {
  const settings = getSettings()
  if (!settings.reminders.enabled) {
    return false
  }

  // Only fire once per ISO week
  if (await hasWeeklyCheckinFiredThisWeek(now)) {
    return false
  }

  // Check cooldown/dismiss-pause
  if (!(await canFireRule(WEEKLY_CHECKIN_RULE_ID, now))) {
    return false
  }

  // Only fire when user has logged ≥3 days this week
  const loggedDays = getLoggedDaysThisWeek(now)
  return loggedDays >= WEEKLY_CHECKIN_MIN_LOGGED_DAYS
}

// ---------------------------------------------------------------------------
// Foreground Scheduler
// ---------------------------------------------------------------------------

/**
 * Start the foreground scheduler that evaluates reminders every 10 minutes.
 * Returns a cleanup function that clears the interval.
 */
export function startForegroundScheduler(): () => void {
  const intervalId = setInterval(() => {
    evaluateSchedulerTick().catch((err) => {
      console.error('[ReminderScheduler] Tick error:', err)
    })
  }, FOREGROUND_TICK_INTERVAL_MS)

  return () => {
    clearInterval(intervalId)
  }
}

// ---------------------------------------------------------------------------
// Background Tick Listener (IPC from main process)
// ---------------------------------------------------------------------------

/**
 * Start listening for `coaching:reminder-tick` IPC events from the main process.
 * When a tick arrives (window is hidden/minimized), evaluates the scheduler and
 * sends a desktop notification if a reminder fires.
 *
 * Returns a cleanup function that removes the IPC listener.
 */
export function startBackgroundTickListener(): () => void {
  if (typeof window === 'undefined' || !window.coaching?.onReminderTick) {
    return () => {}
  }

  const unsubscribe = window.coaching.onReminderTick(() => {
    evaluateSchedulerTick()
      .then(async (result) => {
        if (result.fired) {
          // Window is not focused (main process only sends tick when hidden/minimized),
          // so deliver an OS notification
          const { sendDesktopNotification } = await import('./desktopNotifier')
          const page = resolveNotificationPage(result.fired)
          await sendDesktopNotification({
            title: result.fired.payload?.mealLabel
              ? `${result.fired.payload.mealLabel as string}提醒`
              : '饮食提醒',
            body: result.fired.message,
            page,
          })
        }
      })
      .catch((err) => {
        console.error('[ReminderScheduler] Background tick error:', err)
      })
  })

  return unsubscribe
}

/**
 * Resolve which page a notification should navigate to based on the fired event.
 */
function resolveNotificationPage(event: ProactiveEvent): 'diet-log' | 'chat' | 'home' {
  if (event.ruleId.includes('reminder') || event.ruleId.includes('meal')) {
    return 'diet-log'
  }
  if (event.ruleId.includes('checkin')) {
    return 'home'
  }
  return 'home'
}
