import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Col, Row, Statistic, Tag, Typography, message } from 'antd'
import dayjs from 'dayjs'
import {
  BookOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CoffeeOutlined,
  ExclamationCircleOutlined,
  FireOutlined,
  RobotOutlined,
} from '@ant-design/icons'
import PlanBuilder from '../components/PlanBuilder'
import PlanVersionAudit from '../components/PlanVersionAudit'
import OneTapLogger from '../components/OneTapLogger'
import AgentActivity from '../components/AgentActivity'
import { recipes } from '../data/recipes'
import { getTodayLog, summarizeDietLog, type DietLog } from '../stores/dietLog'
import {
  getCurrentPlanningProfile,
  getLatestDailyPlanAdjustment,
  getLatestActivePlanningSession,
  getLatestPersonalDietPlan,
  getRecentPersonalDietPlans,
  updateDailyPlanAdjustmentResponse,
  type DailyPlanAdjustment,
  type PersonalDietPlan,
  type PlanningProfile,
  type PlanningSession,
} from '../stores/planning'
import { getSettings } from '../stores/settings'
import {
  DIET_LOG_UPDATED_EVENT,
  PLANNING_UPDATED_EVENT,
  SETTINGS_UPDATED_EVENT,
} from '../stores/events'
import { useI18n } from '../i18n'
import { getPlanningProgress, summarizePlanningProfile } from '../planning/engine'
import './Home.css'

const { Title, Text, Paragraph } = Typography

function getGreeting(language: 'en' | 'zh'): string {
  const hour = new Date().getHours()
  if (language === 'en') {
    if (hour < 6) return 'It’s late. Time to wind down.'
    if (hour < 9) return 'Good morning! What sounds good for breakfast?'
    if (hour < 11) return 'Good morning! Remember to drink some water.'
    if (hour < 13) return 'Lunch time. Let’s keep it steady.'
    if (hour < 17) return 'Good afternoon. A light snack can help.'
    if (hour < 19) return 'Dinner time. Let’s make it balanced.'
    return 'Good evening. Tomorrow can be another steady day.'
  }
  if (hour < 6) return '夜深了，猫猫虫要睡觉啦 🌙'
  if (hour < 9) return '早上好呀！今天想吃什么早餐呢？🌅'
  if (hour < 11) return '上午好！记得喝杯水哦 💧'
  if (hour < 13) return '午饭时间到！猫猫虫饿饿了 🍱'
  if (hour < 17) return '下午好～来杯下午茶吧 🍵'
  if (hour < 19) return '晚饭时间！今天做点好吃的吧 🍲'
  return '晚上好～明天也要好好吃饭哦 🌟'
}

function formatTimestamp(value: string | undefined, language: 'en' | 'zh'): string {
  if (!value) {
    return language === 'zh' ? '尚未保存' : 'Not saved yet'
  }

  return new Date(value).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')
}

function getTodayDateString(): string {
  return dayjs().format('YYYY-MM-DD')
}

function getCurrentMealType(): 'breakfast' | 'lunch' | 'dinner' {
  const hour = dayjs().hour()
  if (hour < 10) return 'breakfast'
  if (hour < 15) return 'lunch'
  return 'dinner'
}

function getMealTypeLabel(mealType: string, language: 'en' | 'zh'): string {
  const labels = {
    breakfast: language === 'zh' ? '早餐' : 'Breakfast',
    lunch: language === 'zh' ? '午餐' : 'Lunch',
    dinner: language === 'zh' ? '晚餐' : 'Dinner',
    snack: language === 'zh' ? '加餐' : 'Snack',
  }

  return labels[mealType as keyof typeof labels] ?? mealType
}

function getAdjustmentTagColor(adjustment: DailyPlanAdjustment): string {
  if (adjustment.userResponse === 'accepted') {
    return 'success'
  }

  if (adjustment.userResponse === 'dismissed') {
    return 'default'
  }

  if (adjustment.suggestionType === 'supplement') {
    return 'orange'
  }

  if (adjustment.suggestionType === 'reduce') {
    return 'blue'
  }

  return 'processing'
}

