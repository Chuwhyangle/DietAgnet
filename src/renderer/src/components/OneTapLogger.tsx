/**
 * OneTapLogger — compact one-tap logging surface.
 *
 * Renders four entry points: photo button, text input,
 * "same as yesterday" chip, and common-food chips.
 *
 * @validates Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.7, 8.2, 8.3
 */

import { useState, useRef, useCallback } from 'react'
import { Button, Input, Tag, Card, message, Modal, List, Typography } from 'antd'
import { CameraOutlined, EditOutlined, SyncOutlined, LoadingOutlined } from '@ant-design/icons'
import type { MealType, MealItem } from '../stores/dietLog'
import { addMealItemToDietLog } from '../stores/dietLog'
import { recipes } from '../data/recipes'
import { executeOneTapLog } from '../coaching/oneTapLogger'
import { getCoachingSettings } from '../coaching/trustDial'
import { getUserMemories } from '../stores/planning'
import { estimateFromPhoto } from '../coaching/photoLogParser'
import { estimateFromText } from '../coaching/textLogParser'
import { localizeRecipe } from '../data/recipeTranslations.en'
import { useI18n } from '../i18n'
import type {
  OneTapLogError,
  PhotoEstimateResult,
  TextEstimateResult,
} from '../coaching/types'
import type { UserMemory } from '../stores/planning'
import './OneTapLogger.css'

const { Text } = Typography

// ---------------------------------------------------------------------------
// Common food chips — popular quick-access recipes
// ---------------------------------------------------------------------------

const COMMON_CHIP_IDS = [
  'tomato-egg',      // 🍅 番茄炒蛋
  'white-rice',      // 🍚 米饭
  'steamed-egg',     // 🥚 蒸蛋羹
  'congee',          // 🥣 皮蛋瘦肉粥
  'herb-roast-chicken', // 🍗 香草烤鸡腿
  'banana',          // 🍌 香蕉
]

