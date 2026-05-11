import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Empty,
  Input,
  InputNumber,
  Progress,
  Row,
  Space,
  Tag,
  Typography,
  message,
} from 'antd'
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  RobotOutlined,
} from '@ant-design/icons'
import {
  addPlanningAnomalies,
  appendPlanningMessages,
  createPlanningMessage,
  createPlanningSession,
  getCurrentPlanningProfile,
  getLatestActivePlanningSession,
  getLatestPersonalDietPlan,
  savePersonalDietPlan,
  savePlanningProfile,
  updatePlanningSession,
  type PersonalDietPlan,
  type PlanningProfile,
  type PlanningSession,
} from '../stores/planning'
import {
  buildPlanningFollowUps,
  buildPlanningPrompt,
  buildProfilePatch,
  formatPlanningAnswer,
  generatePlanningPlan,
  getCompletedPlanningStepKeys,
  getInitialPlanningStepKey,
  getNextPlanningStepKey,
  getPlanningAnswerFromProfile,
  getPlanningProgress,
  getPlanningStep,
  getPlanningStepSkipValue,
  getPreviousPlanningStepKey,
  mergePlanningNote,
  normalizePlanningAnswer,
  summarizePlanningProfile,
  validatePlanningAnswer,
} from '../planning/engine'
import './PlanBuilder.css'

const { Paragraph, Text, Title } = Typography
const { TextArea } = Input

interface PlanBuilderProps {
  open: boolean
  onClose: () => void
  onCompleted?: (plan: PersonalDietPlan) => void
}

function buildProfileSavePatch(
  profileSnapshot: Partial<PlanningProfile>,
  completionStatus: 'draft' | 'completed',
): Partial<Omit<PlanningProfile, 'id' | 'updatedAt'>> {
  const {
    id: _id,
    updatedAt: _updatedAt,
    ...rest
  } = profileSnapshot as PlanningProfile & { updatedAt?: string }

  return {
    ...rest,
    completionStatus,
  }
}

function getSessionStatusLabel(session: PlanningSession | null): string {
  if (!session) {
    return '未开始'
  }

  switch (session.status) {
    case 'completed':
      return '已完成'
    case 'cancelled':
      return '已取消'
    default:
      return '进行中'
  }
}

function formatTimestamp(value?: string): string {
  if (!value) {
    return '未保存'
  }

  return new Date(value).toLocaleString('zh-CN')
}

