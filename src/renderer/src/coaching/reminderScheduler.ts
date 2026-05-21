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
const AGENT_CHECK_RULE_ID = 'agent_check'
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

type SchedulerReason = SchedulerTickResult['reason']

type EvaluatedRule = SchedulerTickResult['evaluatedRules'][number]

interface RuleCoolingState {
  active: boolean
  cooldownUntil?: string
}

interface RuleDismissPauseState {
  active: boolean
  pauseUntil?: string
}

interface BuildResultParams {
  now: dayjs.Dayjs
  tickId: string
  ruleId: string
  reason: SchedulerReason
  message: string
  fired?: ProactiveEvent | null
  checkEvent?: ProactiveEvent | null
  escalated?: boolean
  quietHoursActive?: boolean
  cooldownActive?: boolean
  isAlreadyLogged?: boolean
  isDismissPaused?: boolean
  dismissCount?: number
  mealType?: MealType
  cooldownUntil?: string
  pauseUntil?: string
  evaluatedRules: EvaluatedRule[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasMealLogged(date: string, mealType: MealType): boolean {
  const log = getDietLog(date)
  const meal = log?.meals.find((entry) => entry.type === mealType)
  return Boolean(meal && meal.items.length > 0)
}

async function getRuleCoolingState(ruleId: string, now: dayjs.Dayjs): Promise<RuleCoolingState> {
  const latestEvent = await getLatestProactiveEventForRule(ruleId)
  if (!latestEvent) {
    return { active: false }
  }

  if (latestEvent.cooldownUntil && dayjs(latestEvent.cooldownUntil).isAfter(now)) {
    return {
      active: true,
      cooldownUntil: latestEvent.cooldownUntil,
    }
  }

  // Also respect the settings cooldown
  const settings = getSettings()
  const cooldownHours = settings.reminders.cooldownHours
  const cooldownUntil = dayjs(latestEvent.firedAt).add(cooldownHours, 'hour')
  return cooldownUntil.isAfter(now)
    ? {
      active: true,
      cooldownUntil: cooldownUntil.toISOString(),
    }
    : { active: false }
}

async function getRuleDismissPauseState(ruleId: string, now: dayjs.Dayjs): Promise<RuleDismissPauseState> {
  const recentEvents = await getRecentProactiveEventsForRule(ruleId, DISMISS_PAUSE_THRESHOLD)

  if (recentEvents.length < DISMISS_PAUSE_THRESHOLD) {
    return { active: false }
  }

  const allDismissed = recentEvents.every((event) => event.userResponse === 'dismissed')
  if (!allDismissed) {
    return { active: false }
  }

  // Pause for 24 hours from the most recent (third) dismissal
  const pauseUntil = dayjs(recentEvents[0].firedAt).add(DISMISS_PAUSE_HOURS, 'hour')
  return pauseUntil.isAfter(now)
    ? {
      active: true,
      pauseUntil: pauseUntil.toISOString(),
    }
    : { active: false }
}

async function canFireRule(ruleId: string, now: dayjs.Dayjs): Promise<boolean> {
  if ((await getRuleCoolingState(ruleId, now)).active) {
    return false
  }

  return !(await getRuleDismissPauseState(ruleId, now)).active
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

function createTickId(now: dayjs.Dayjs): string {
  return `tick-${now.valueOf()}-${Math.random().toString(16).slice(2, 8)}`
}

function buildTickResult(params: BuildResultParams): SchedulerTickResult {
  const fired = params.fired ?? null
  const quietHoursActive = params.quietHoursActive ?? false
  const cooldownActive = params.cooldownActive ?? false
  const escalated = params.escalated ?? false

  return {
    fired,
    escalated,
    quietHoursActive,
    cooldownActive,
    triggered: Boolean(fired),
    delivered: Boolean(fired?.delivered),
    tickId: params.tickId,
    checkedAt: params.now.toISOString(),
    ruleId: params.ruleId,
    reason: params.reason,
    message: params.message,
    skipReason: fired ? undefined : params.reason,
    mealType: params.mealType,
    isQuiet: quietHoursActive,
    isCoolingDown: cooldownActive,
    isAlreadyLogged: params.isAlreadyLogged ?? false,
    isDismissPaused: params.isDismissPaused ?? false,
    isEscalated: escalated,
    dismissCount: params.dismissCount ?? 0,
    cooldownUntil: params.cooldownUntil,
    pauseUntil: params.pauseUntil,
    checkEvent: params.checkEvent ?? fired,
    evaluatedRules: params.evaluatedRules,
  }
}

async function persistSkippedAgentCheck(result: SchedulerTickResult): Promise<SchedulerTickResult> {
  const event = await saveProactiveEvent({
    ruleId: AGENT_CHECK_RULE_ID,
    trigger: 'cron',
    priority: 'low',
    firedAt: result.checkedAt,
    delivered: false,
    message: result.message,
    payload: {
      sourceTickId: result.tickId,
      checkedRuleId: result.ruleId,
      reason: result.reason,
      skipReason: result.skipReason,
      quietHoursActive: result.quietHoursActive,
      cooldownActive: result.cooldownActive,
      alreadyLogged: result.isAlreadyLogged,
      dismissPaused: result.isDismissPaused,
      dismissCount: result.dismissCount,
      escalated: result.isEscalated,
      mealType: result.mealType,
      cooldownUntil: result.cooldownUntil,
      pauseUntil: result.pauseUntil,
      evaluatedRules: result.evaluatedRules,
    },
  })

  return {
    ...result,
    checkEvent: event,
  }
}

function getSkippedResultMessage(reason: SchedulerReason, mealType?: MealType): string {
  const mealLabel = mealType ? mealTypeLabels[mealType] : '当前餐次'
  switch (reason) {
    case 'quiet_hours':
      return '当前处于静音时段，Agent 本次只记录判断，不打扰用户。'
    case 'reminders_disabled':
      return '主动提醒总开关已关闭，Agent 不会发出饮食提醒。'
    case 'meal_reminders_disabled':
      return '餐次未记录提醒已关闭，Agent 不会提醒记录三餐。'
    case 'before_window':
      return '还没到需要检查三餐记录的时间窗口。'
    case 'already_logged':
      return `${mealLabel}已经有饮食记录，本次不提醒。`
    case 'cooldown':
      return `${mealLabel}提醒仍在冷却中，本次不重复打扰。`
    case 'dismiss_pause':
      return `${mealLabel}提醒已连续忽略 3 次，Agent 至少 24 小时内降低打扰。`
    case 'weekly_checkin_fired':
      return '本周复盘已经提醒过，本次不重复触发。'
    case 'weekly_checkin_not_due':
      return '本周记录天数还没达到复盘提醒条件。'
    default:
      return '没有符合触发条件的主动提醒。'
  }
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
  const date = currentTime.format('YYYY-MM-DD')
  const tickId = createTickId(currentTime)
  const evaluatedRules: EvaluatedRule[] = []

  // Check quiet hours first — NEVER fire during quiet hours
  if (isReminderQuietHours(reminderSettings, currentTime)) {
    return persistSkippedAgentCheck(buildTickResult({
      now: currentTime,
      tickId,
      ruleId: AGENT_CHECK_RULE_ID,
      reason: 'quiet_hours',
      message: getSkippedResultMessage('quiet_hours'),
      quietHoursActive: true,
      evaluatedRules,
    }))
  }

  // Check if reminders are globally disabled
  if (!reminderSettings.enabled) {
    return persistSkippedAgentCheck(buildTickResult({
      now: currentTime,
      tickId,
      ruleId: AGENT_CHECK_RULE_ID,
      reason: 'reminders_disabled',
      message: getSkippedResultMessage('reminders_disabled'),
      evaluatedRules,
    }))
  }

  if (!reminderSettings.mealReminders) {
    return persistSkippedAgentCheck(buildTickResult({
      now: currentTime,
      tickId,
      ruleId: AGENT_CHECK_RULE_ID,
      reason: 'meal_reminders_disabled',
      message: getSkippedResultMessage('meal_reminders_disabled'),
      evaluatedRules,
    }))
  }

  let terminalSkip: {
    ruleId: string
    reason: SchedulerReason
    mealType?: MealType
    isAlreadyLogged?: boolean
    isCoolingDown?: boolean
    isDismissPaused?: boolean
    dismissCount?: number
    cooldownUntil?: string
    pauseUntil?: string
  } = {
    ruleId: AGENT_CHECK_RULE_ID,
    reason: 'before_window',
  }

  // --- Meal Reminders with Escalation ---
  for (const config of MEAL_REMINDER_CONFIGS) {
    const due = currentTime.hour() >= config.afterHour
    const alreadyLogged = due ? hasMealLogged(date, config.mealType) : false
    const evaluatedRule: EvaluatedRule = {
      ruleId: config.ruleId,
      mealType: config.mealType,
      due,
      alreadyLogged,
      coolingDown: false,
      dismissPaused: false,
      dismissCount: 0,
    }

    if (!due) {
      evaluatedRule.skipReason = 'before_window'
      evaluatedRules.push(evaluatedRule)
      continue
    }

    if (alreadyLogged) {
      evaluatedRule.skipReason = 'already_logged'
      evaluatedRules.push(evaluatedRule)
      terminalSkip = {
        ruleId: config.ruleId,
        reason: 'already_logged',
        mealType: config.mealType,
        isAlreadyLogged: true,
      }
      continue
    }

    const dismissCount = await getDismissCount(config.ruleId)
    const coolingState = await getRuleCoolingState(config.ruleId, currentTime)
    const dismissPauseState = await getRuleDismissPauseState(config.ruleId, currentTime)

    evaluatedRule.dismissCount = dismissCount
    evaluatedRule.coolingDown = coolingState.active
    evaluatedRule.dismissPaused = dismissPauseState.active
    evaluatedRule.cooldownUntil = coolingState.cooldownUntil
    evaluatedRule.pauseUntil = dismissPauseState.pauseUntil

    const escalate = await shouldEscalate(config.ruleId, config.mealType, date, currentTime)

    if (coolingState.active) {
      evaluatedRule.skipReason = 'cooldown'
      evaluatedRules.push(evaluatedRule)
      terminalSkip = {
        ruleId: config.ruleId,
        reason: 'cooldown',
        mealType: config.mealType,
        isCoolingDown: true,
        dismissCount,
        cooldownUntil: coolingState.cooldownUntil,
      }
      continue
    }

    if (dismissPauseState.active) {
      evaluatedRule.skipReason = 'dismiss_pause'
      evaluatedRules.push(evaluatedRule)
      terminalSkip = {
        ruleId: config.ruleId,
        reason: 'dismiss_pause',
        mealType: config.mealType,
        isDismissPaused: true,
        dismissCount,
        pauseUntil: dismissPauseState.pauseUntil,
      }
      continue
    }

    const event = await saveProactiveEvent({
      ruleId: config.ruleId,
      trigger: 'cron',
      priority: escalate ? 'medium' : 'low',
      firedAt: currentTime.toISOString(),
      delivered: true,
      message: config.message,
      payload: {
        sourceTickId: tickId,
        ruleId: config.ruleId,
        reason: escalate ? 'escalated' : 'fired',
        escalationLevel: escalate ? 1 : 0,
        dismissCount,
        quietHoursActive: false,
        cooldownActive: false,
        alreadyLogged: false,
        dismissPaused: false,
        date,
        mealType: config.mealType,
        mealLabel: mealTypeLabels[config.mealType],
        evaluatedRules: [...evaluatedRules, evaluatedRule],
      },
    })
    evaluatedRules.push(evaluatedRule)

    return buildTickResult({
      now: currentTime,
      tickId,
      fired: event,
      escalated: escalate,
      ruleId: config.ruleId,
      reason: escalate ? 'escalated' : 'fired',
      message: config.message,
      mealType: config.mealType,
      dismissCount,
      quietHoursActive: false,
      cooldownActive: false,
      evaluatedRules,
    })
  }

  // --- Weekly Check-In ---
  const weeklyAlreadyFired = await hasWeeklyCheckinFiredThisWeek(currentTime)
  const weeklyDismissCount = await getDismissCount(WEEKLY_CHECKIN_RULE_ID)
  const weeklyCoolingState = await getRuleCoolingState(WEEKLY_CHECKIN_RULE_ID, currentTime)
  const weeklyDismissPauseState = await getRuleDismissPauseState(WEEKLY_CHECKIN_RULE_ID, currentTime)
  const loggedDaysThisWeek = getLoggedDaysThisWeek(currentTime)
  const weeklyRule: EvaluatedRule = {
    ruleId: WEEKLY_CHECKIN_RULE_ID,
    due: loggedDaysThisWeek >= WEEKLY_CHECKIN_MIN_LOGGED_DAYS,
    alreadyLogged: false,
    coolingDown: weeklyCoolingState.active,
    dismissPaused: weeklyDismissPauseState.active,
    dismissCount: weeklyDismissCount,
    cooldownUntil: weeklyCoolingState.cooldownUntil,
    pauseUntil: weeklyDismissPauseState.pauseUntil,
  }

  if (weeklyAlreadyFired) {
    weeklyRule.skipReason = 'weekly_checkin_fired'
  } else if (weeklyCoolingState.active) {
    weeklyRule.skipReason = 'cooldown'
  } else if (weeklyDismissPauseState.active) {
    weeklyRule.skipReason = 'dismiss_pause'
  } else if (loggedDaysThisWeek < WEEKLY_CHECKIN_MIN_LOGGED_DAYS) {
    weeklyRule.skipReason = 'weekly_checkin_not_due'
  }

  evaluatedRules.push(weeklyRule)

  if (!weeklyAlreadyFired &&
    !weeklyCoolingState.active &&
    !weeklyDismissPauseState.active &&
    loggedDaysThisWeek >= WEEKLY_CHECKIN_MIN_LOGGED_DAYS) {
    const loggedDays = getLoggedDaysThisWeek(currentTime)
    const weekStart = currentTime.startOf('isoWeek').format('YYYY-MM-DD')
    const weekEnd = currentTime.endOf('isoWeek').format('YYYY-MM-DD')
    const message = `本周已记录 ${loggedDays} 天，来看看整体趋势和下周计划吧。`

    const event = await saveProactiveEvent({
      ruleId: WEEKLY_CHECKIN_RULE_ID,
      trigger: 'cron',
      priority: 'low',
      firedAt: currentTime.toISOString(),
      delivered: true,
      message,
      payload: {
        sourceTickId: tickId,
        ruleId: WEEKLY_CHECKIN_RULE_ID,
        reason: 'fired',
        escalationLevel: 0,
        dismissCount: 0,
        quietHoursActive: false,
        cooldownActive: false,
        weekStart,
        weekEnd,
        loggedDays,
        evaluatedRules,
      },
    })

    return buildTickResult({
      now: currentTime,
      tickId,
      fired: event,
      ruleId: WEEKLY_CHECKIN_RULE_ID,
      reason: 'fired',
      message,
      escalated: false,
      quietHoursActive: false,
      cooldownActive: false,
      evaluatedRules,
    })
  }

  if (terminalSkip.reason === 'before_window' && weeklyRule.skipReason) {
    terminalSkip = {
      ruleId: WEEKLY_CHECKIN_RULE_ID,
      reason: weeklyRule.skipReason as SchedulerReason,
      isCoolingDown: weeklyRule.coolingDown,
      isDismissPaused: weeklyRule.dismissPaused,
      dismissCount: weeklyRule.dismissCount,
      cooldownUntil: weeklyRule.cooldownUntil,
      pauseUntil: weeklyRule.pauseUntil,
    }
  }

  return persistSkippedAgentCheck(buildTickResult({
    now: currentTime,
    tickId,
    ruleId: terminalSkip.ruleId,
    reason: terminalSkip.reason,
    message: getSkippedResultMessage(terminalSkip.reason, terminalSkip.mealType),
    mealType: terminalSkip.mealType,
    isAlreadyLogged: terminalSkip.isAlreadyLogged,
    cooldownActive: terminalSkip.isCoolingDown,
    isDismissPaused: terminalSkip.isDismissPaused,
    dismissCount: terminalSkip.dismissCount,
    cooldownUntil: terminalSkip.cooldownUntil,
    pauseUntil: terminalSkip.pauseUntil,
    evaluatedRules,
  }))
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
