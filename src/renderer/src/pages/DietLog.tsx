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
import './DietLog.css'

const { Title, Text } = Typography

function formatWeekRange(startDate: string, endDate: string): string {
  return `${dayjs(startDate).format('M月D日')} - ${dayjs(endDate).format('M月D日')}`
}

function formatAverageValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function getCalorieBarWidth(calories: number, maxCalories: number): number {
  if (calories <= 0 || maxCalories <= 0) {
    return 0
  }

  return Math.max(8, Math.round((calories / maxCalories) * 100))
}

function buildWeeklyInsightLines(report: WeeklyDietReport): string[] {
  if (report.loggedDays === 0) {
    return ['这周还没有有效饮食记录。先记下一餐，周报就会自动开始统计。']
  }

  const insightLines = [
    `本周累计记录 ${report.loggedDays} 天，共摄入 ${report.totals.calories} kcal，平均每天 ${report.averagePerDay.calories} kcal。`,
  ]

  if (report.highestCalorieDay) {
    insightLines.push(
      `摄入最高的是 ${report.highestCalorieDay.weekdayLabel}（${dayjs(report.highestCalorieDay.date).format('M月D日')}），共 ${report.highestCalorieDay.calories} kcal。`,
    )
  }

  if (report.lowestCalorieDay && report.lowestCalorieDay.date !== report.highestCalorieDay?.date) {
    insightLines.push(
      `摄入最低的是 ${report.lowestCalorieDay.weekdayLabel}（${dayjs(report.lowestCalorieDay.date).format('M月D日')}），共 ${report.lowestCalorieDay.calories} kcal。`,
    )
  }

  if (report.calorieGoal) {
    insightLines.push(
      `接近每日目标 ${report.calorieGoal} kcal 的记录日有 ${report.goalHitDays} 天，命中口径为上下浮动 10%。`,
    )
  } else {
    insightLines.push('还没有设置每日热量目标，去设置页补充后可以看到“目标命中天数”。')
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

function getAdjustmentStatusText(adjustment: DailyPlanAdjustment): string {
  if (adjustment.userResponse === 'accepted') {
    return '已采纳'
  }

  if (adjustment.userResponse === 'dismissed') {
    return '已忽略'
  }

  if (adjustment.userResponse === 'snoozed') {
    return '已晚点'
  }

  return adjustment.suggestionType === 'supplement' ? '建议补充' : '建议收敛'
}



function getExportScopeLabel(scope: DietLogExportScope): string {
  if (scope === 'day') {
    return '当天'
  }

  if (scope === 'week') {
    return '本周'
  }

  return '全部'
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

function DietLogPage(): JSX.Element {
  const navigate = useNavigate()
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
      message.warning('请先选择一道菜谱哦~ 🐛')
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
    message.success('记录成功！猫猫虫很开心~ 🐛✨')
  }

  const handleDeleteItem = async (mealType: MealType, itemIndex: number): Promise<void> => {
    const nextLog = removeMealItemFromDietLog({
      date: dateStr,
      mealType,
      itemIndex,
    })

    setDietLog(nextLog)

    if (!nextLog) {
      message.success('这条饮食记录已经删除，今天已回到空记录状态。')
      return
    }

    message.success('已删除该条目。')
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
        message.success('已记录采纳这条建议。')
      } else if (response === 'snoozed') {
        message.success('已记下「晚点再看」，建议仍可在下方查看。')
      } else {
        message.success('已忽略这条建议。')
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
        `${getExportScopeLabel(scope)}记录已导出为 ${format.toUpperCase()}，共 ${payload.summary.itemCount} 条，保存到 ${result.filePath ?? '所选位置'}。`,
      )
      return
    }

    if (result.status === 'failed') {
      message.error(`导出失败：${result.error ?? '未知错误'}`)
    }
  }

  const handleOpenAiEstimator = (): void => {
    navigate('/chat', {
      state: {
        prefill: `我刚刚吃了一个菜谱库里没有的食物，请帮我估算名称、份量、热量和宏量营养，并记录到 ${dateStr} 的饮食里：`,
      },
    })
  }

  const nutritionSummary = summarizeDietLog(dietLog)
  const weeklyReport = getWeeklyDietReport(dateStr, calorieGoal)
  const weeklyReferenceCalories = Math.max(
    1,
    calorieGoal ?? 0,
    ...weeklyReport.days.map((day) => day.calories),
  )
  const averageReference = weeklyReport.loggedDays > 0
    ? weeklyReport.averagePerLoggedDay
    : weeklyReport.averagePerDay
  const averageScopeLabel = weeklyReport.loggedDays > 0 ? '按已记录日平均' : '按自然日平均'
  const weeklyInsights = buildWeeklyInsightLines(weeklyReport)
  const exportMenuItems: MenuProps['items'] = [
    {
      key: 'day-json',
      label: '导出当天 JSON',
      onClick: () => handleExportDietLog('day', 'json'),
    },
    {
      key: 'day-csv',
      label: '导出当天 CSV',
      onClick: () => handleExportDietLog('day', 'csv'),
    },
    {
      type: 'divider',
    },
    {
      key: 'week-json',
      label: '导出本周 JSON',
      onClick: () => handleExportDietLog('week', 'json'),
    },
    {
      key: 'week-csv',
      label: '导出本周 CSV',
      onClick: () => handleExportDietLog('week', 'csv'),
    },
    {
      type: 'divider',
    },
    {
      key: 'all-json',
      label: '导出全部 JSON',
      onClick: () => handleExportDietLog('all', 'json'),
    },
    {
      key: 'all-csv',
      label: '导出全部 CSV',
      onClick: () => handleExportDietLog('all', 'csv'),
    },
  ]

  return (
    <div className="dietlog-page">
      <div className="dietlog-header">
        <div>
          <Title level={3}>📝 饮食记录</Title>
          <Text type="secondary">记录每一餐，猫猫虫帮你算营养~</Text>
        </div>
        <div className="dietlog-actions">
          <DatePicker
            value={selectedDate}
            onChange={(date) => date && setSelectedDate(date)}
            allowClear={false}
          />
          <Dropdown menu={{ items: exportMenuItems }} trigger={['click']}>
            <Button icon={<DownloadOutlined />}>
              导出记录
            </Button>
          </Dropdown>
          <Button
            icon={<MessageOutlined />}
            onClick={handleOpenAiEstimator}
          >
            AI 估算食物
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setAddModalOpen(true)}
            className="add-btn"
          >
            添加记录
          </Button>
        </div>
      </div>

      <Card className="daily-summary">
        <div className="summary-content">
          <span className="summary-emoji">🐛</span>
          <div>
            <Text strong>{selectedDate.format('YYYY年MM月DD日')} </Text>
            <Text type="secondary">
              共记录 {nutritionSummary.mealCount} 餐，
              摄入 <Text strong style={{ color: '#FF8FA3' }}>{nutritionSummary.calories}</Text> kcal
            </Text>
          </div>
        </div>
        <div className="daily-summary-helper">
          <Text type="secondary">
            找不到现成菜谱时，可以直接让 AI 估算食物份量和热量，并顺手写进当天饮食记录。
          </Text>
          <Button type="link" icon={<MessageOutlined />} onClick={handleOpenAiEstimator}>
            去聊天估算
          </Button>
        </div>
      </Card>

      <OneTapLogger date={dateStr} mealType={getCurrentMealType()} />

      {planGapReady && planGap && (
        <Card className="plan-gap-card">
          <div className="plan-gap-header">
            <div>
              <Title level={5} style={{ marginBottom: 4 }}>今日计划 vs 实际</Title>
              <Text type="secondary">
                目标取自「最新 AI 饮食计划」的每日热量；若无计划则使用设置页的每日目标。
              </Text>
            </div>
            <Tag color="processing" bordered={false}>
              日目标 {planGap.dailyTarget} kcal
            </Tag>
          </div>

          <div className="plan-gap-progress">
            <div className="plan-gap-progress-labels">
              <Text>已摄入 {planGap.actualCalories} kcal</Text>
              <Text type="secondary">
                还可安排约 <Text strong>{planGap.remainingCalories}</Text> kcal
              </Text>
            </div>
            <Progress
              percent={Math.min(100, Math.round((planGap.actualCalories / planGap.dailyTarget) * 100))}
              status={planGap.actualCalories > planGap.dailyTarget * 1.05 ? 'exception' : 'active'}
              strokeColor={{ from: '#FFB6C1', to: '#7DD3A8' }}
              showInfo
            />
            <Text type="secondary" className="plan-gap-net-line">
              全天差值（实际 − 目标）：
              <Text strong style={{ marginLeft: 6, color: planGap.actualCalories > planGap.dailyTarget ? '#ff7875' : '#52c41a' }}>
                {planGap.actualCalories - planGap.dailyTarget > 0 ? '+' : ''}{planGap.actualCalories - planGap.dailyTarget} kcal
              </Text>
            </Text>
          </div>

          <div className="plan-gap-meals">
            <Text strong className="plan-gap-meals-title">按餐次拆分（计划来自当前热量分配比例）</Text>
            <div className="plan-gap-meal-grid plan-gap-meal-head">
              <span>餐次</span>
              <span className="plan-gap-num">计划 kcal</span>
              <span className="plan-gap-num">实际 kcal</span>
              <span className="plan-gap-num">差值</span>
            </div>
            {planGap.mealGaps.map((row) => {
              const delta = row.deltaCalories
              const tone = delta > 0 ? 'under' : delta < 0 ? 'over' : 'even'
              return (
                <div key={row.mealType} className={`plan-gap-meal-grid plan-gap-meal-row is-${tone}`}>
                  <span>{row.label}</span>
                  <span className="plan-gap-num">{row.plannedCalories}</span>
                  <span className="plan-gap-num">{row.actualCalories}</span>
                  <span className="plan-gap-num">
                    {delta > 0 ? `+${delta}` : delta}
                  </span>
                </div>
              )
            })}
            <Text type="secondary" className="plan-gap-footnote">
              差值为「计划 − 实际」：正数表示这一餐还有热量预算；负数表示这一餐已超出计划。
            </Text>
          </div>
        </Card>
      )}

      {planGapReady && !planGap && (
        <Card className="plan-gap-card plan-gap-card-muted">
          <Title level={5} style={{ marginBottom: 6 }}>今日计划 vs 实际</Title>
          <Text type="secondary">
            还没有可用的每日热量目标。请先在设置页填写「每日热量目标」，或在首页完成「AI 引导式计划制定」，猫猫虫才能帮你算差值哦。
          </Text>
        </Card>
      )}

      {latestAdjustment && (
        <Card className="dynamic-plan-log-card">
          <div className="dynamic-plan-log-content">
            <div className="dynamic-plan-log-main">
              <div className="dynamic-plan-log-head">
                <Tag color={getAdjustmentTagColor(latestAdjustment)} bordered={false}>
                  {getAdjustmentStatusText(latestAdjustment)}
                </Tag>
                <Text type="secondary">
                  {latestAdjustment.mealType ? `${mealTypeOptions.find((item) => item.value === latestAdjustment.mealType)?.label ?? '餐次'}动态建议` : '今日动态建议'}
                </Text>
              </div>
              <Text strong>猫猫虫的计划节奏提醒</Text>
              <Text className="dynamic-plan-log-text">
                {latestAdjustment.suggestionText}
              </Text>
              <div className="dynamic-plan-log-meta">
                <span>计划 {latestAdjustment.plannedCalories} kcal</span>
                <span>实际 {latestAdjustment.actualCalories} kcal</span>
                <span>差值 {latestAdjustment.deltaCalories > 0 ? '+' : ''}{latestAdjustment.deltaCalories} kcal</span>
              </div>
            </div>

            {!latestAdjustment.userResponse && (
              <div className="dynamic-plan-log-actions">
                <Button
                  type="primary"
                  size="small"
                  onClick={() => void handleAdjustmentResponse(latestAdjustment, 'accepted')}
                >
                  采纳
                </Button>
                <Button
                  size="small"
                  icon={<ClockCircleOutlined />}
                  onClick={() => void handleAdjustmentResponse(latestAdjustment, 'snoozed')}
                >
                  晚点
                </Button>
                <Button
                  size="small"
                  onClick={() => void handleAdjustmentResponse(latestAdjustment, 'dismissed')}
                >
                  忽略
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}

      <Card className="weekly-report-card">
        <div className="weekly-report-header">
          <div>
            <Title level={4} style={{ marginBottom: 6 }}>本周统计报表</Title>
            <Text type="secondary">
              {formatWeekRange(weeklyReport.startDate, weeklyReport.endDate)} · 会随当前选中日期自动切换
            </Text>
          </div>
          <Tag color="magenta" bordered={false}>
            已记录 {weeklyReport.loggedDays}/7 天
          </Tag>
        </div>

        <div className="weekly-overview-grid">
          <div className="weekly-metric-card weekly-metric-card-sunset">
            <span className="weekly-metric-label">本周总摄入</span>
            <strong>{weeklyReport.totals.calories} kcal</strong>
            <span className="weekly-metric-caption">共 {weeklyReport.totals.mealCount} 餐，{weeklyReport.totals.itemCount} 个条目</span>
          </div>

          <div className="weekly-metric-card weekly-metric-card-mint">
            <span className="weekly-metric-label">自然日均值</span>
            <strong>{weeklyReport.averagePerDay.calories} kcal</strong>
            <span className="weekly-metric-caption">7 天口径，适合看整周节奏</span>
          </div>

          <div className="weekly-metric-card weekly-metric-card-lavender">
            <span className="weekly-metric-label">记录完成度</span>
            <strong>{weeklyReport.completionRate}%</strong>
            <span className="weekly-metric-caption">{weeklyReport.loggedDays} 天有有效记录</span>
          </div>

          <div className="weekly-metric-card weekly-metric-card-gold">
            <span className="weekly-metric-label">目标命中日</span>
            <strong>{calorieGoal ? `${weeklyReport.goalHitDays} 天` : '未设置'}</strong>
            <span className="weekly-metric-caption">
              {calorieGoal ? `目标 ${calorieGoal} kcal，容差 ±10%` : '去设置页补充热量目标'}
            </span>
          </div>
        </div>

        <div className="weekly-report-body">
          <div className="weekly-chart-panel">
            <div className="weekly-chart-head">
              <div>
                <Text strong>7 日热量分布</Text>
                <br />
                <Text type="secondary">横条越长，表示当天摄入越高；下方细条为宏量供能占比（蛋白 / 碳水 / 脂肪）</Text>
              </div>
              <Text type="secondary">
                参考上限 {weeklyReferenceCalories} kcal
              </Text>
            </div>

            <div className="weekly-day-list">
              {weeklyReport.days.map((day) => (
                <div
                  key={day.date}
                  className={`weekly-day-row${day.hasLog ? '' : ' is-empty'}`}
                >
                  <div className="weekly-day-label">
                    <strong>{day.weekdayLabel}</strong>
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
                        <div className="weekly-day-macro-strip" title="宏量供能占比：粉=蛋白质，蓝=碳水，金=脂肪">
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
                      {day.hasLog ? `${day.mealCount} 餐 · 蛋白 ${day.protein}g` : '暂无记录'}
                    </Text>
                  </div>

                  <div className="weekly-day-tag">
                    {day.goalHit ? (
                      <Tag color="success" bordered={false}>达标</Tag>
                    ) : day.hasLog ? (
                      <Tag color="default" bordered={false}>已记录</Tag>
                    ) : (
                      <Tag color="default" bordered={false}>空白</Tag>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="weekly-side-panel">
            <div className="weekly-macro-card">
              <Text strong>平均营养</Text>
              <div className="weekly-macro-grid">
                <div className="weekly-macro-item">
                  <span>蛋白质</span>
                  <strong>{formatAverageValue(averageReference.protein)} g</strong>
                  <small>{averageScopeLabel}</small>
                </div>
                <div className="weekly-macro-item">
                  <span>碳水</span>
                  <strong>{formatAverageValue(averageReference.carbs)} g</strong>
                  <small>{averageScopeLabel}</small>
                </div>
                <div className="weekly-macro-item">
                  <span>脂肪</span>
                  <strong>{formatAverageValue(averageReference.fat)} g</strong>
                  <small>{averageScopeLabel}</small>
                </div>
                <div className="weekly-macro-item">
                  <span>平均餐次</span>
                  <strong>{formatAverageValue(averageReference.mealCount)} 餐</strong>
                  <small>{averageScopeLabel}</small>
                </div>
              </div>
            </div>

            <div className="weekly-insight-card">
              <Text strong>本周洞察</Text>
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
              今天还没有记录呢~ 点击「添加记录」开始吧！🐾
            </Text>
          }
          style={{ marginTop: 60 }}
        />
      ) : (
        <div className="meals-list">
          {mealTypeOptions.map(mt => {
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
                          <Text>{item.name}</Text>
                          {item.servings !== 1 && (
                            <Text type="secondary"> ×{item.servings}</Text>
                          )}
                          <br />
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            🔥{item.calories}kcal  蛋白质{item.protein}g  碳水{item.carbs}g  脂肪{item.fat}g
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
        title="🐛 添加饮食记录"
        open={addModalOpen}
        onCancel={() => setAddModalOpen(false)}
        onOk={() => void handleAddItem()}
        okText="添加"
        cancelText="取消"
        className="add-modal"
      >
        <div className="add-form">
          <div className="form-item">
            <Text>餐次</Text>
            <Select
              value={addMealType}
              onChange={setAddMealType}
              options={mealTypeOptions}
              style={{ width: '100%' }}
            />
          </div>
          <div className="form-item">
            <Text>选择菜谱</Text>
            <Select
              showSearch
              placeholder="搜索菜谱..."
              value={selectedRecipeId}
              onChange={setSelectedRecipeId}
              filterOption={(input, option) =>
                (option?.label as string || '').toLowerCase().includes(input.toLowerCase())
              }
              options={allRecipes.map(r => ({
                value: r.id,
                label: `${r.emoji || '🍽️'} ${r.name} (${r.calories}kcal)`,
              }))}
              style={{ width: '100%' }}
            />
          </div>
          <div className="form-item">
            <Text>份数</Text>
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