function PlanBuilder({ open, onClose, onCompleted }: PlanBuilderProps): JSX.Element {
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [session, setSession] = useState<PlanningSession | null>(null)
  const [profileSnapshot, setProfileSnapshot] = useState<Partial<PlanningProfile>>({})
  const [draftValue, setDraftValue] = useState<string | number | undefined>(undefined)
  const [inlineError, setInlineError] = useState<string | null>(null)
  const [generatedPlan, setGeneratedPlan] = useState<PersonalDietPlan | null>(null)
  const transcriptEndRef = useRef<HTMLDivElement | null>(null)

  const currentFollowUp = session?.pendingFollowUps?.[0] ?? null
  const currentStep = useMemo(() => {
    if (!session?.currentStepKey || currentFollowUp) {
      return null
    }

    return getPlanningStep(session.currentStepKey)
  }, [currentFollowUp, session?.currentStepKey])
  const planningProgress = useMemo(
    () => getPlanningProgress(profileSnapshot, session?.completedStepKeys ?? []),
    [profileSnapshot, session?.completedStepKeys],
  )
  const profileSummaryItems = useMemo(
    () => summarizePlanningProfile(profileSnapshot),
    [profileSnapshot],
  )

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [session?.transcript.length, open])

  useEffect(() => {
    if (!open) {
      return
    }

    const loadPlanner = async (): Promise<void> => {
      setLoading(true)
      setInlineError(null)

      try {
        const currentProfile = await getCurrentPlanningProfile()
        const latestPlan = await getLatestPersonalDietPlan()
        const baseProfile = currentProfile ? { ...currentProfile } : {}
        const activeSession = await getLatestActivePlanningSession()

        if (activeSession?.id) {
          let workingProfile = {
            ...baseProfile,
            ...(activeSession.profileSnapshot ?? {}),
          }
          const completedStepKeys = activeSession.completedStepKeys?.length
            ? activeSession.completedStepKeys
            : getCompletedPlanningStepKeys(workingProfile)
          let workingSession = activeSession

          if (!workingSession.currentStepKey && (workingSession.pendingFollowUps?.length ?? 0) === 0) {
            workingSession = (await updatePlanningSession(workingSession.id, {
              currentStepKey: getInitialPlanningStepKey(workingProfile, completedStepKeys),
              completedStepKeys,
              profileSnapshot: workingProfile,
            })) ?? workingSession
          }

          if (workingSession.transcript.length === 0 && workingSession.currentStepKey) {
            const starterMessages = [
              createPlanningMessage(
                'assistant',
                completedStepKeys.length > 0
                  ? '我接着帮你完善资料。你看到的每一步都会同步保存到本地，哪里不对就直接改掉。'
                  : '我会一步一步收集你的身体、目标和饮食习惯，最后生成一份可审计的专属计划。',
              ),
              createPlanningMessage(
                'assistant',
                buildPlanningPrompt(workingSession.currentStepKey, workingProfile),
              ),
            ]

            workingSession = (await appendPlanningMessages(workingSession.id, starterMessages)) ?? workingSession
          }

          setSession(workingSession)
          setProfileSnapshot(workingProfile)
          setGeneratedPlan(
            latestPlan && latestPlan.id === workingSession.latestPlanId ? latestPlan : null,
          )
          return
        }

        const newSession = await createPlanningSession()
        const completedStepKeys = getCompletedPlanningStepKeys(baseProfile)
        const initialStepKey = getInitialPlanningStepKey(baseProfile, completedStepKeys)
        const initializedSession = (await updatePlanningSession(newSession.id as number, {
          currentStepKey: initialStepKey,
          completedStepKeys,
          profileSnapshot: baseProfile,
        })) ?? newSession

        const starterMessages = initialStepKey
          ? [
            createPlanningMessage(
              'assistant',
              completedStepKeys.length > 0
                ? '我先用你之前保存的资料做底稿，再逐项确认一次。需要修改时直接覆盖就好。'
                : '点击开始后，我会像顾问一样一步一步问你资料，所有记录都会写入本地数据库。',
            ),
            createPlanningMessage('assistant', buildPlanningPrompt(initialStepKey, baseProfile)),
          ]
          : [
            createPlanningMessage('assistant', '你的资料已经很完整啦，可以直接重新生成计划。'),
          ]

        const startedSession = (await appendPlanningMessages(
          initializedSession.id as number,
          starterMessages,
        )) ?? initializedSession

        setSession(startedSession)
        setProfileSnapshot(baseProfile)
        setGeneratedPlan(null)
      } catch (error) {
        console.error('Failed to initialize plan builder:', error)
        const errorMessage = error instanceof Error ? error.message : '初始化计划流程失败'
        message.error(errorMessage)
      } finally {
        setLoading(false)
      }
    }

    void loadPlanner()
  }, [open])

  useEffect(() => {
    setInlineError(null)

    if (currentFollowUp) {
      setDraftValue('')
      return
    }

    if (currentStep) {
      setDraftValue(getPlanningAnswerFromProfile(profileSnapshot, currentStep.key))
      return
    }

    setDraftValue(undefined)
  }, [currentFollowUp?.id, currentStep?.key])

  const handleClose = (): void => {
    setInlineError(null)
    onClose()
  }

  const applySessionState = (
    nextSession: PlanningSession | null,
    nextProfileSnapshot: Partial<PlanningProfile>,
  ): void => {
    setSession(nextSession)
    setProfileSnapshot(nextProfileSnapshot)
  }

  const appendAssistantPrompt = async (
    sessionId: number,
    prompt: string,
    kind: 'message' | 'warning' = 'message',
  ): Promise<PlanningSession | null> => {
    return appendPlanningMessages(sessionId, [
      createPlanningMessage('assistant', prompt, kind),
    ])
  }

  const finalizePlan = async (
    workingSession: PlanningSession,
    nextProfileSnapshot: Partial<PlanningProfile>,
  ): Promise<void> => {
    if (!workingSession.id) {
      throw new Error('当前会话缺少 ID，无法生成计划。')
    }

    const completedProfile = await savePlanningProfile(
      buildProfileSavePatch(nextProfileSnapshot, 'completed'),
    )

    let sessionAfterStatus = await appendPlanningMessages(workingSession.id, [
      createPlanningMessage('system', '资料已收齐，开始生成专属计划...', 'status'),
    ])
    sessionAfterStatus = sessionAfterStatus ?? workingSession

    const planDraft = await generatePlanningPlan(completedProfile)
    const savedPlan = await savePersonalDietPlan({
      ...planDraft,
      sourceSessionId: workingSession.id,
    })

    let finalizedSession = (await updatePlanningSession(workingSession.id, {
      status: 'completed',
      currentStepKey: null,
      pendingFollowUps: [],
      profileSnapshot: completedProfile,
      completedStepKeys: sessionAfterStatus.completedStepKeys,
    })) ?? sessionAfterStatus

    finalizedSession = (await appendPlanningMessages(workingSession.id, [
      createPlanningMessage(
        'system',
        planDraft.generationMode === 'ai'
          ? `计划内容已由模型 ${planDraft.generatedWithModel ?? '当前通道'} 生成并保存。`
          : '当前 AI 通道不可用，已用本地安全模板生成计划并保存。',
        'status',
      ),
      createPlanningMessage(
        'assistant',
        `计划已经准备好啦。你的日均热量目标先按 ${savedPlan.dailyCalorieTarget} kcal 附近执行，首页会展示完整结果。`,
      ),
    ])) ?? finalizedSession

    applySessionState(finalizedSession, completedProfile)
    setGeneratedPlan(savedPlan)
    message.success('专属饮食计划已生成并保存到本地。')
    onCompleted?.(savedPlan)
  }

  const handleSubmitCurrentStep = async (forcedRawValue?: string | number): Promise<void> => {
    if (!session?.id || !currentStep) {
      return
    }

    setSubmitting(true)
    setInlineError(null)

    try {
      const rawValue = forcedRawValue ?? (
        currentStep.optional && !String(draftValue ?? '').trim()
          ? getPlanningStepSkipValue(currentStep.key) ?? ''
          : draftValue
      )

      if (rawValue === undefined) {
        setInlineError(`请先填写${currentStep.label}。`)
        return
      }

      const validationMessage = validatePlanningAnswer(currentStep.key, rawValue)
      if (validationMessage) {
        setInlineError(validationMessage)
        return
      }

      const normalizedStepValue = normalizePlanningAnswer(currentStep.key, rawValue)
      const prettyAnswer = formatPlanningAnswer(currentStep.key, normalizedStepValue)
      const nextProfileSnapshot = {
        ...profileSnapshot,
        ...buildProfilePatch(currentStep.key, normalizedStepValue),
      }
      const savedProfile = await savePlanningProfile(
        buildProfileSavePatch(nextProfileSnapshot, 'draft'),
      )

      let workingSession = (await appendPlanningMessages(session.id, [
        createPlanningMessage('user', prettyAnswer),
        createPlanningMessage('system', `已记录：${currentStep.label} = ${prettyAnswer}`, 'status'),
      ])) ?? session

      const completedStepKeys = Array.from(
        new Set([
          ...(workingSession.completedStepKeys ?? []),
          currentStep.key,
        ]),
      )
      const existingFollowUpCodes = [
        ...(workingSession.pendingFollowUps ?? []).map((item) => item.code),
        ...(workingSession.resolvedFollowUpCodes ?? []),
      ]
      const newFollowUps = buildPlanningFollowUps(savedProfile, existingFollowUpCodes)
      const nextStepKey = getNextPlanningStepKey(currentStep.key)

      workingSession = (await updatePlanningSession(session.id, {
        profileSnapshot: savedProfile,
        currentStepKey: nextStepKey,
        completedStepKeys,
        pendingFollowUps: [...(workingSession.pendingFollowUps ?? []), ...newFollowUps],
      })) ?? workingSession

      if (newFollowUps.length > 0) {
        workingSession = (await addPlanningAnomalies(
          session.id,
          newFollowUps.map((item) => item.note),
        )) ?? workingSession
      }

      if (newFollowUps.length > 0) {
        workingSession = (await appendAssistantPrompt(
          session.id,
          newFollowUps[0].prompt,
          'warning',
        )) ?? workingSession
        applySessionState(workingSession, savedProfile)
        return
      }

      if (nextStepKey) {
        workingSession = (await appendAssistantPrompt(
          session.id,
          buildPlanningPrompt(nextStepKey, savedProfile),
        )) ?? workingSession
        applySessionState(workingSession, savedProfile)
        return
      }

      await finalizePlan(workingSession, savedProfile)
    } catch (error) {
      console.error('Failed to submit planning step:', error)
      const errorMessage = error instanceof Error ? error.message : '保存当前问题失败'
      setInlineError(errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmitFollowUp = async (skip = false): Promise<void> => {
    if (!session?.id || !currentFollowUp) {
      return
    }

    const normalizedAnswer = String(draftValue ?? '').trim()
    if (!skip && !normalizedAnswer) {
      setInlineError('请补充说明，或者点击“暂时跳过”。')
      return
    }

    setSubmitting(true)
    setInlineError(null)

    try {
      const answerText = skip ? '暂未补充' : normalizedAnswer
      const nextProfileSnapshot = { ...profileSnapshot }

      if (currentFollowUp.targetField && !skip) {
        nextProfileSnapshot[currentFollowUp.targetField] = mergePlanningNote(
          typeof nextProfileSnapshot[currentFollowUp.targetField] === 'string'
            ? nextProfileSnapshot[currentFollowUp.targetField]
            : undefined,
          answerText,
        )
      }

      const savedProfile = currentFollowUp.targetField && !skip
        ? await savePlanningProfile(buildProfileSavePatch(nextProfileSnapshot, 'draft'))
        : profileSnapshot

      let workingSession = (await appendPlanningMessages(session.id, [
        createPlanningMessage('user', answerText),
        createPlanningMessage(
          'system',
          skip
            ? `异常确认已记录：${currentFollowUp.note}（暂未补充说明）`
            : `异常确认已记录：${currentFollowUp.note}`,
          'status',
        ),
      ])) ?? session

      const remainingFollowUps = (workingSession.pendingFollowUps ?? []).slice(1)
      workingSession = (await updatePlanningSession(session.id, {
        pendingFollowUps: remainingFollowUps,
        resolvedFollowUpCodes: Array.from(
          new Set([
            ...(workingSession.resolvedFollowUpCodes ?? []),
            currentFollowUp.code,
          ]),
        ),
        profileSnapshot: savedProfile,
      })) ?? workingSession

      if (remainingFollowUps.length > 0) {
        workingSession = (await appendAssistantPrompt(
          session.id,
          remainingFollowUps[0].prompt,
          'warning',
        )) ?? workingSession
        applySessionState(workingSession, savedProfile)
        return
      }

      if (workingSession.currentStepKey) {
        workingSession = (await appendAssistantPrompt(
          session.id,
          buildPlanningPrompt(workingSession.currentStepKey, savedProfile),
        )) ?? workingSession
        applySessionState(workingSession, savedProfile)
        return
      }

      await finalizePlan(workingSession, savedProfile)
    } catch (error) {
      console.error('Failed to submit planning follow-up:', error)
      const errorMessage = error instanceof Error ? error.message : '保存异常说明失败'
      setInlineError(errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

  const handleBack = async (): Promise<void> => {
    if (!session?.id || !session.currentStepKey || currentFollowUp) {
      return
    }

    const previousStepKey = getPreviousPlanningStepKey(session.currentStepKey)
    if (!previousStepKey) {
      return
    }

    setSubmitting(true)
    setInlineError(null)

    try {
      let workingSession = (await updatePlanningSession(session.id, {
        currentStepKey: previousStepKey,
      })) ?? session

      workingSession = (await appendPlanningMessages(session.id, [
        createPlanningMessage(
          'assistant',
          `好的，我们回到上一项。${buildPlanningPrompt(previousStepKey, profileSnapshot)}`,
        ),
      ])) ?? workingSession

      applySessionState(workingSession, profileSnapshot)
    } catch (error) {
      console.error('Failed to go back to previous planning step:', error)
      const errorMessage = error instanceof Error ? error.message : '回到上一题失败'
      setInlineError(errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

  const renderInputControl = (): JSX.Element | null => {
    if (currentFollowUp) {
      return (
        <TextArea
          value={typeof draftValue === 'string' ? draftValue : ''}
          onChange={(event) => setDraftValue(event.target.value)}
          rows={4}
          placeholder="补充说明异常背景、医生建议或执行限制；如果暂时没有，也可以先跳过。"
          disabled={submitting}
        />
      )
    }

    if (!currentStep) {
      return null
    }

    if (currentStep.inputType === 'number') {
      return (
        <InputNumber
          value={typeof draftValue === 'number' ? draftValue : undefined}
          onChange={(value) => setDraftValue(typeof value === 'number' ? value : undefined)}
          min={currentStep.min}
          max={currentStep.max}
          step={currentStep.step}
          addonAfter={currentStep.unit}
          placeholder={currentStep.placeholder}
          style={{ width: '100%' }}
          disabled={submitting}
        />
      )
    }

    if (currentStep.inputType === 'choice') {
      return (
        <div className="plan-builder-choice-grid">
          {currentStep.options?.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`plan-builder-choice ${
                draftValue === option.value ? 'is-active' : ''
              }`}
              onClick={() => setDraftValue(option.value)}
              disabled={submitting}
            >
              <span className="plan-builder-choice-label">{option.label}</span>
              {option.description && (
                <span className="plan-builder-choice-description">{option.description}</span>
              )}
            </button>
          ))}
        </div>
      )
    }

    return (
      <TextArea
        value={typeof draftValue === 'string' ? draftValue : ''}
        onChange={(event) => setDraftValue(event.target.value)}
        rows={currentStep.rows ?? 3}
        placeholder={currentStep.placeholder}
        disabled={submitting}
      />
    )
  }

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      title="AI 引导式计划制定"
      width={860}
      className="plan-builder-drawer"
      destroyOnClose={false}
      extra={
        <Tag color={session?.status === 'completed' ? 'success' : 'processing'} bordered={false}>
          {getSessionStatusLabel(session)}
        </Tag>
      }
    >
      {loading ? (
        <div className="plan-builder-loading">
          <RobotOutlined spin />
          <Text type="secondary">正在准备引导流程...</Text>
        </div>
      ) : (
        <div className="plan-builder-shell">
          <Card className="plan-builder-hero" bordered={false}>
            <div className="plan-builder-hero-top">
              <div>
                <Tag color="gold" bordered={false}>主线</Tag>
                <Title level={4} style={{ marginTop: 12, marginBottom: 8 }}>
                  一步一步建立你的专属饮食档案
                </Title>
                <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                  这不是接口测试。这里记录的是你的真实身体数据、目标和生活习惯，所有内容都会落到本地数据库，后续每次改动都可追踪。
                </Paragraph>
              </div>
              <div className="plan-builder-progress-ring">
                <Progress
                  type="circle"
                  percent={planningProgress.percent}
                  size={96}
                  strokeColor="#FF8FA3"
                />
                <Text type="secondary">
                  已确认 {planningProgress.completedCount}/{planningProgress.totalCount} 项
                </Text>
              </div>
            </div>

            <Descriptions
              size="small"
              column={1}
              className="plan-builder-audit"
              items={[
                {
                  key: 'session',
                  label: '会话 ID',
                  children: session?.id ?? '未创建',
                },
                {
                  key: 'storage',
                  label: '存储位置',
                  children: '本地 Dexie 数据库 diet-agent-planning',
                },
                {
                  key: 'updatedAt',
                  label: '最近保存',
                  children: formatTimestamp(session?.updatedAt),
                },
                {
                  key: 'pending',
                  label: '待确认异常',
                  children: session?.pendingFollowUps?.length ?? 0,
                },
              ]}
            />
          </Card>

          <Row gutter={[16, 16]} className="plan-builder-overview">
            <Col xs={24} md={11}>
              <Card className="plan-builder-summary-card" title="当前档案摘要">
                {profileSummaryItems.length > 0 ? (
                  <div className="plan-builder-summary-list">
                    {profileSummaryItems.map((item) => (
                      <div key={item.label} className="plan-builder-summary-item">
                        <Text type="secondary">{item.label}</Text>
                        <Text strong>{item.value}</Text>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="还没有收集到资料"
                  />
                )}
              </Card>
            </Col>
            <Col xs={24} md={13}>
              <Card className="plan-builder-summary-card" title="当前状态">
                <Space wrap size={[8, 8]}>
                  <Tag icon={<ClockCircleOutlined />} color="processing" bordered={false}>
                    {session?.status === 'completed' ? '本轮已完成' : '逐步采集中'}
                  </Tag>
                  <Tag icon={<CheckCircleOutlined />} color="success" bordered={false}>
                    已保存到本地
                  </Tag>
                  {(session?.pendingFollowUps?.length ?? 0) > 0 && (
                    <Tag icon={<ExclamationCircleOutlined />} color="warning" bordered={false}>
                      有 {session?.pendingFollowUps.length} 项异常确认
                    </Tag>
                  )}
                </Space>

                <Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0 }}>
                  当前流程会先做结构化采集和本地校验，再在最后一步尝试调用已配置的模型生成计划文案。就算 AI 通道暂时不可用，档案也会照常保存，计划会走本地兜底。
                </Paragraph>
              </Card>
            </Col>
          </Row>

          <Card className="plan-builder-transcript-card" title="引导记录">
            <div className="plan-builder-transcript">
              {(session?.transcript ?? []).map((entry) => {
                if (entry.kind === 'status' || entry.kind === 'warning' || entry.role === 'system') {
                  return (
                    <div key={entry.id} className="plan-builder-status-row">
                      <span className={`plan-builder-status-pill ${entry.kind === 'warning' ? 'is-warning' : ''}`}>
                        {entry.content}
                      </span>
                    </div>
                  )
                }

                return (
                  <div
                    key={entry.id}
                    className={`plan-builder-message-row ${entry.role === 'user' ? 'is-user' : 'is-assistant'}`}
                  >
                    {entry.role !== 'user' && <div className="plan-builder-avatar">🐛</div>}
                    <div className={`plan-builder-bubble ${entry.role === 'user' ? 'is-user' : ''}`}>
                      <Text>{entry.content}</Text>
                    </div>
                  </div>
                )
              })}
              <div ref={transcriptEndRef} />
            </div>
          </Card>

          {generatedPlan && (
            <Card className="plan-builder-result-card" title={generatedPlan.title}>
              <div className="plan-builder-result-metrics">
                <div className="plan-builder-result-metric">
                  <Text type="secondary">热量目标</Text>
                  <Text strong>{generatedPlan.dailyCalorieTarget} kcal</Text>
                </div>
                <div className="plan-builder-result-metric">
                  <Text type="secondary">蛋白质</Text>
                  <Text strong>{generatedPlan.proteinTarget} g</Text>
                </div>
                <div className="plan-builder-result-metric">
                  <Text type="secondary">碳水</Text>
                  <Text strong>{generatedPlan.carbsTarget} g</Text>
                </div>
                <div className="plan-builder-result-metric">
                  <Text type="secondary">脂肪</Text>
                  <Text strong>{generatedPlan.fatTarget} g</Text>
                </div>
              </div>

              <Paragraph style={{ marginTop: 16 }}>{generatedPlan.summary}</Paragraph>

              <div className="plan-builder-result-block">
                <Text strong>执行建议</Text>
                <ul className="plan-builder-result-list">
                  {generatedPlan.mealGuidance.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="plan-builder-result-block">
                <Text strong>注意事项</Text>
                <ul className="plan-builder-result-list">
                  {generatedPlan.cautionNotes.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <Alert
                type={generatedPlan.generationMode === 'ai' ? 'success' : 'info'}
                showIcon
                message={generatedPlan.generationMode === 'ai' ? '本次已调用模型生成计划文案' : '本次使用本地安全模板生成计划'}
                description={
                  generatedPlan.generationMode === 'ai'
                    ? `使用模型：${generatedPlan.generatedWithModel ?? '当前已配置模型'}`
                    : '你仍然可以在 AI 通道恢复后重新走一轮采集并生成新的计划。'
                }
              />
            </Card>
          )}

          {session?.status !== 'completed' && (
            <Card
              className="plan-builder-input-card"
              title={currentFollowUp ? '异常确认' : currentStep ? `当前问题：${currentStep.label}` : '等待处理'}
            >
              {currentFollowUp ? (
                <Paragraph type="secondary" className="plan-builder-question">
                  {currentFollowUp.prompt}
                </Paragraph>
              ) : currentStep ? (
                <>
                  <Paragraph type="secondary" className="plan-builder-question">
                    {buildPlanningPrompt(currentStep.key, profileSnapshot)}
                  </Paragraph>
                  {currentStep.helperText && (
                    <Text type="secondary" className="plan-builder-helper">
                      {currentStep.helperText}
                    </Text>
                  )}
                </>
              ) : (
                <Paragraph type="secondary" className="plan-builder-question">
                  当前没有待处理问题。
                </Paragraph>
              )}

              {renderInputControl()}

              {inlineError && (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginTop: 16 }}
                  message={inlineError}
                />
              )}

              <div className="plan-builder-actions">
                {!currentFollowUp && currentStep && getPreviousPlanningStepKey(currentStep.key) && (
                  <Button onClick={() => void handleBack()} disabled={submitting}>
                    返回上一题
                  </Button>
                )}

                {(currentFollowUp || currentStep?.optional) && (
                  <Button
                    onClick={() => void (
                      currentFollowUp
                        ? handleSubmitFollowUp(true)
                        : handleSubmitCurrentStep(getPlanningStepSkipValue(currentStep?.key ?? 'dietPreference') ?? '')
                    )}
                    disabled={submitting}
                  >
                    暂时跳过
                  </Button>
                )}

                <Button
                  type="primary"
                  loading={submitting}
                  onClick={() => void (currentFollowUp ? handleSubmitFollowUp(false) : handleSubmitCurrentStep())}
                >
                  {currentFollowUp ? '保存异常说明' : '保存并继续'}
                </Button>
              </div>
            </Card>
          )}
        </div>
      )}
    </Drawer>
  )
}

export default PlanBuilder
