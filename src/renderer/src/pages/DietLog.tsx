import { useState, useEffect, useMemo } from 'react'
import {
  Card, Typography, Button, DatePicker, Select, Tag,
  List, Empty, Modal, InputNumber, message, Dropdown, Progress,
} from 'antd'
import { PlusOutlined, DeleteOutlined, DownloadOutlined, MessageOutlined, ClockCircleOutlined } from '@ant-design/icons'
import type { MenuProps } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useNavigate } from 'react-router-dom'
import OneTapLogger from '../components/OneTapLogger'
import { recipes } from '../data/recipes'
import { findRecipeByIdWithCustomFoods, getAllRecipesWithCustomFoods } from '../stores/customFoods'
import { exportDietLogs, type DietLogExportFormat, type DietLogExportScope } from '../export/dietLogExport'
import {
  addRecipeToDietLog,
  getDietLog,
  getWeeklyDietReport,
  mealTypeOptions,
  removeMealItemFromDietLog,
  summarizeDietLog,
  type DietLog,
  type MealType,
  type WeeklyDietReport,
  type WeeklyDietReportDay,
} from '../stores/dietLog'
import { DIET_LOG_UPDATED_EVENT, PLANNING_UPDATED_EVENT, RECIPE_CALIBRATION_UPDATED_EVENT, SETTINGS_UPDATED_EVENT } from '../stores/events'
import {
  getLatestDailyPlanAdjustment,
  updateDailyPlanAdjustmentResponse,
  type DailyPlanAdjustment,
} from '../stores/planning'
import { getSettings } from '../stores/settings'
import { getDailyPlanGap, type DailyPlanGap } from '../planning/dynamicPlan'
import { localizeRecipe } from '../data/recipeTranslations.en'
import { useI18n } from '../i18n'
import './DietLog.css'

const { Title, Text } = Typography

function formatWeekRange(startDate: string, endDate: string, language: 'en' | 'zh'): string {
  const format = language === 'zh' ? 'M月D日' : 'MMM D'
  return `${dayjs(startDate).format(format)} - ${dayjs(endDate).format(format)}`
}

function formatAverageValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function formatWeekdayLabel(date: string, fallback: string, language: 'en' | 'zh'): string {
  return language === 'zh' ? fallback : dayjs(date).format('dddd')
}

function getCalorieBarWidth(calories: number, maxCalories: number): number {
  if (calories <= 0 || maxCalories <= 0) {
    return 0
  }

  return Math.max(8, Math.round((calories / maxCalories) * 100))
}

function buildWeeklyInsightLines(report: WeeklyDietReport, language: 'en' | 'zh'): string[] {
  if (report.loggedDays === 0) {
    return [
      language === 'zh'
        ? '这周还没有有效饮食记录。先记下一餐，周报就会自动开始统计。'
        : 'No valid diet logs this week yet. Log one meal and the weekly report will start tracking.',
    ]
  }

  const dateFormat = language === 'zh' ? 'M月D日' : 'MMM D'
  const insightLines = [
    language === 'zh'
      ? `本周累计记录 ${report.loggedDays} 天，共摄入 ${report.totals.calories} kcal，平均每天 ${report.averagePerDay.calories} kcal。`
      : `${report.loggedDays} logged days this week, ${report.totals.calories} kcal total, averaging ${report.averagePerDay.calories} kcal per day.`,
  ]

  if (report.highestCalorieDay) {
    insightLines.push(
      language === 'zh'
        ? `摄入最高的是 ${report.highestCalorieDay.weekdayLabel}（${dayjs(report.highestCalorieDay.date).format(dateFormat)}），共 ${report.highestCalorieDay.calories} kcal。`
        : `Highest intake was ${formatWeekdayLabel(report.highestCalorieDay.date, report.highestCalorieDay.weekdayLabel, language)} (${dayjs(report.highestCalorieDay.date).format(dateFormat)}), at ${report.highestCalorieDay.calories} kcal.`,
    )
  }

  if (report.lowestCalorieDay && report.lowestCalorieDay.date !== report.highestCalorieDay?.date) {
    insightLines.push(
      language === 'zh'
        ? `摄入最低的是 ${report.lowestCalorieDay.weekdayLabel}（${dayjs(report.lowestCalorieDay.date).format(dateFormat)}），共 ${report.lowestCalorieDay.calories} kcal。`
        : `Lowest intake was ${formatWeekdayLabel(report.lowestCalorieDay.date, report.lowestCalorieDay.weekdayLabel, language)} (${dayjs(report.lowestCalorieDay.date).format(dateFormat)}), at ${report.lowestCalorieDay.calories} kcal.`,
    )
  }

  if (report.calorieGoal) {
    insightLines.push(
      language === 'zh'
        ? `接近每日目标 ${report.calorieGoal} kcal 的记录日有 ${report.goalHitDays} 天，命中口径为上下浮动 10%。`
        : `${report.goalHitDays} logged days were within 10% of the ${report.calorieGoal} kcal daily goal.`,
    )
  } else {
    insightLines.push(language === 'zh'
      ? '还没有设置每日热量目标，去设置页补充后可以看到“目标命中天数”。'
      : 'No daily calorie goal is set yet. Add one in Settings to see goal-hit days.')
  }

  return insightLines
}

