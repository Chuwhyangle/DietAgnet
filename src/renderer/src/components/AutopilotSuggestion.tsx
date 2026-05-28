/**
 * AutopilotSuggestion — displays 3 candidate meals with calorie info and reasoning.
 *
 * The user can accept a candidate ("选这个") or skip the round ("跳过本轮").
 *
 * @validates Requirements 4.1, 4.5, 4.6
 */

import { useState, useCallback } from 'react'
import { Card, Button, Typography, Tag, message } from 'antd'
import { ThunderboltOutlined, LoadingOutlined } from '@ant-design/icons'
import { acceptCandidate, skipSuggestionRound } from '../coaching/autopilotPlanner'
import type { AutopilotSuggestionRound, MealCandidate } from '../coaching/types'
import { useI18n } from '../i18n'
import './AutopilotSuggestion.css'

const { Text } = Typography

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AutopilotSuggestionProps {
  suggestion: AutopilotSuggestionRound
  onAccepted?: () => void
  onSkipped?: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function AutopilotSuggestion({
  suggestion,
  onAccepted,
  onSkipped,
}: AutopilotSuggestionProps): JSX.Element {
  const { language } = useI18n()
  const l = (zh: string, en: string): string => (language === 'zh' ? zh : en)
  const [loading, setLoading] = useState<string | null>(null) // recipeId or 'skip'

  // ---------------------------------------------------------------------------
  // Accept a candidate
  // ---------------------------------------------------------------------------

  const handleAccept = useCallback(
    async (candidate: MealCandidate) => {
      setLoading(candidate.recipeId)
      try {
        await acceptCandidate(candidate, suggestion.date, suggestion.mealType)
        message.success(
          language === 'zh'
            ? `${candidate.emoji || '🍽️'} ${candidate.name} 已记录！`
            : `${candidate.emoji || '🍽️'} ${candidate.name} logged.`,
        )
        onAccepted?.()
      } catch (err) {
        message.error(l('记录失败，请重试', 'Failed to log. Please try again.'))
      } finally {
        setLoading(null)
      }
    },
    [language, l, suggestion.date, suggestion.mealType, onAccepted],
  )

  // ---------------------------------------------------------------------------
  // Skip this round
  // ---------------------------------------------------------------------------

  const handleSkip = useCallback(async () => {
    setLoading('skip')
    try {
      await skipSuggestionRound(suggestion.date, suggestion.mealType)
      message.info(l('已跳过本轮推荐', 'Recommendation round skipped.'))
      onSkipped?.()
    } catch (err) {
      message.error(l('操作失败，请重试', 'Operation failed. Please try again.'))
    } finally {
      setLoading(null)
    }
  }, [l, suggestion.date, suggestion.mealType, onSkipped])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Card className="autopilot-suggestion" size="small">
      <div className="autopilot-suggestion-header">
        <Text strong>
          <ThunderboltOutlined /> {l('今日推荐', 'Today’s Picks')}
        </Text>
        <Tag color="processing" bordered={false}>
          {suggestion.mealType === 'breakfast'
            ? l('早餐', 'Breakfast')
            : suggestion.mealType === 'lunch'
              ? l('午餐', 'Lunch')
              : suggestion.mealType === 'dinner'
                ? l('晚餐', 'Dinner')
                : l('加餐', 'Snack')}
        </Tag>
      </div>

      {suggestion.fallback ? (
        <div className="autopilot-suggestion-fallback">
          <Text type="secondary">
            {l('没有合适的推荐，试试告诉我你有什么食材？', 'No suitable recommendation yet. Tell me what ingredients you have.')}
          </Text>
        </div>
      ) : (
        <>
          <div className="autopilot-suggestion-candidates">
            {suggestion.candidates.map((candidate) => (
              <div key={candidate.recipeId} className="autopilot-candidate">
                <div className="autopilot-candidate-info">
                  <span className="autopilot-candidate-emoji">
                    {candidate.emoji || '🍽️'}
                  </span>
                  <div className="autopilot-candidate-details">
                    <Text className="autopilot-candidate-name">
                      {candidate.name}
                    </Text>
                    <div className="autopilot-candidate-meta">
                      <Tag color="orange" bordered={false}>
                        🔥 {candidate.estimatedCalories} kcal
                      </Tag>
                      <Text className="autopilot-candidate-reasoning">
                        {candidate.reasoning}
                      </Text>
                    </div>
                  </div>
                </div>
                <div className="autopilot-candidate-action">
                  <Button
                    type="primary"
                    size="small"
                    onClick={() => void handleAccept(candidate)}
                    disabled={loading !== null}
                    icon={loading === candidate.recipeId ? <LoadingOutlined /> : undefined}
                  >
                    {l('选这个', 'Choose this')}
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="autopilot-suggestion-footer">
            <Button
              type="text"
              onClick={() => void handleSkip()}
              disabled={loading !== null}
              icon={loading === 'skip' ? <LoadingOutlined /> : undefined}
            >
              {l('跳过本轮', 'Skip this round')}
            </Button>
          </div>
        </>
      )}
    </Card>
  )
}

export default AutopilotSuggestion