function getAdjustmentStatusText(adjustment: DailyPlanAdjustment, language: 'en' | 'zh'): string {
  if (adjustment.userResponse === 'accepted') {
    return language === 'zh' ? '已采纳' : 'Accepted'
  }

  if (adjustment.userResponse === 'dismissed') {
    return language === 'zh' ? '已忽略' : 'Dismissed'
  }

  if (adjustment.userResponse === 'snoozed') {
    return language === 'zh' ? '稍后提醒' : 'Snoozed'
  }

  if (language === 'zh') {
    return adjustment.suggestionType === 'supplement' ? '建议补充' : '建议收敛'
  }

  return adjustment.suggestionType === 'supplement' ? 'Add something' : 'Scale back'
}

function getPlanningActionLabel(params: {
  activeSession: PlanningSession | null
  latestPlan: PersonalDietPlan | null
  progressPercent: number
  completedCount: number
  totalCount: number
  language: 'en' | 'zh'
}): string {
  const labels = params.language === 'zh'
    ? {
        continuePlan: '继续制定计划',
        continueProfile: '继续完善资料',
        rebuildPlan: '重新制定计划',
        reconfirmProfile: '重新确认档案',
        startPlan: '开始制定计划',
      }
    : {
        continuePlan: 'Continue planning',
        continueProfile: 'Continue profile',
        rebuildPlan: 'Rebuild plan',
        reconfirmProfile: 'Review profile',
        startPlan: 'Start planning',
      }

  if (params.activeSession) {
    return labels.continuePlan
  }

  if (params.completedCount > 0 && params.completedCount < params.totalCount) {
    return labels.continueProfile
  }

  if (params.latestPlan) {
    return labels.rebuildPlan
  }

  if (params.progressPercent >= 100) {
    return labels.reconfirmProfile
  }

  return labels.startPlan
}