function getAdjustmentTagColor(adjustment: DailyPlanAdjustment): string {
  if (adjustment.userResponse === 'accepted') {
    return 'success'
  }

  if (adjustment.userResponse === 'dismissed') {
    return 'default'
  }

  if (adjustment.userResponse === 'snoozed') {
    return 'processing'
  }

  return adjustment.suggestionType === 'supplement' ? 'orange' : 'blue'
}

function getAdjustmentStatusText(adjustment: DailyPlanAdjustment, language: 'en' | 'zh'): string {
  if (adjustment.userResponse === 'accepted') {
    return language === 'zh' ? '已采纳' : 'Accepted'
  }

  if (adjustment.userResponse === 'dismissed') {
    return language === 'zh' ? '已忽略' : 'Dismissed'
  }

  if (adjustment.userResponse === 'snoozed') {
    return language === 'zh' ? '已晚点' : 'Snoozed'
  }

  if (language === 'zh') {
    return adjustment.suggestionType === 'supplement' ? '建议补充' : '建议收敛'
  }

  return adjustment.suggestionType === 'supplement' ? 'Add something' : 'Scale back'
}



function getExportScopeLabel(scope: DietLogExportScope, language: 'en' | 'zh'): string {
  if (scope === 'day') {
    return language === 'zh' ? '当天' : 'Day'
  }

  if (scope === 'week') {
    return language === 'zh' ? '本周' : 'Week'
  }

  return language === 'zh' ? '全部' : 'All'
}

function macroEnergyPercents(day: WeeklyDietReportDay): { protein: number; carbs: number; fat: number } {
  const p = day.protein * 4
  const c = day.carbs * 4
  const f = day.fat * 9
  const total = p + c + f
  if (total <= 0) {
    return { protein: 0, carbs: 0, fat: 0 }
  }

  return {
    protein: (p / total) * 100,
    carbs: (c / total) * 100,
    fat: (f / total) * 100,
  }
}

function getCurrentMealType(): MealType {
  const hour = dayjs().hour()
  if (hour < 10) return 'breakfast'
  if (hour < 15) return 'lunch'
  return 'dinner'
}

const mealLabelKeys: Record<MealType, 'meal.breakfast' | 'meal.lunch' | 'meal.dinner' | 'meal.snack'> = {
  breakfast: 'meal.breakfast',
  lunch: 'meal.lunch',
  dinner: 'meal.dinner',
  snack: 'meal.snack',
}

