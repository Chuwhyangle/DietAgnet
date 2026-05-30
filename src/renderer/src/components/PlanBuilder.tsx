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
  EditOutlined,
  ExclamationCircleOutlined,
  ReloadOutlined,
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
  type PlanningStepKey,
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
  getPlanningProfileSummaryItems,
  getPlanningProgress,
  getPlanningStep,
  getPlanningStepSkipValue,
  getPreviousPlanningStepKey,
  mergePlanningNote,
  normalizePlanningAnswer,
  validatePlanningAnswer,
} from '../planning/engine'
import { useI18n } from '../i18n'
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

function getSessionStatusLabel(session: PlanningSession | null, language: 'en' | 'zh'): string {
  if (!session) {
    return language === 'zh' ? '未开始' : 'Not started'
  }

  switch (session.status) {
    case 'completed':
      return language === 'zh' ? '已完成' : 'Completed'
    case 'cancelled':
      return language === 'zh' ? '已取消' : 'Cancelled'
    default:
      return language === 'zh' ? '进行中' : 'In progress'
  }
}

function formatTimestamp(value: string | undefined, language: 'en' | 'zh'): string {
  if (!value) {
    return language === 'zh' ? '未保存' : 'Not saved'
  }

  return new Date(value).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')
}

function PlanBuilder({ open, onClose, onCompleted }: PlanBuilderProps): JSX.Element {
  const { language } = useI18n()
  const l = (zh: string, en: string): string => (language === 'zh' ? zh : en)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [session, setSession] = useState<PlanningSession | null>(null)
  const [profileSnapshot, setProfileSnapshot] = useState<Partial<PlanningProfile>>({})
  const [draftValue, setDraftValue] = useState<string | number | undefined>(undefined)
  const [inlineError, setInlineError] = useState<string | null>(null)
  const [generatedPlan, setGeneratedPlan] = useState<PersonalDietPlan | null>(null)
  const [editingStepKey, setEditingStepKey] = useState<PlanningStepKey | null>(null)
  const transcriptEndRef = useRef<HTMLDivElement | null>(null)

  const currentFollowUp = session?.pendingFollowUps?.[0] ?? null
  const currentStep = useMemo(() => {
    if (!session?.currentStepKey || currentFollowUp) {
      return null
    }

    return getPlanningStep(session.currentStepKey, language)
  }, [currentFollowUp, language, session?.currentStepKey])
  const planningProgress = useMemo(
    () => getPlanningProgress(profileSnapshot, session?.completedStepKeys ?? []),
    [profileSnapshot, session?.completedStepKeys],
  )
  const profileSummaryItems = useMemo(
    () => getPlanningProfileSummaryItems(profileSnapshot, language),
    [language, profileSnapshot],
  )
  const isProfileComplete = planningProgress.totalCount > 0 &&
    planningProgress.completedCount >= planningProgress.totalCount
  const showProfileEditPicker = isProfileComplete &&
    !currentFollowUp &&
    !currentStep &&
    profileSummaryItems.length > 0
  const isEditingCompletedProfile = isProfileComplete &&
    Boolean(currentStep) &&
    (editingStepKey !== null ||
      profileSnapshot.completionStatus === 'completed' ||
      (session?.completedStepKeys?.length ?? 0) >= planningProgress.totalCount)

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
      setEditingStepKey(null)

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
            const initialStepKey = getInitialPlanningStepKey(workingProfile, completedStepKeys)
            workingSession = (await updatePlanningSession(workingSession.id, {
              status: initialStepKey ? workingSession.status : 'completed',
              currentStepKey: initialStepKey,
              completedStepKeys,
              profileSnapshot: workingProfile,
            })) ?? workingSession
          }

          if (workingSession.transcript.length === 0 && workingSession.currentStepKey) {
            const starterMessages = [
              createPlanningMessage(
                'assistant',
                completedStepKeys.length > 0
                  ? l(
                    '我接着帮你完善资料。你看到的每一步都会同步保存到本地，哪里不对就直接改掉。',
                    'I will keep helping you complete the profile. Each step is saved locally, and you can replace anything that looks off.',
                  )
                  : l(
                    '我会一步一步收集你的身体、目标和饮食习惯，最后生成一份可审计的专属计划。',
                    'I will collect your body data, goals, and eating habits step by step, then generate an auditable personal plan.',
                  ),
              ),
              createPlanningMessage(
                'assistant',
                buildPlanningPrompt(workingSession.currentStepKey, workingProfile, language),
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
          status: initialStepKey ? 'active' : 'completed',
          currentStepKey: initialStepKey,
          completedStepKeys,
          profileSnapshot: baseProfile,
        })) ?? newSession

        const starterMessages = initialStepKey
          ? [
            createPlanningMessage(
              'assistant',
              completedStepKeys.length > 0
                ? l(
                  '我先用你之前保存的资料做底稿，再逐项确认一次。需要修改时直接覆盖就好。',
                  'I will use your saved profile as a draft, then confirm each item. Replace any value that needs updating.',
                )
                : l(
                  '点击开始后，我会像顾问一样一步一步问你资料，所有记录都会写入本地数据库。',
                  'After you start, I will ask for your profile step by step and save everything to the local database.',
                ),
            ),
            createPlanningMessage('assistant', buildPlanningPrompt(initialStepKey, baseProfile, language)),
          ]
          : [
            createPlanningMessage(
              'assistant',
              l(
                '你的资料已经很完整啦，可以直接重新生成计划。',
                'Your profile is already complete, so you can regenerate the plan directly.',
              ),
            ),
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
        const errorMessage = error instanceof Error ? error.message : l('初始化计划流程失败', 'Failed to initialize the planning flow')
        message.error(errorMessage)
      } finally {
        setLoading(false)
      }
    }

    void loadPlanner()
  }, [language, open])

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
    setEditingStepKey(null)
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
      throw new Error(l('当前会话缺少 ID，无法生成计划。', 'The current session is missing an ID, so the plan cannot be generated.'))
    }

    const completedProfile = await savePlanningProfile(
      buildProfileSavePatch(nextProfileSnapshot, 'completed'),
    )

    let sessionAfterStatus = await appendPlanningMessages(workingSession.id, [
      createPlanningMessage('system', l('资料已收齐，开始生成专属计划...', 'Profile complete. Generating your personal plan...'), 'status'),
    ])
    sessionAfterStatus = sessionAfterStatus ?? workingSession

    const planDraft = await generatePlanningPlan(completedProfile, language)
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
          ? l(
            `计划内容已由模型 ${planDraft.generatedWithModel ?? '当前通道'} 生成并保存。`,
            `The plan was generated and saved by ${planDraft.generatedWithModel ?? 'the configured model'}.`,
          )
          : l(
            '当前 AI 通道不可用，已用本地安全模板生成计划并保存。',
            'The AI channel is unavailable, so a local safety template was generated and saved.',
          ),
        'status',
      ),
      createPlanningMessage(
        'assistant',
        l(
          `计划已经准备好啦。你的日均热量目标先按 ${savedPlan.dailyCalorieTarget} kcal 附近执行，首页会展示完整结果。`,
          `Your plan is ready. Start around ${savedPlan.dailyCalorieTarget} kcal per day; the full result will appear on the Home page.`,
        ),
      ),
    ])) ?? finalizedSession

    applySessionState(finalizedSession, completedProfile)
    setGeneratedPlan(savedPlan)
    setEditingStepKey(null)
    message.success(l('专属饮食计划已生成并保存到本地。', 'Your personal diet plan was generated and saved locally.'))
    onCompleted?.(savedPlan)
  }

  const handleStartProfileEdit = async (stepKey: PlanningStepKey): Promise<void> => {
    if (!session?.id) {
      return
    }

    setSubmitting(true)
    setInlineError(null)

    try {
      const step = getPlanningStep(stepKey, language)
      const completedStepKeys = Array.from(
        new Set([
          ...getCompletedPlanningStepKeys(profileSnapshot),
          ...(session.completedStepKeys ?? []),
        ]),
      )

      let workingSession = (await updatePlanningSession(session.id, {
        status: 'active',
        currentStepKey: stepKey,
        completedStepKeys,
        pendingFollowUps: [],
        profileSnapshot,
      })) ?? session

      workingSession = (await appendPlanningMessages(session.id, [
        createPlanningMessage(
          'system',
          l(`进入修改模式：${step.label}`, `Editing profile item: ${step.label}`),
          'status',
        ),
        createPlanningMessage('assistant', buildPlanningPrompt(stepKey, profileSnapshot, language)),
      ])) ?? workingSession

      setGeneratedPlan(null)
      setEditingStepKey(stepKey)
      applySessionState(workingSession, profileSnapshot)
    } catch (error) {
      console.error('Failed to start profile edit:', error)
      const errorMessage = error instanceof Error ? error.message : l('打开修改项失败', 'Failed to open this profile item')
      setInlineError(errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancelProfileEdit = async (): Promise<void> => {
    if (!session?.id) {
      return
    }

    setSubmitting(true)
    setInlineError(null)

    try {
      let workingSession = (await updatePlanningSession(session.id, {
        status: isProfileComplete ? 'completed' : 'active',
        currentStepKey: null,
        pendingFollowUps: [],
        profileSnapshot,
      })) ?? session

      workingSession = (await appendPlanningMessages(session.id, [
        createPlanningMessage(
          'system',
          l('已返回资料修改列表。', 'Returned to the profile edit list.'),
          'status',
        ),
      ])) ?? workingSession

      setEditingStepKey(null)
      applySessionState(workingSession, profileSnapshot)
    } catch (error) {
      console.error('Failed to cancel profile edit:', error)
      const errorMessage = error instanceof Error ? error.message : l('返回资料列表失败', 'Failed to return to the profile list')
      setInlineError(errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

  const handleRegenerateCurrentProfile = async (): Promise<void> => {
    if (!session?.id || !isProfileComplete) {
      return
    }

    setSubmitting(true)
    setInlineError(null)

    try {
      await finalizePlan(session, profileSnapshot)
    } catch (error) {
      console.error('Failed to regenerate planning plan:', error)
      const errorMessage = error instanceof Error ? error.message : l('重新生成计划失败', 'Failed to regenerate the plan')
      setInlineError(errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmitCurrentStep = async (forcedRawValue?: string | number): Promise<void> => {
    if (!session?.id || !currentStep) {
      return
    }

    setSubmitting(true)
    setInlineError(null)

    try {
      const shouldFinalizeAfterEdit = isEditingCompletedProfile
      const rawValue = forcedRawValue ?? (
        currentStep.optional && !String(draftValue ?? '').trim()
          ? getPlanningStepSkipValue(currentStep.key, language) ?? ''
          : draftValue
      )

      if (rawValue === undefined) {
        setInlineError(l(`请先填写${currentStep.label}。`, `Please fill in ${currentStep.label}.`))
        return
      }

      const validationMessage = validatePlanningAnswer(currentStep.key, rawValue, language)
      if (validationMessage) {
        setInlineError(validationMessage)
        return
      }

      const normalizedStepValue = normalizePlanningAnswer(currentStep.key, rawValue)
      const prettyAnswer = formatPlanningAnswer(currentStep.key, normalizedStepValue, language)
      const nextProfileSnapshot = {
        ...profileSnapshot,
        ...buildProfilePatch(currentStep.key, normalizedStepValue),
      }
      const savedProfile = await savePlanningProfile(
        buildProfileSavePatch(nextProfileSnapshot, 'draft'),
      )

      let workingSession = (await appendPlanningMessages(session.id, [
        createPlanningMessage('user', prettyAnswer),
        createPlanningMessage(
          'system',
          l(`已记录：${currentStep.label} = ${prettyAnswer}`, `Recorded: ${currentStep.label} = ${prettyAnswer}`),
          'status',
        ),
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
      const newFollowUps = buildPlanningFollowUps(savedProfile, existingFollowUpCodes, language)
      const nextStepKey = shouldFinalizeAfterEdit ? null : getNextPlanningStepKey(currentStep.key)

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

      if (shouldFinalizeAfterEdit) {
        await finalizePlan(workingSession, savedProfile)
        return
      }

      if (nextStepKey) {
        workingSession = (await appendAssistantPrompt(
          session.id,
          buildPlanningPrompt(nextStepKey, savedProfile, language),
        )) ?? workingSession
        applySessionState(workingSession, savedProfile)
        return
      }

      await finalizePlan(workingSession, savedProfile)
    } catch (error) {
      console.error('Failed to submit planning step:', error)
      const errorMessage = error instanceof Error ? error.message : l('保存当前问题失败', 'Failed to save the current answer')
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
      setInlineError(l('请补充说明，或者点击“暂时跳过”。', 'Please add details, or click “Skip for now”.'))
      return
    }

    setSubmitting(true)
    setInlineError(null)

    try {
      const shouldFinalizeAfterEdit = editingStepKey !== null || (isProfileComplete && !session.currentStepKey)
      const answerText = skip ? l('暂未补充', 'No details added yet') : normalizedAnswer
      const nextProfileSnapshot = { ...profileSnapshot }

      if (currentFollowUp.targetField && !skip) {
        nextProfileSnapshot[currentFollowUp.targetField] = mergePlanningNote(
          typeof nextProfileSnapshot[currentFollowUp.targetField] === 'string'
            ? nextProfileSnapshot[currentFollowUp.targetField]
            : undefined,
          answerText,
          language,
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
            ? l(
              `异常确认已记录：${currentFollowUp.note}（暂未补充说明）`,
              `Follow-up recorded: ${currentFollowUp.note} (no details added yet)`,
            )
            : l(
              `异常确认已记录：${currentFollowUp.note}`,
              `Follow-up recorded: ${currentFollowUp.note}`,
            ),
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

      if (shouldFinalizeAfterEdit) {
        await finalizePlan(workingSession, savedProfile)
        return
      }

      if (workingSession.currentStepKey) {
        workingSession = (await appendAssistantPrompt(
          session.id,
          buildPlanningPrompt(workingSession.currentStepKey, savedProfile, language),
        )) ?? workingSession
        applySessionState(workingSession, savedProfile)
        return
      }

      await finalizePlan(workingSession, savedProfile)
    } catch (error) {
      console.error('Failed to submit planning follow-up:', error)
      const errorMessage = error instanceof Error ? error.message : l('保存异常说明失败', 'Failed to save follow-up details')
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
          l(
            `好的，我们回到上一项。${buildPlanningPrompt(previousStepKey, profileSnapshot, language)}`,
            `Sure, let’s go back to the previous item. ${buildPlanningPrompt(previousStepKey, profileSnapshot, language)}`,
          ),
        ),
      ])) ?? workingSession

      applySessionState(workingSession, profileSnapshot)
    } catch (error) {
      console.error('Failed to go back to previous planning step:', error)
      const errorMessage = error instanceof Error ? error.message : l('回到上一题失败', 'Failed to return to the previous question')
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
          placeholder={l(
            '补充说明异常背景、医生建议或执行限制；如果暂时没有，也可以先跳过。',
            'Add context, medical advice, or execution limits. If you do not have details right now, you can skip for now.',
          )}
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

  const renderProfileEditPicker = (): JSX.Element => {
    return (
      <div className="plan-builder-edit-picker">
        <Paragraph type="secondary" className="plan-builder-question">
          {l(
            '资料已经收齐。选择任意一项修改，保存后会重新生成一版可审计的饮食计划；也可以直接用当前资料重新生成。',
            'Your profile is complete. Edit any item, then a new auditable plan version will be generated; or regenerate directly from the current profile.',
          )}
        </Paragraph>

        <div className="plan-builder-edit-grid">
          {profileSummaryItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className="plan-builder-edit-option"
              onClick={() => void handleStartProfileEdit(item.key)}
              disabled={submitting}
            >
              <EditOutlined className="plan-builder-edit-option-icon" />
              <span className="plan-builder-edit-option-main">
                <span className="plan-builder-edit-option-label">{item.label}</span>
                <span className="plan-builder-edit-option-value">{item.value}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="plan-builder-actions">
          <Button
            icon={<ReloadOutlined />}
            loading={submitting}
            onClick={() => void handleRegenerateCurrentProfile()}
          >
            {l('直接重新生成计划', 'Regenerate plan')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      title={l('AI 引导式计划制定', 'AI Guided Plan Builder')}
      width={860}
      className="plan-builder-drawer"
      destroyOnClose={false}
      extra={
        <Tag color={session?.status === 'completed' ? 'success' : 'processing'} bordered={false}>
          {getSessionStatusLabel(session, language)}
        </Tag>
      }
    >
      {loading ? (
        <div className="plan-builder-loading">
          <RobotOutlined spin />
          <Text type="secondary">{l('正在准备引导流程...', 'Preparing the guided flow...')}</Text>
        </div>
      ) : (
        <div className="plan-builder-shell">
          <Card className="plan-builder-hero" bordered={false}>
            <div className="plan-builder-hero-top">
              <div>
                <Tag color="gold" bordered={false}>{l('主线', 'Main Flow')}</Tag>
                <Title level={4} style={{ marginTop: 12, marginBottom: 8 }}>
                  {l('一步一步建立你的专属饮食档案', 'Build Your Personal Diet Profile Step by Step')}
                </Title>
                <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                  {l(
                    '这不是接口测试。这里记录的是你的真实身体数据、目标和生活习惯，所有内容都会落到本地数据库，后续每次改动都可追踪。',
                    'This records your real body data, goals, and lifestyle habits. Everything is stored locally and future changes remain traceable.',
                  )}
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
                  {l('已确认', 'Confirmed')} {planningProgress.completedCount}/{planningProgress.totalCount} {l('项', 'items')}
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
                  label: l('会话 ID', 'Session ID'),
                  children: session?.id ?? l('未创建', 'Not created'),
                },
                {
                  key: 'storage',
                  label: l('存储位置', 'Storage'),
                  children: l('本地 Dexie 数据库 diet-agent-planning', 'Local Dexie database diet-agent-planning'),
                },
                {
                  key: 'updatedAt',
                  label: l('最近保存', 'Last saved'),
                  children: formatTimestamp(session?.updatedAt, language),
                },
                {
                  key: 'pending',
                  label: l('待确认异常', 'Pending follow-ups'),
                  children: session?.pendingFollowUps?.length ?? 0,
                },
              ]}
            />
          </Card>

          <Row gutter={[16, 16]} className="plan-builder-overview">
            <Col xs={24} md={11}>
              <Card className="plan-builder-summary-card" title={l('当前档案摘要', 'Current Profile Summary')}>
                {profileSummaryItems.length > 0 ? (
                  <div className="plan-builder-summary-list">
                    {profileSummaryItems.map((item) => (
                      <div key={item.key} className="plan-builder-summary-item">
                        <Text type="secondary">{item.label}</Text>
                        <Text strong className="plan-builder-summary-value">{item.value}</Text>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={l('还没有收集到资料', 'No profile details collected yet')}
                  />
                )}
              </Card>
            </Col>
            <Col xs={24} md={13}>
              <Card className="plan-builder-summary-card" title={l('当前状态', 'Current Status')}>
                <Space wrap size={[8, 8]}>
                  <Tag icon={<ClockCircleOutlined />} color="processing" bordered={false}>
                    {session?.status === 'completed' ? l('本轮已完成', 'Completed') : l('逐步采集中', 'Collecting step by step')}
                  </Tag>
                  <Tag icon={<CheckCircleOutlined />} color="success" bordered={false}>
                    {l('已保存到本地', 'Saved locally')}
                  </Tag>
                  {(session?.pendingFollowUps?.length ?? 0) > 0 && (
                    <Tag icon={<ExclamationCircleOutlined />} color="warning" bordered={false}>
                      {l('有', 'Has')} {session?.pendingFollowUps.length} {l('项异常确认', 'follow-ups')}
                    </Tag>
                  )}
                </Space>

                <Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0 }}>
                  {l(
                    '当前流程会先做结构化采集和本地校验，再在最后一步尝试调用已配置的模型生成计划文案。就算 AI 通道暂时不可用，档案也会照常保存，计划会走本地兜底。',
                    'This flow collects structured profile data, validates it locally, then tries the configured model for plan wording at the final step. If AI is unavailable, the profile is still saved and a local fallback plan is used.',
                  )}
                </Paragraph>
              </Card>
            </Col>
          </Row>

          <Card className="plan-builder-transcript-card" title={l('引导记录', 'Guided Transcript')}>
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
                  <Text type="secondary">{l('热量目标', 'Calories')}</Text>
                  <Text strong>{generatedPlan.dailyCalorieTarget} kcal</Text>
                </div>
                <div className="plan-builder-result-metric">
                  <Text type="secondary">{l('蛋白质', 'Protein')}</Text>
                  <Text strong>{generatedPlan.proteinTarget} g</Text>
                </div>
                <div className="plan-builder-result-metric">
                  <Text type="secondary">{l('碳水', 'Carbs')}</Text>
                  <Text strong>{generatedPlan.carbsTarget} g</Text>
                </div>
                <div className="plan-builder-result-metric">
                  <Text type="secondary">{l('脂肪', 'Fat')}</Text>
                  <Text strong>{generatedPlan.fatTarget} g</Text>
                </div>
              </div>

              <Paragraph style={{ marginTop: 16 }}>{generatedPlan.summary}</Paragraph>

              <div className="plan-builder-result-block">
                <Text strong>{l('执行建议', 'Action Guidance')}</Text>
                <ul className="plan-builder-result-list">
                  {generatedPlan.mealGuidance.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="plan-builder-result-block">
                <Text strong>{l('注意事项', 'Cautions')}</Text>
                <ul className="plan-builder-result-list">
                  {generatedPlan.cautionNotes.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <Alert
                type={generatedPlan.generationMode === 'ai' ? 'success' : 'info'}
                showIcon
                message={generatedPlan.generationMode === 'ai'
                  ? l('本次已调用模型生成计划文案', 'This plan was generated with the model')
                  : l('本次使用本地安全模板生成计划', 'This plan used the local safety template')}
                description={
                  generatedPlan.generationMode === 'ai'
                    ? l(
                      `使用模型：${generatedPlan.generatedWithModel ?? '当前已配置模型'}`,
                      `Model: ${generatedPlan.generatedWithModel ?? 'configured model'}`,
                    )
                    : l(
                      '你仍然可以在 AI 通道恢复后重新走一轮采集并生成新的计划。',
                      'You can regenerate a new plan after the AI channel is available again.',
                    )
                }
              />
            </Card>
          )}

          {(currentFollowUp || currentStep || showProfileEditPicker || session?.status !== 'completed') && (
            <Card
              className="plan-builder-input-card"
              title={showProfileEditPicker
                ? l('选择要修改的资料', 'Choose a profile item to edit')
                : currentFollowUp
                  ? l('异常确认', 'Follow-up Check')
                  : currentStep
                    ? isEditingCompletedProfile
                      ? l(`修改资料：${currentStep.label}`, `Edit profile item: ${currentStep.label}`)
                      : l(`当前问题：${currentStep.label}`, `Current question: ${currentStep.label}`)
                    : l('等待处理', 'Waiting')}
            >
              {showProfileEditPicker ? (
                renderProfileEditPicker()
              ) : currentFollowUp ? (
                <Paragraph type="secondary" className="plan-builder-question">
                  {currentFollowUp.prompt}
                </Paragraph>
              ) : currentStep ? (
                <>
                  <Paragraph type="secondary" className="plan-builder-question">
                    {buildPlanningPrompt(currentStep.key, profileSnapshot, language)}
                  </Paragraph>
                  {currentStep.helperText && (
                    <Text type="secondary" className="plan-builder-helper">
                      {currentStep.helperText}
                    </Text>
                  )}
                </>
              ) : (
                <Paragraph type="secondary" className="plan-builder-question">
                  {l('当前没有待处理问题。', 'There is no pending question right now.')}
                </Paragraph>
              )}

              {!showProfileEditPicker && renderInputControl()}

              {inlineError && (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginTop: 16 }}
                  message={inlineError}
                />
              )}

              {(currentFollowUp || currentStep) && (
                <div className="plan-builder-actions">
                  {!currentFollowUp && currentStep && isEditingCompletedProfile && (
                    <Button onClick={() => void handleCancelProfileEdit()} disabled={submitting}>
                      {l('返回资料列表', 'Back to profile list')}
                    </Button>
                  )}

                  {!currentFollowUp && currentStep && !isEditingCompletedProfile && getPreviousPlanningStepKey(currentStep.key) && (
                    <Button onClick={() => void handleBack()} disabled={submitting}>
                      {l('返回上一题', 'Back')}
                    </Button>
                  )}

                  {(currentFollowUp || currentStep?.optional) && (
                    <Button
                      onClick={() => void (
                        currentFollowUp
                          ? handleSubmitFollowUp(true)
                          : handleSubmitCurrentStep(getPlanningStepSkipValue(currentStep?.key ?? 'dietPreference', language) ?? '')
                      )}
                      disabled={submitting}
                    >
                      {l('暂时跳过', 'Skip for now')}
                    </Button>
                  )}

                  <Button
                    type="primary"
                    loading={submitting}
                    onClick={() => void (currentFollowUp ? handleSubmitFollowUp(false) : handleSubmitCurrentStep())}
                  >
                    {currentFollowUp
                      ? l('保存异常说明', 'Save follow-up details')
                      : isEditingCompletedProfile
                        ? l('保存并重新生成', 'Save and regenerate')
                        : l('保存并继续', 'Save and continue')}
                  </Button>
                </div>
              )}
            </Card>
          )}
        </div>
      )}
    </Drawer>
  )
}

export default PlanBuilder
