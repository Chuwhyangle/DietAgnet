import { useState, useEffect } from 'react'
import {
  Card, Typography, Button, DatePicker, Select, Tag,
  List, Empty, Modal, InputNumber, message
} from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { recipes } from '../data/recipes'
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
} from '../stores/dietLog'
import { DIET_LOG_UPDATED_EVENT, SETTINGS_UPDATED_EVENT } from '../stores/events'
import { getSettings } from '../stores/settings'
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

function DietLogPage(): JSX.Element {
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs())
  const [dietLog, setDietLog] = useState<DietLog | null>(null)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [addMealType, setAddMealType] = useState<MealType>('breakfast')
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null)
  const [servings, setServings] = useState(1)
  const [calorieGoal, setCalorieGoal] = useState<number | undefined>(() => getSettings().calorieGoal)

  const dateStr = selectedDate.format('YYYY-MM-DD')

  useEffect(() => {
    const syncDietLog = (): void => {
      setDietLog(getDietLog(dateStr))
    }

    syncDietLog()
    window.addEventListener(DIET_LOG_UPDATED_EVENT, syncDietLog)

    return () => {
      window.removeEventListener(DIET_LOG_UPDATED_EVENT, syncDietLog)
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

  const handleAddItem = () => {
    if (!selectedRecipeId) {
      message.warning('请先选择一道菜谱哦~ 🐛')
      return
    }

    const recipe = recipes.find(r => r.id === selectedRecipeId)
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

  const handleDeleteItem = (mealType: MealType, itemIndex: number) => {
    const nextLog = removeMealItemFromDietLog({
      date: dateStr,
      mealType,
      itemIndex,
    })

    if (nextLog) {
      setDietLog(nextLog)
    }
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
      </Card>

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
                <Text type="secondary">横条越长，表示当天摄入越高</Text>
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

                  <div className="weekly-day-track">
                    <div
                      className={`weekly-day-fill${day.goalHit ? ' is-goal' : ''}`}
                      style={{ width: `${getCalorieBarWidth(day.calories, weeklyReferenceCalories)}%` }}
                    />
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
                          onClick={() => handleDeleteItem(mt.value, index)}
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
        onOk={handleAddItem}
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
              options={recipes.map(r => ({
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