function HomePage(): JSX.Element {
  const { language, t } = useI18n()
  const l = (zh: string, en: string): string => language === 'zh' ? zh : en
  const [nickname, setNickname] = useState(t('home.defaultNickname'))
  const [todayLog, setTodayLog] = useState<DietLog | null>(null)
  const [planningProfile, setPlanningProfile] = useState<PlanningProfile | null>(null)
  const [activePlanningSession, setActivePlanningSession] = useState<PlanningSession | null>(null)
  const [latestPlan, setLatestPlan] = useState<PersonalDietPlan | null>(null)
  const [recentPlans, setRecentPlans] = useState<PersonalDietPlan[]>([])
  const [latestAdjustment, setLatestAdjustment] = useState<DailyPlanAdjustment | null>(null)
  const [planBuilderOpen, setPlanBuilderOpen] = useState(false)

  useEffect(() => {
    let mounted = true

    const syncPageData = async (): Promise<void> => {
      const settings = getSettings()
      const [profile, activeSession, plan, plans, adjustment] = await Promise.all([
        getCurrentPlanningProfile(),
        getLatestActivePlanningSession(),
        getLatestPersonalDietPlan(),
        getRecentPersonalDietPlans(6),
        getLatestDailyPlanAdjustment(getTodayDateString()),
      ])

      if (!mounted) {
        return
      }

      setNickname(settings.nickname || t('home.defaultNickname'))
      setTodayLog(getTodayLog())
      setPlanningProfile(profile)
      setActivePlanningSession(activeSession)
      setLatestPlan(plan)
      setRecentPlans(plans)
      setLatestAdjustment(adjustment)
    }

    const handleSync = (): void => {
      void syncPageData()
    }

    void syncPageData()
    window.addEventListener(SETTINGS_UPDATED_EVENT, handleSync)
    window.addEventListener(DIET_LOG_UPDATED_EVENT, handleSync)
    window.addEventListener(PLANNING_UPDATED_EVENT, handleSync)

    return () => {
      mounted = false
      window.removeEventListener(SETTINGS_UPDATED_EVENT, handleSync)
      window.removeEventListener(DIET_LOG_UPDATED_EVENT, handleSync)
      window.removeEventListener(PLANNING_UPDATED_EVENT, handleSync)
    }
  }, [t])

  const nutritionSummary = summarizeDietLog(todayLog)
  const planningProgress = useMemo(
    () => getPlanningProgress(planningProfile ?? {}, activePlanningSession?.completedStepKeys ?? []),
    [planningProfile, activePlanningSession?.completedStepKeys],
  )
  const profileSummaryItems = useMemo(
    () => summarizePlanningProfile(planningProfile ?? {}, language).slice(0, 6),
    [language, planningProfile],
  )
  const planningActionLabel = getPlanningActionLabel({
    activeSession: activePlanningSession,
    latestPlan,
    progressPercent: planningProgress.percent,
    completedCount: planningProgress.completedCount,
    totalCount: planningProgress.totalCount,
    language,
  })

  const handleAdjustmentResponse = async (
    adjustment: DailyPlanAdjustment,
    response: 'accepted' | 'dismissed',
  ): Promise<void> => {
    if (!adjustment.id) {
      return
    }

    const updatedAdjustment = await updateDailyPlanAdjustmentResponse(adjustment.id, response)
    if (updatedAdjustment) {
      setLatestAdjustment(updatedAdjustment)
      message.success(language === 'zh'
        ? response === 'accepted' ? '已记录采纳这条建议。' : '已忽略这条建议。'
        : response === 'accepted' ? 'Suggestion accepted.' : 'Suggestion dismissed.')
    }
  }

  return (
    <div className="home-page">
      <div className="welcome-card">
        <div className="welcome-emoji">🐛✨</div>
        <Title level={3} className="welcome-title">
          {language === 'zh' ? `${nickname}，${getGreeting(language)}` : `${getGreeting(language)} ${nickname}`}
        </Title>
        <Text type="secondary">{t('home.subtitle')}</Text>
      </div>

      <OneTapLogger date={getTodayDateString()} mealType={getCurrentMealType()} />

      <Card className="planning-hero-card" style={{ marginTop: 24 }}>
        <div className="planning-hero-content">
          <div className="planning-hero-main">
            <Tag color="gold" bordered={false}>{t('home.mainFeature')}</Tag>
            <Title level={3} className="planning-hero-title">
              {t('home.planTitle')}
            </Title>
            <Paragraph type="secondary" className="planning-hero-description">
              {t('home.planDescription')}
            </Paragraph>

            <div className="planning-hero-badges">
              <span className="planning-badge">{t('home.localData')}</span>
              <span className="planning-badge">{t('home.followUps')}</span>
              <span className="planning-badge">{t('home.audit')}</span>
            </div>

            <div className="planning-hero-actions">
              <Button
                type="primary"
                size="large"
                icon={<RobotOutlined />}
                onClick={() => setPlanBuilderOpen(true)}
              >
                {planningActionLabel}
              </Button>
              <Text type="secondary">
                {language === 'zh'
                  ? `当前已确认 ${planningProgress.completedCount}/${planningProgress.totalCount} 项资料`
                  : `${planningProgress.completedCount}/${planningProgress.totalCount} profile items confirmed`}
              </Text>
            </div>
          </div>

          <div className="planning-hero-side">
            <div className="planning-metric-box">
              <Text type="secondary">{language === 'zh' ? '资料完成度' : 'Profile complete'}</Text>
              <strong>{planningProgress.percent}%</strong>
            </div>
            <div className="planning-metric-box">
              <Text type="secondary">{language === 'zh' ? '待确认异常' : 'Follow-ups'}</Text>
              <strong>{activePlanningSession?.pendingFollowUps?.length ?? 0}</strong>
            </div>
            <div className="planning-metric-box">
              <Text type="secondary">{language === 'zh' ? '最近保存' : 'Last saved'}</Text>
              <strong>
                {activePlanningSession
                  ? formatTimestamp(activePlanningSession.updatedAt, language)
                  : language === 'zh' ? '暂无进行中会话' : 'No active session'}
              </strong>
            </div>
          </div>
        </div>
      </Card>

      {latestAdjustment && (
        <Card className="dynamic-plan-card" style={{ marginTop: 24 }}>
          <div className="dynamic-plan-content">
            <div className="dynamic-plan-main">
              <div className="dynamic-plan-head">
                <Tag color={getAdjustmentTagColor(latestAdjustment)} bordered={false}>
                  {getAdjustmentStatusText(latestAdjustment, language)}
                </Tag>
                <Text type="secondary">
                  {latestAdjustment.mealType
                    ? language === 'zh'
                      ? `${getMealTypeLabel(latestAdjustment.mealType, language)}动态建议`
                      : `${getMealTypeLabel(latestAdjustment.mealType, language)} adjustment`
                    : l('今日动态建议', 'Today’s dynamic suggestion')}
                </Text>
              </div>
              <Title level={5} className="dynamic-plan-title">
                {l('猫猫虫发现今天的计划节奏有变化', 'Diet Agent found a shift in today’s plan rhythm')}
              </Title>
              <Paragraph className="dynamic-plan-text">
                {latestAdjustment.suggestionText}
              </Paragraph>
              <div className="dynamic-plan-meta">
                <span>{l('计划', 'Planned')} {latestAdjustment.plannedCalories} kcal</span>
                <span>{l('实际', 'Actual')} {latestAdjustment.actualCalories} kcal</span>
                <span>{l('差值', 'Delta')} {latestAdjustment.deltaCalories > 0 ? '+' : ''}{latestAdjustment.deltaCalories} kcal</span>
              </div>
            </div>

            {!latestAdjustment.userResponse && (
              <div className="dynamic-plan-actions">
                <Button
                  type="primary"
                  onClick={() => void handleAdjustmentResponse(latestAdjustment, 'accepted')}
                >
                  {l('采纳', 'Accept')}
                </Button>
                <Button onClick={() => void handleAdjustmentResponse(latestAdjustment, 'dismissed')}>
                  {l('忽略', 'Dismiss')}
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}

      <Row gutter={[20, 20]} style={{ marginTop: 24 }}>
        <Col xs={24} md={8}>
          <Card className="stat-card stat-card-pink" hoverable>
            <Statistic
              title={`🔥 ${t('home.caloriesToday')}`}
              value={nutritionSummary.calories}
              suffix="kcal"
              prefix={<FireOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card className="stat-card stat-card-mint" hoverable>
            <Statistic
              title={`🍽️ ${t('home.mealsLoggedToday')}`}
              value={nutritionSummary.mealCount}
              suffix={l('餐', 'meals')}
              prefix={<CoffeeOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card className="stat-card stat-card-lavender" hoverable>
            <Statistic
              title={`📖 ${t('home.availableRecipes')}`}
              value={recipes.length}
              suffix={l('道', 'recipes')}
              prefix={<BookOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[20, 20]} style={{ marginTop: 24 }}>
        <Col xs={24} lg={11}>
          <Card className="planning-detail-card" title={l('当前档案状态', 'Current profile status')}>
            <div className="planning-status-tags">
              {activePlanningSession ? (
                <Tag color="processing" icon={<ClockCircleOutlined />} bordered={false}>
                  {l('有一轮正在采集中', 'A planning session is in progress')}
                </Tag>
              ) : (
                <Tag color="default" icon={<ClockCircleOutlined />} bordered={false}>
                  {l('当前没有进行中的采集', 'No active planning session')}
                </Tag>
              )}
              {planningProgress.completedCount > 0 && (
                <Tag color="success" icon={<CheckCircleOutlined />} bordered={false}>
                  {l('已保存到本地数据库', 'Saved locally')}
                </Tag>
              )}
              {(activePlanningSession?.pendingFollowUps?.length ?? 0) > 0 && (
                <Tag color="warning" icon={<ExclamationCircleOutlined />} bordered={false}>
                  {activePlanningSession?.pendingFollowUps.length} {l('项异常待确认', 'follow-ups need confirmation')}
                </Tag>
              )}
            </div>

            {profileSummaryItems.length > 0 ? (
              <div className="planning-summary-list">
                {profileSummaryItems.map((item) => (
                  <div key={item.label} className="planning-summary-item">
                    <Text type="secondary">{item.label}</Text>
                    <Text strong>{item.value}</Text>
                  </div>
                ))}
              </div>
            ) : (
              <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                {l('还没有建立用户档案。点击上方主线入口后，猫猫虫会从年龄、身高、体重开始逐步问你。', 'No profile yet. Use the main planning entry above and Diet Agent will ask for age, height, weight, and other basics step by step.')}
              </Paragraph>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={13}>
          <Card className="planning-detail-card" title={l('最新专属计划', 'Latest personal plan')}>
            {latestPlan ? (
              <div className="latest-plan-panel">
                <div className="latest-plan-head">
                  <div>
                    <Title level={5} style={{ marginBottom: 4 }}>{latestPlan.title}</Title>
                    <Text type="secondary">{l('生成时间', 'Generated')}: {formatTimestamp(latestPlan.createdAt, language)}</Text>
                  </div>
                  <Tag color={latestPlan.generationMode === 'ai' ? 'success' : 'default'} bordered={false}>
                    {latestPlan.generationMode === 'ai' ? l('模型生成', 'AI generated') : l('本地模板', 'Local template')}
                  </Tag>
                </div>

                <div className="latest-plan-metrics">
                  <div className="latest-plan-metric">
                    <Text type="secondary">{l('热量', 'Calories')}</Text>
                    <strong>{latestPlan.dailyCalorieTarget} kcal</strong>
                  </div>
                  <div className="latest-plan-metric">
                    <Text type="secondary">{l('蛋白质', 'Protein')}</Text>
                    <strong>{latestPlan.proteinTarget} g</strong>
                  </div>
                  <div className="latest-plan-metric">
                    <Text type="secondary">{l('碳水', 'Carbs')}</Text>
                    <strong>{latestPlan.carbsTarget} g</strong>
                  </div>
                  <div className="latest-plan-metric">
                    <Text type="secondary">{l('脂肪', 'Fat')}</Text>
                    <strong>{latestPlan.fatTarget} g</strong>
                  </div>
                </div>

                <Paragraph className="latest-plan-summary">{latestPlan.summary}</Paragraph>

                <div className="latest-plan-guidance">
                  {latestPlan.mealGuidance.slice(0, 3).map((item) => (
                    <div key={item} className="latest-plan-guidance-item">
                      <span>•</span>
                      <Text>{item}</Text>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                {l('还没有生成专属计划。完成首页主线采集后，这里会展示最新的热量目标、宏量营养建议和执行提醒。', 'No personal plan yet. After the main planning flow is complete, calorie targets, macro advice, and reminders will appear here.')}
              </Paragraph>
            )}
          </Card>
        </Col>
      </Row>

      <AgentActivity />

      <div style={{ marginTop: 24 }}>
        <PlanVersionAudit plans={recentPlans} />
      </div>

      <Card className="tip-card" style={{ marginTop: 24 }}>
        <div className="tip-content">
          <span className="tip-emoji">🐾</span>
          <div>
            <Text strong>{l('猫猫虫小贴士', 'Diet Agent tip')}</Text>
            <br />
            <Text type="secondary">
              {l('饮食计划先求稳定，再求完美。先把真实资料录完整，再慢慢微调，执行起来会更稳。', 'Start with a steady plan before chasing perfection. Capture real details first, then tune gradually.')}
            </Text>
          </div>
        </div>
      </Card>

      <PlanBuilder open={planBuilderOpen} onClose={() => setPlanBuilderOpen(false)} />
    </div>
  )
}

export default HomePage