function getCommonChips() {
  return COMMON_CHIP_IDS
    .map((id) => recipes.find((r) => r.id === id))
    .filter((r): r is NonNullable<typeof r> => r != null)
    .slice(0, 6)
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface OneTapLoggerProps {
  date: string
  mealType: MealType
}

// ---------------------------------------------------------------------------
// Estimate preview items (for photo/text confirmation)
// ---------------------------------------------------------------------------

interface PreviewItem {
  name: string
  servings: number
  calories: number
  protein: number
  carbs: number
  fat: number
  confidence: number
  recipeId?: string
}

interface PreviewState {
  source: 'photo' | 'text'
  items: PreviewItem[]
  totalCalories: number
  confidence: number
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function OneTapLogger({ date, mealType }: OneTapLoggerProps): JSX.Element {
  const { language, t } = useI18n()
  const [textInput, setTextInput] = useState('')
  const [loading, setLoading] = useState<string | null>(null) // 'photo' | 'text' | 'yesterday' | chipId
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const commonChips = getCommonChips()

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const loadAllergyMemories = useCallback(async (): Promise<UserMemory[]> => {
    try {
      return await getUserMemories({ types: ['allergy', 'avoidance'], status: 'active' })
    } catch {
      return []
    }
  }, [])

  const handleError = useCallback((error: OneTapLogError) => {
    const errorMessages: Record<string, string> = {
      estimateInconsistent: language === 'zh' ? '营养数据不一致，请手动调整' : 'Nutrition data looks inconsistent. Please adjust manually.',
      lowConfidence: language === 'zh' ? '识别置信度太低，请换个角度或手动输入' : 'Confidence is too low. Try another angle or enter it manually.',
      visionUnsupported: language === 'zh' ? '当前模型不支持图片识别' : 'The current model does not support image recognition.',
      allergyConflict: error.reason,
      noYesterdayMeal: language === 'zh' ? '昨天这一餐没有记录' : 'No entry exists for this meal yesterday.',
      parseError: language === 'zh' ? '解析失败，请重试' : 'Parsing failed. Please try again.',
    }
    message.error(errorMessages[error.code] || error.reason)
  }, [language])

  // ---------------------------------------------------------------------------
  // Photo flow
  // ---------------------------------------------------------------------------

  const handlePhotoClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Reset file input so the same file can be selected again
    event.target.value = ''

    setLoading('photo')

    try {
      // Read file as base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error('文件读取失败'))
        reader.readAsDataURL(file)
      })

      setPhotoPreviewUrl(base64)

      // Call estimateFromPhoto
      const result = await estimateFromPhoto(base64)

      if ('code' in result) {
        handleError(result as OneTapLogError)
        setPhotoPreviewUrl(null)
        setLoading(null)
        return
      }

      const estimate = result as PhotoEstimateResult
      const settings = getCoachingSettings()

      // Autopilot + high confidence → auto-save
      if (settings.trustMode === 'autopilot' && estimate.confidence >= settings.estimateAutoConfidence) {
        const allergyMemories = await loadAllergyMemories()
        const logResult = await executeOneTapLog(
          { source: 'photo', date, mealType, imageBase64: base64 },
          settings.trustMode,
          allergyMemories,
        )

        if (logResult.success && logResult.dietLog) {
          message.success(language === 'zh' ? '📷 照片识别已自动记录！' : '📷 Photo estimate saved automatically.')
        } else if (logResult.error) {
          handleError(logResult.error)
        }
        setPhotoPreviewUrl(null)
      } else {
        // Show preview for confirmation
        setPreview({
          source: 'photo',
          items: estimate.items.map((item) => ({
            name: item.name,
            servings: item.servings,
            calories: item.calories,
            protein: item.protein,
            carbs: item.carbs,
            fat: item.fat,
            confidence: item.confidence,
            recipeId: item.recipeId,
          })),
          totalCalories: estimate.calories,
          confidence: estimate.confidence,
        })
      }
    } catch (err) {
      message.error(language === 'zh' ? '照片处理失败，请重试' : 'Photo processing failed. Please try again.')
      setPhotoPreviewUrl(null)
    } finally {
      setLoading(null)
    }
  }, [date, mealType, handleError, loadAllergyMemories])

  // ---------------------------------------------------------------------------
  // Text flow
  // ---------------------------------------------------------------------------

  const handleTextSubmit = useCallback(async () => {
    const text = textInput.trim()
    if (!text) {
      message.warning(language === 'zh' ? '请输入食物描述' : 'Please describe the food.')
      return
    }

    setLoading('text')

    try {
      const result = await estimateFromText(text)

      if ('code' in result) {
        handleError(result as OneTapLogError)
        setLoading(null)
        return
      }

      const estimate = result as TextEstimateResult
      const settings = getCoachingSettings()

      // Autopilot + high confidence → auto-save
      if (settings.trustMode === 'autopilot' && estimate.confidence >= settings.estimateAutoConfidence) {
        const allergyMemories = await loadAllergyMemories()
        const logResult = await executeOneTapLog(
          { source: 'text_voice', date, mealType, rawText: text },
          settings.trustMode,
          allergyMemories,
        )

        if (logResult.success && logResult.dietLog) {
          message.success(language === 'zh' ? '✏️ 文字识别已自动记录！' : '✏️ Text estimate saved automatically.')
          setTextInput('')
        } else if (logResult.error) {
          handleError(logResult.error)
        }
      } else {
        // Show preview for confirmation
        setPreview({
          source: 'text',
          items: estimate.items.map((item) => ({
            name: item.name,
            servings: item.servings,
            calories: item.calories,
            protein: item.protein,
            carbs: item.carbs,
            fat: item.fat,
            confidence: item.confidence,
            recipeId: item.recipeId,
          })),
          totalCalories: estimate.calories,
          confidence: estimate.confidence,
        })
      }
    } catch (err) {
      message.error(language === 'zh' ? '文字识别失败，请重试' : 'Text recognition failed. Please try again.')
    } finally {
      setLoading(null)
    }
  }, [textInput, date, mealType, handleError, loadAllergyMemories])

  // ---------------------------------------------------------------------------
  // Same as yesterday flow
  // ---------------------------------------------------------------------------

  const handleSameAsYesterday = useCallback(async () => {
    setLoading('yesterday')

    try {
      const allergyMemories = await loadAllergyMemories()
      const settings = getCoachingSettings()

      const result = await executeOneTapLog(
        { source: 'same_as_yesterday', date, mealType },
        settings.trustMode,
        allergyMemories,
      )

      if (result.success && result.dietLog) {
        message.success(language === 'zh' ? '🔄 已复制昨天的记录！' : '🔄 Yesterday’s meal was copied.')
      } else if (result.error) {
        handleError(result.error)
      } else if (result.success && !result.dietLog) {
        // Needs confirmation — but same_as_yesterday is always high confidence,
        // so this shouldn't happen normally. Force save.
        const allergyMems = await loadAllergyMemories()
        const retryResult = await executeOneTapLog(
          { source: 'same_as_yesterday', date, mealType },
          'autopilot',
          allergyMems,
        )
        if (retryResult.success && retryResult.dietLog) {
          message.success(language === 'zh' ? '🔄 已复制昨天的记录！' : '🔄 Yesterday’s meal was copied.')
        } else if (retryResult.error) {
          handleError(retryResult.error)
        }
      }
    } catch (err) {
      message.error(language === 'zh' ? '复制昨天记录失败' : 'Could not copy yesterday’s entry.')
    } finally {
      setLoading(null)
    }
  }, [date, mealType, handleError, loadAllergyMemories])

  // ---------------------------------------------------------------------------
  // Common chip flow
  // ---------------------------------------------------------------------------

  const handleCommonChip = useCallback(async (recipeId: string) => {
    setLoading(recipeId)

    try {
      const allergyMemories = await loadAllergyMemories()
      const settings = getCoachingSettings()

      const result = await executeOneTapLog(
        { source: 'common_chip', date, mealType, chipRecipeId: recipeId },
        settings.trustMode,
        allergyMemories,
      )

      if (result.success && result.dietLog) {
        const recipe = recipes.find((r) => r.id === recipeId)
        const recipeName = recipe ? localizeRecipe(recipe, language).name : (language === 'zh' ? '食物' : 'food')
        message.success(`${recipe?.emoji || '🍽️'} ${recipeName}${language === 'zh' ? '已记录！' : ' saved.'}`)
      } else if (result.error) {
        handleError(result.error)
      } else if (result.success && !result.dietLog) {
        // Common chip is always high confidence, force save
        const retryResult = await executeOneTapLog(
          { source: 'common_chip', date, mealType, chipRecipeId: recipeId },
          'autopilot',
          await loadAllergyMemories(),
        )
        if (retryResult.success && retryResult.dietLog) {
          const recipe = recipes.find((r) => r.id === recipeId)
          const recipeName = recipe ? localizeRecipe(recipe, language).name : (language === 'zh' ? '食物' : 'food')
          message.success(`${recipe?.emoji || '🍽️'} ${recipeName}${language === 'zh' ? '已记录！' : ' saved.'}`)
        } else if (retryResult.error) {
          handleError(retryResult.error)
        }
      }
    } catch (err) {
      message.error(language === 'zh' ? '记录失败，请重试' : 'Logging failed. Please try again.')
    } finally {
      setLoading(null)
    }
  }, [date, mealType, handleError, loadAllergyMemories])

  // ---------------------------------------------------------------------------
  // Preview confirm/cancel
  // ---------------------------------------------------------------------------

  const handleConfirmPreview = useCallback(async () => {
    if (!preview) return

    try {
      for (const item of preview.items) {
        const mealItem: MealItem = {
          recipeId: item.recipeId || `estimate-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          name: item.name,
          servings: item.servings,
          calories: Math.round(item.calories),
          protein: Math.round(item.protein * 10) / 10,
          carbs: Math.round(item.carbs * 10) / 10,
          fat: Math.round(item.fat * 10) / 10,
        }

        addMealItemToDietLog({ date, mealType, item: mealItem })
      }

      message.success(language === 'zh' ? '✅ 已确认记录！' : '✅ Entry confirmed.')
      setPreview(null)
      setPhotoPreviewUrl(null)
      if (preview.source === 'text') {
        setTextInput('')
      }
    } catch (err) {
      message.error(language === 'zh' ? '保存失败，请重试' : 'Save failed. Please try again.')
    }
  }, [preview, date, mealType])

  const handleCancelPreview = useCallback(() => {
    setPreview(null)
    setPhotoPreviewUrl(null)
  }, [])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Card className="one-tap-logger" size="small">
      <div className="one-tap-logger-header">
        <Text strong>⚡ {t('oneTap.title')}</Text>
      </div>

      <div className="one-tap-logger-entries">
        {/* Photo button */}
        <div className="one-tap-entry one-tap-photo">
          <Button
            icon={loading === 'photo' ? <LoadingOutlined /> : <CameraOutlined />}
            onClick={handlePhotoClick}
            disabled={loading !== null}
            title={t('oneTap.photoTitle')}
          >
            📷 {t('oneTap.photo')}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => void handleFileChange(e)}
          />
        </div>

        {/* Text input */}
        <div className="one-tap-entry one-tap-text">
          <Input.Search
            placeholder={t('oneTap.textPlaceholder')}
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onSearch={() => void handleTextSubmit()}
            enterButton={
              <Button
                icon={loading === 'text' ? <LoadingOutlined /> : <EditOutlined />}
                disabled={loading !== null}
              >
                {t('oneTap.recognize')}
              </Button>
            }
            disabled={loading !== null}
            size="middle"
          />
        </div>

        {/* Same as yesterday chip */}
        <div className="one-tap-entry one-tap-yesterday">
          <Tag
            className="one-tap-chip one-tap-chip-yesterday"
            onClick={loading === null ? () => void handleSameAsYesterday() : undefined}
            icon={loading === 'yesterday' ? <LoadingOutlined /> : <SyncOutlined />}
          >
            {t('oneTap.sameYesterday')}
          </Tag>
        </div>

        {/* Common food chips */}
        <div className="one-tap-entry one-tap-common-chips">
          {commonChips.map((recipe) => (
            <Tag
              key={recipe.id}
              className="one-tap-chip one-tap-chip-food"
              onClick={loading === null ? () => void handleCommonChip(recipe.id) : undefined}
            >
              {loading === recipe.id ? <LoadingOutlined /> : recipe.emoji} {localizeRecipe(recipe, language).name}
            </Tag>
          ))}
        </div>
      </div>

      {/* Preview modal for photo/text estimates */}
      <Modal
        title={language === 'zh' ? '确认记录' : 'Confirm entry'}
        open={preview !== null}
        onOk={() => void handleConfirmPreview()}
        onCancel={handleCancelPreview}
        okText={language === 'zh' ? '确认记录' : 'Confirm entry'}
        cancelText={t('common.cancel')}
        className="one-tap-preview-modal"
      >
        {preview && (
          <div className="one-tap-preview">
            {photoPreviewUrl && (
              <div className="one-tap-preview-image">
                <img src={photoPreviewUrl} alt={language === 'zh' ? '食物照片' : 'Food photo'} />
              </div>
            )}

            <div className="one-tap-preview-summary">
              <Text strong>
                {language === 'zh'
                  ? `共 ${preview.items.length} 项，约 ${Math.round(preview.totalCalories)} kcal`
                  : `${preview.items.length} item(s), about ${Math.round(preview.totalCalories)} kcal`}
              </Text>
              <Tag color={preview.confidence >= 0.7 ? 'green' : 'orange'}>
                {language === 'zh' ? '置信度' : 'Confidence'} {Math.round(preview.confidence * 100)}%
              </Tag>
            </div>

            <List
              size="small"
              dataSource={preview.items}
              renderItem={(item) => (
                <List.Item className="one-tap-preview-item">
                  <div className="one-tap-preview-item-info">
                    <Text>{item.name}</Text>
                    {item.servings !== 1 && (
                      <Text type="secondary"> ×{item.servings}</Text>
                    )}
                  </div>
                  <div className="one-tap-preview-item-nutrition">
                    <Text type="secondary">
                      🔥{Math.round(item.calories)}kcal P{Math.round(item.protein)}g C{Math.round(item.carbs)}g F{Math.round(item.fat)}g
                    </Text>
                  </div>
                </List.Item>
              )}
            />
          </div>
        )}
      </Modal>
    </Card>
  )
}

export default OneTapLogger