function DietLogPage(): JSX.Element {
  const navigate = useNavigate()
  const { language, t } = useI18n()
  const l = (zh: string, en: string): string => language === 'zh' ? zh : en
  const [recipesVersion, setRecipesVersion] = useState(0)
  const allRecipes = useMemo(() => getAllRecipesWithCustomFoods(recipes), [recipesVersion])
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs())
  const [dietLog, setDietLog] = useState<DietLog | null>(null)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [addMealType, setAddMealType] = useState<MealType>('breakfast')
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null)
  const [servings, setServings] = useState(1)
  const [calorieGoal, setCalorieGoal] = useState<number | undefined>(() => getSettings().calorieGoal)
  const [latestAdjustment, setLatestAdjustment] = useState<DailyPlanAdjustment | null>(null)
  const [planGap, setPlanGap] = useState<DailyPlanGap | null>(null)
  const [planGapReady, setPlanGapReady] = useState(false)

  const dateStr = selectedDate.format('YYYY-MM-DD')

  useEffect(() => {
    const bumpRecipesVersion = (): void => {
      setRecipesVersion((current) => current + 1)
    }

    window.addEventListener(DIET_LOG_UPDATED_EVENT, bumpRecipesVersion)
    window.addEventListener(RECIPE_CALIBRATION_UPDATED_EVENT, bumpRecipesVersion)
    return () => {
      window.removeEventListener(DIET_LOG_UPDATED_EVENT, bumpRecipesVersion)
      window.removeEventListener(RECIPE_CALIBRATION_UPDATED_EVENT, bumpRecipesVersion)
    }
  }, [])

  useEffect(() => {
    const syncDietLog = (): void => {
      setDietLog(getDietLog(dateStr))
      void getLatestDailyPlanAdjustment(dateStr).then(setLatestAdjustment)
    }

    syncDietLog()
    window.addEventListener(DIET_LOG_UPDATED_EVENT, syncDietLog)
    window.addEventListener(PLANNING_UPDATED_EVENT, syncDietLog)

    return () => {
      window.removeEventListener(DIET_LOG_UPDATED_EVENT, syncDietLog)
      window.removeEventListener(PLANNING_UPDATED_EVENT, syncDietLog)
    }
  }, [dateStr])

  useEffect(() => {
    const syncSettings = (): void => {
      setCalorieGoal(getSettings().calorieGoal)
    }

    syncSettings()
    window.addEventListener(SETTINGS_UPDATED_EVENT, syncSettings)

    return () => {
      window.removeEventListener(SETTINGS_UPDATED_EVENT, syncSettings)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadPlanGap = (): void => {
      void getDailyPlanGap(dateStr).then((gap) => {
        if (cancelled) {
          return
        }

        setPlanGap(gap)
        setPlanGapReady(true)
      })
    }

    loadPlanGap()
    window.addEventListener(PLANNING_UPDATED_EVENT, loadPlanGap)
    window.addEventListener(SETTINGS_UPDATED_EVENT, loadPlanGap)
    window.addEventListener(DIET_LOG_UPDATED_EVENT, loadPlanGap)

    return () => {
      cancelled = true
      window.removeEventListener(PLANNING_UPDATED_EVENT, loadPlanGap)
      window.removeEventListener(SETTINGS_UPDATED_EVENT, loadPlanGap)
      window.removeEventListener(DIET_LOG_UPDATED_EVENT, loadPlanGap)
    }
  }, [dateStr, dietLog])

  const handleAddItem = async (): Promise<void> => {
    if (!selectedRecipeId) {
      message.warning(language === 'zh' ? '请先选择一道菜谱哦~ 🐛' : 'Please choose a recipe first.')
      return
    }

    const recipe = findRecipeByIdWithCustomFoods(recipes, selectedRecipeId)
    if (!recipe) return

    const nextLog = addRecipeToDietLog({
      date: dateStr,
      mealType: addMealType,
      recipe,
      servings,
    })

    setDietLog(nextLog)
    setAddModalOpen(false)
    setSelectedRecipeId(null)
    setServings(1)
    message.success(language === 'zh' ? '记录成功！猫猫虫很开心~ 🐛✨' : 'Entry saved.')
  }

  const handleDeleteItem = async (mealType: MealType, itemIndex: number): Promise<void> => {
    const nextLog = removeMealItemFromDietLog({
      date: dateStr,
      mealType,
      itemIndex,
    })

    setDietLog(nextLog)

    if (!nextLog) {
      message.success(language === 'zh' ? '这条饮食记录已经删除，今天已回到空记录状态。' : 'Entry deleted. Today is back to an empty log.')
      return
    }

    message.success(language === 'zh' ? '已删除该条目。' : 'Entry deleted.')
  }

  const handleAdjustmentResponse = async (
    adjustment: DailyPlanAdjustment,
    response: 'accepted' | 'dismissed' | 'snoozed',
  ): Promise<void> => {
    if (!adjustment.id) {
      return
    }

    const updatedAdjustment = await updateDailyPlanAdjustmentResponse(adjustment.id, response)
    if (updatedAdjustment) {
      setLatestAdjustment(updatedAdjustment)
      if (response === 'accepted') {
        message.success(language === 'zh' ? '已记录采纳这条建议。' : 'Suggestion accepted.')
      } else if (response === 'snoozed') {
        message.success(language === 'zh' ? '已记下「晚点再看」，建议仍可在下方查看。' : 'Snoozed. The suggestion remains visible below.')
      } else {
        message.success(language === 'zh' ? '已忽略这条建议。' : 'Suggestion dismissed.')
      }
    }
  }

  const handleExportDietLog = async (scope: DietLogExportScope, format: DietLogExportFormat): Promise<void> => {
    const { payload, result } = await exportDietLogs({
      scope,
      format,
      date: dateStr,
    })

    if (result.status === 'saved') {
      message.success(
        language === 'zh'
          ? `${getExportScopeLabel(scope, language)}记录已导出为 ${format.toUpperCase()}，共 ${payload.summary.itemCount} 条，保存到 ${result.filePath ?? '所选位置'}。`
          : `${getExportScopeLabel(scope, language)} log exported as ${format.toUpperCase()} with ${payload.summary.itemCount} item(s). Saved to ${result.filePath ?? 'the selected location'}.`,
      )
      return
    }

    if (result.status === 'failed') {
      message.error(language === 'zh' ? `导出失败：${result.error ?? '未知错误'}` : `Export failed: ${result.error ?? 'Unknown error'}`)
    }
  }

  const handleOpenAiEstimator = (): void => {
    navigate('/chat', {
      state: {
        prefill: language === 'zh'
          ? `我刚刚吃了一个菜谱库里没有的食物，请帮我估算名称、份量、热量和宏量营养，并记录到 ${dateStr} 的饮食里：`
          : `I just ate something that is not in the recipe library. Please estimate the name, portion, calories, and macros, then log it for ${dateStr}:`,
      },
    })
  }

  const nutritionSummary = summarizeDietLog(dietLog)
  const localizedMealTypeOptions = useMemo(
    () => mealTypeOptions.map((option) => ({
      ...option,
      label: `${option.emoji} ${t(mealLabelKeys[option.value])}`,
    })),
    [t],
  )
  const weeklyReport = getWeeklyDietReport(dateStr, calorieGoal)
  const weeklyReferenceCalories = Math.max(
    1,
    calorieGoal ?? 0,
    ...weeklyReport.days.map((day) => day.calories),
  )
  const averageReference = weeklyReport.loggedDays > 0
    ? weeklyReport.averagePerLoggedDay
    : weeklyReport.averagePerDay
  const averageScopeLabel = weeklyReport.loggedDays > 0 ? l('按已记录日平均', 'Avg. logged days') : l('按自然日平均', 'Avg. calendar days')
  const weeklyInsights = buildWeeklyInsightLines(weeklyReport, language)
  const exportMenuItems: MenuProps['items'] = [
    {
      key: 'day-json',
      label: language === 'zh' ? '导出当天 JSON' : 'Export day JSON',
      onClick: () => handleExportDietLog('day', 'json'),
    },
    {
      key: 'day-csv',
      label: language === 'zh' ? '导出当天 CSV' : 'Export day CSV',
      onClick: () => handleExportDietLog('day', 'csv'),
    },
    {
      type: 'divider',
    },
    {
      key: 'week-json',
      label: language === 'zh' ? '导出本周 JSON' : 'Export week JSON',
      onClick: () => handleExportDietLog('week', 'json'),
    },
    {
      key: 'week-csv',
      label: language === 'zh' ? '导出本周 CSV' : 'Export week CSV',
      onClick: () => handleExportDietLog('week', 'csv'),
    },
    {
      type: 'divider',
    },
    {
      key: 'all-json',
      label: language === 'zh' ? '导出全部 JSON' : 'Export all JSON',
      onClick: () => handleExportDietLog('all', 'json'),
    },
    {
      key: 'all-csv',
      label: language === 'zh' ? '导出全部 CSV' : 'Export all CSV',
      onClick: () => handleExportDietLog('all', 'csv'),
    },
  ]

  return (
    <div className="dietlog-page">
      <div className="dietlog-header">
        <div>
          <Title level={3}>📝 {t('dietLog.title')}</Title>
          <Text type="secondary">{t('dietLog.subtitle')}</Text>
        </div>
        <div className="dietlog-actions">
          <DatePicker
            value={selectedDate}
            onChange={(date) => date && setSelectedDate(date)}
            allowClear={false}
          />
          <Dropdown menu={{ items: exportMenuItems }} trigger={['click']}>
            <Button icon={<DownloadOutlined />}>
              {t('dietLog.export')}
            </Button>
          </Dropdown>
          <Button
            icon={<MessageOutlined />}
            onClick={handleOpenAiEstimator}
          >
            {t('dietLog.estimate')}
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setAddModalOpen(true)}
            className="add-btn"
          >
            {t('dietLog.add')}
          </Button>
        </div>
      </div>

      <Card className="daily-summary">
        <div className="summary-content">
          <span className="summary-emoji">🐛</span>
          <div>
            <Text strong>{selectedDate.format(language === 'zh' ? 'YYYY年MM月DD日' : 'MMM D, YYYY')} </Text>
            <Text type="secondary">
              {l('共记录', 'Logged')} {nutritionSummary.mealCount} {l('餐，', 'meals,')}
              {' '}{l('摄入', 'intake')} <Text strong style={{ color: '#FF8FA3' }}>{nutritionSummary.calories}</Text> kcal
            </Text>
          </div>
        </div>
        <div className="daily-summary-helper">
          <Text type="secondary">
            {l('找不到现成菜谱时，可以直接让 AI 估算食物份量和热量，并顺手写进当天饮食记录。', 'When no recipe fits, ask AI to estimate portions and calories and log the entry for today.')}
          </Text>
          <Button type="link" icon={<MessageOutlined />} onClick={handleOpenAiEstimator}>
            {t('dietLog.chatEstimate')}
          </Button>
        </div>
      </Card>

      <OneTapLogger date={dateStr} mealType={getCurrentMealType()} />

      {planGapReady && planGap && (
        <Card className="plan-gap-card">
          <div className="plan-gap-header">
            <div>
              <Title level={5} style={{ marginBottom: 4 }}>{l('今日计划 vs 实际', 'Today’s plan vs actual')}</Title>
              <Text type="secondary">
                {l('目标取自「最新 AI 饮食计划」的每日热量；若无计划则使用设置页的每日目标。', 'The target comes from the latest AI diet plan, or from the daily goal in Settings if no plan exists.')}
              </Text>
            </div>
            <Tag color="processing" bordered={false}>
              {l('日目标', 'Daily target')} {planGap.dailyTarget} kcal
            </Tag>
          </div>

          <div className="plan-gap-progress">
            <div className="plan-gap-progress-labels">
              <Text>{l('已摄入', 'Consumed')} {planGap.actualCalories} kcal</Text>
              <Text type="secondary">
                {l('还可安排约', 'About')} <Text strong>{planGap.remainingCalories}</Text> kcal {l('', 'remaining')}
              </Text>
            </div>
            <Progress
              percent={Math.min(100, Math.round((planGap.actualCalories / planGap.dailyTarget) * 100))}
              status={planGap.actualCalories > planGap.dailyTarget * 1.05 ? 'exception' : 'active'}
              strokeColor={{ from: '#FFB6C1', to: '#7DD3A8' }}
              showInfo
            />
            <Text type="secondary" className="plan-gap-net-line">
              {l('全天差值（实际 − 目标）：', 'Daily delta (actual - target):')}
              <Text strong style={{ marginLeft: 6, color: planGap.actualCalories > planGap.dailyTarget ? '#ff7875' : '#52c41a' }}>
                {planGap.actualCalories - planGap.dailyTarget > 0 ? '+' : ''}{planGap.actualCalories - planGap.dailyTarget} kcal
              </Text>
            </Text>
          </div>

          <div className="plan-gap-meals">
            <Text strong className="plan-gap-meals-title">{l('按餐次拆分（计划来自当前热量分配比例）', 'By meal (plan follows the current calorie split)')}</Text>
            <div className="plan-gap-meal-grid plan-gap-meal-head">
              <span>{l('餐次', 'Meal')}</span>
              <span className="plan-gap-num">{l('计划', 'Planned')} kcal</span>
              <span className="plan-gap-num">{l('实际', 'Actual')} kcal</span>
              <span className="plan-gap-num">{l('差值', 'Delta')}</span>
            </div>
            {planGap.mealGaps.map((row) => {
              const delta = row.deltaCalories
              const tone = delta > 0 ? 'under' : delta < 0 ? 'over' : 'even'
              return (
                <div key={row.mealType} className={`plan-gap-meal-grid plan-gap-meal-row is-${tone}`}>
                  <span>{t(mealLabelKeys[row.mealType])}</span>
                  <span className="plan-gap-num">{row.plannedCalories}</span>
                  <span className="plan-gap-num">{row.actualCalories}</span>
                  <span className="plan-gap-num">
                    {delta > 0 ? `+${delta}` : delta}
                  </span>
                </div>
              )
            })}
            <Text type="secondary" className="plan-gap-footnote">
              {l('差值为「计划 − 实际」：正数表示这一餐还有热量预算；负数表示这一餐已超出计划。', 'Delta is planned - actual: positive means this meal still has budget; negative means it is over plan.')}
            </Text>
          </div>
        </Card>
      )}

      {planGapReady && !planGap && (
        <Card className="plan-gap-card plan-gap-card-muted">
          <Title level={5} style={{ marginBottom: 6 }}>{l('今日计划 vs 实际', 'Today’s plan vs actual')}</Title>
          <Text type="secondary">
            {l('还没有可用的每日热量目标。请先在设置页填写「每日热量目标」，或在首页完成「AI 引导式计划制定」，猫猫虫才能帮你算差值哦。', 'No daily calorie target is available yet. Add one in Settings or complete AI guided planning on Home so Diet Agent can calculate the gap.')}
          </Text>
        </Card>
      )}

      {latestAdjustment && (
        <Card className="dynamic-plan-log-card">
          <div className="dynamic-plan-log-content">
            <div className="dynamic-plan-log-main">
              <div className="dynamic-plan-log-head">
                <Tag color={getAdjustmentTagColor(latestAdjustment)} bordered={false}>
                  {getAdjustmentStatusText(latestAdjustment, language)}
                </Tag>
                <Text type="secondary">
                  {latestAdjustment.mealType ? `${localizedMealTypeOptions.find((item) => item.value === latestAdjustment.mealType)?.label ?? t('common.confirm')} ${language === 'zh' ? '动态建议' : 'suggestion'}` : (language === 'zh' ? '今日动态建议' : 'Today’s suggestion')}
                </Text>
              </div>
              <Text strong>{l('猫猫虫的计划节奏提醒', 'Diet Agent plan rhythm reminder')}</Text>
              <Text className="dynamic-plan-log-text">
                {latestAdjustment.suggestionText}
              </Text>
              <div className="dynamic-plan-log-meta">
                <span>{l('计划', 'Planned')} {latestAdjustment.plannedCalories} kcal</span>
                <span>{l('实际', 'Actual')} {latestAdjustment.actualCalories} kcal</span>
                <span>{l('差值', 'Delta')} {latestAdjustment.deltaCalories > 0 ? '+' : ''}{latestAdjustment.deltaCalories} kcal</span>
              </div>
            </div>

            {!latestAdjustment.userResponse && (
              <div className="dynamic-plan-log-actions">
                <Button
                  type="primary"
                  size="small"
                  onClick={() => void handleAdjustmentResponse(latestAdjustment, 'accepted')}
                >
                  {l('采纳', 'Accept')}
                </Button>
                <Button
                  size="small"
                  icon={<ClockCircleOutlined />}
                  onClick={() => void handleAdjustmentResponse(latestAdjustment, 'snoozed')}
                >
                  {l('晚点', 'Later')}
                </Button>
                <Button
                  size="small"
                  onClick={() => void handleAdjustmentResponse(latestAdjustment, 'dismissed')}
                >
                  {l('忽略', 'Dismiss')}
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}

      <Card className="weekly-report-card">
        <div className="weekly-report-header">
          <div>
            <Title level={4} style={{ marginBottom: 6 }}>{l('本周统计报表', 'Weekly report')}</Title>
            <Text type="secondary">
              {formatWeekRange(weeklyReport.startDate, weeklyReport.endDate, language)} · {l('会随当前选中日期自动切换', 'updates with the selected date')}
            </Text>
          </div>
          <Tag color="magenta" bordered={false}>
            {l('已记录', 'Logged')} {weeklyReport.loggedDays}/7 {l('天', 'days')}
          </Tag>
        </div>

        <div className="weekly-overview-grid">
          <div className="weekly-metric-card weekly-metric-card-sunset">
            <span className="weekly-metric-label">{l('本周总摄入', 'Weekly total intake')}</span>
            <strong>{weeklyReport.totals.calories} kcal</strong>
            <span className="weekly-metric-caption">{l('共', '')} {weeklyReport.totals.mealCount} {l('餐，', 'meals,')} {weeklyReport.totals.itemCount} {l('个条目', 'items')}</span>
          </div>

          <div className="weekly-metric-card weekly-metric-card-mint">
            <span className="weekly-metric-label">{l('自然日均值', 'Calendar-day average')}</span>
            <strong>{weeklyReport.averagePerDay.calories} kcal</strong>
            <span className="weekly-metric-caption">{l('7 天口径，适合看整周节奏', '7-day basis for the whole-week rhythm')}</span>
          </div>

          <div className="weekly-metric-card weekly-metric-card-lavender">
            <span className="weekly-metric-label">{l('记录完成度', 'Logging completion')}</span>
            <strong>{weeklyReport.completionRate}%</strong>
            <span className="weekly-metric-caption">{weeklyReport.loggedDays} {l('天有有效记录', 'days with valid logs')}</span>
          </div>

          <div className="weekly-metric-card weekly-metric-card-gold">
            <span className="weekly-metric-label">{l('目标命中日', 'Goal-hit days')}</span>
            <strong>{calorieGoal ? `${weeklyReport.goalHitDays} ${l('天', 'days')}` : l('未设置', 'Not set')}</strong>
            <span className="weekly-metric-caption">
              {calorieGoal ? l(`目标 ${calorieGoal} kcal，容差 ±10%`, `Target ${calorieGoal} kcal, ±10% tolerance`) : l('去设置页补充热量目标', 'Add a calorie goal in Settings')}
            </span>
          </div>
        </div>

        <div className="weekly-report-body">
          <div className="weekly-chart-panel">
            <div className="weekly-chart-head">
              <div>
                <Text strong>{l('7 日热量分布', '7-day calorie distribution')}</Text>
                <br />
                <Text type="secondary">{l('横条越长，表示当天摄入越高；下方细条为宏量供能占比（蛋白 / 碳水 / 脂肪）', 'Longer bars mean higher daily intake; the thin strip below shows macro energy share (protein / carbs / fat).')}</Text>
              </div>
              <Text type="secondary">
                {l('参考上限', 'Reference max')} {weeklyReferenceCalories} kcal
              </Text>
            </div>

            <div className="weekly-day-list">
              {weeklyReport.days.map((day) => (
                <div
                  key={day.date}
                  className={`weekly-day-row${day.hasLog ? '' : ' is-empty'}`}
                >
                  <div className="weekly-day-label">
                    <strong>{formatWeekdayLabel(day.date, day.weekdayLabel, language)}</strong>
                    <span>{dayjs(day.date).format('MM/DD')}</span>
                  </div>

                  <div className="weekly-day-main-col">
                    <div className="weekly-day-track">
                      <div
                        className={`weekly-day-fill${day.goalHit ? ' is-goal' : ''}`}
                        style={{ width: `${getCalorieBarWidth(day.calories, weeklyReferenceCalories)}%` }}
                      />
                    </div>
                    {day.hasLog && day.calories > 0 && (() => {
                      const m = macroEnergyPercents(day)
                      const showMacro = m.protein + m.carbs + m.fat > 0
                      if (!showMacro) {
                        return null
                      }

                      return (
                        <div className="weekly-day-macro-strip" title={l('宏量供能占比：粉=蛋白质，蓝=碳水，金=脂肪', 'Macro energy share: pink=protein, blue=carbs, gold=fat')}>
                          <span className="macro-seg macro-seg-protein" style={{ width: `${m.protein}%` }} />
                          <span className="macro-seg macro-seg-carbs" style={{ width: `${m.carbs}%` }} />
                          <span className="macro-seg macro-seg-fat" style={{ width: `${m.fat}%` }} />
                        </div>
                      )
                    })()}
                  </div>

                  <div className="weekly-day-data">
                    <Text strong>{day.calories} kcal</Text>
                    <Text type="secondary">
                      {day.hasLog ? `${day.mealCount} ${l('餐', 'meals')} · ${l('蛋白', 'protein')} ${day.protein}g` : l('暂无记录', 'No log')}
                    </Text>
                  </div>

                  <div className="weekly-day-tag">
                    {day.goalHit ? (
                      <Tag color="success" bordered={false}>{l('达标', 'On target')}</Tag>
                    ) : day.hasLog ? (
                      <Tag color="default" bordered={false}>{l('已记录', 'Logged')}</Tag>
                    ) : (
                      <Tag color="default" bordered={false}>{l('空白', 'Blank')}</Tag>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="weekly-side-panel">
            <div className="weekly-macro-card">
              <Text strong>{l('平均营养', 'Average nutrition')}</Text>
              <div className="weekly-macro-grid">
                <div className="weekly-macro-item">
                  <span>{l('蛋白质', 'Protein')}</span>
                  <strong>{formatAverageValue(averageReference.protein)} g</strong>
                  <small>{averageScopeLabel}</small>
                </div>
                <div className="weekly-macro-item">
                  <span>{l('碳水', 'Carbs')}</span>
                  <strong>{formatAverageValue(averageReference.carbs)} g</strong>
                  <small>{averageScopeLabel}</small>
                </div>
                <div className="weekly-macro-item">
                  <span>{l('脂肪', 'Fat')}</span>
                  <strong>{formatAverageValue(averageReference.fat)} g</strong>
                  <small>{averageScopeLabel}</small>
                </div>
                <div className="weekly-macro-item">
                  <span>{l('平均餐次', 'Avg. meals')}</span>
                  <strong>{formatAverageValue(averageReference.mealCount)} {l('餐', 'meals')}</strong>
                  <small>{averageScopeLabel}</small>
                </div>
              </div>
            </div>

            <div className="weekly-insight-card">
              <Text strong>{l('本周洞察', 'Weekly insights')}</Text>
              <div className="weekly-insight-list">
                {weeklyInsights.map((line) => (
                  <div key={line} className="weekly-insight-item">
                    <span>•</span>
                    <Text>{line}</Text>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {(!dietLog || dietLog.meals.length === 0) ? (
        <Empty
          description={
            <Text type="secondary">
              {l('今天还没有记录呢~ 点击「添加记录」开始吧！🐾', 'No entries today. Click “Add Entry” to start.')}
            </Text>
          }
          style={{ marginTop: 60 }}
        />
      ) : (
        <div className="meals-list">
          {localizedMealTypeOptions.map(mt => {
            const meal = dietLog.meals.find(m => m.type === mt.value)
            if (!meal) return null

            const mealCalories = meal.items.reduce((s, i) => s + i.calories, 0)

            return (
              <Card key={mt.value} className="meal-card">
                <div className="meal-header">
                  <Title level={5}>{mt.label}</Title>
                  <Tag color="pink">{mealCalories} kcal</Tag>
                </div>
                <List
                  dataSource={meal.items}
                  renderItem={(item, index) => (
                    <List.Item
                      className="meal-item"
                      actions={[
                        <Button
                          type="text"
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                          onClick={() => void handleDeleteItem(mt.value, index)}
                        />
                      ]}
                    >
                      <div className="meal-item-info">
                        <span className="meal-item-emoji">{item.emoji || '🍽️'}</span>
                        <div>
                          <Text>{(() => {
                            const recipe = findRecipeByIdWithCustomFoods(recipes, item.recipeId)
                            return recipe ? localizeRecipe(recipe, language).name : item.name
                          })()}</Text>
                          {item.servings !== 1 && (
                            <Text type="secondary"> ×{item.servings}</Text>
                          )}
                          <br />
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            🔥{item.calories}kcal  {t('recipes.protein')} {item.protein}g  {t('recipes.carbs')} {item.carbs}g  {t('recipes.fat')} {item.fat}g
                          </Text>
                        </div>
                      </div>
                    </List.Item>
                  )}
                />
              </Card>
            )
          })}
        </div>
      )}

      <Modal
        title={`🐛 ${language === 'zh' ? '添加饮食记录' : 'Add diet log entry'}`}
        open={addModalOpen}
        onCancel={() => setAddModalOpen(false)}
        onOk={() => void handleAddItem()}
        okText={language === 'zh' ? '添加' : 'Add'}
        cancelText={t('common.cancel')}
        className="add-modal"
      >
        <div className="add-form">
          <div className="form-item">
            <Text>{l('餐次', 'Meal')}</Text>
            <Select
              value={addMealType}
              onChange={setAddMealType}
              options={localizedMealTypeOptions}
              style={{ width: '100%' }}
            />
          </div>
          <div className="form-item">
            <Text>{language === 'zh' ? '选择菜谱' : 'Choose recipe'}</Text>
            <Select
              showSearch
              placeholder={language === 'zh' ? '搜索菜谱...' : 'Search recipes...'}
              value={selectedRecipeId}
              onChange={setSelectedRecipeId}
              filterOption={(input, option) =>
                (option?.label as string || '').toLowerCase().includes(input.toLowerCase())
              }
              options={allRecipes.map(r => ({
                value: r.id,
                label: `${r.emoji || '🍽️'} ${localizeRecipe(r, language).name} (${r.calories}kcal)`,
              }))}
              style={{ width: '100%' }}
            />
          </div>
          <div className="form-item">
            <Text>{language === 'zh' ? '份数' : 'Servings'}</Text>
            <InputNumber
              min={0.5}
              max={10}
              step={0.5}
              value={servings}
              onChange={v => setServings(v || 1)}
              style={{ width: '100%' }}
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default DietLogPage
