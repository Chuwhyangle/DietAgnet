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
      estimateInconsistent: '营养数据不一致，请手动调整',
      lowConfidence: '识别置信度太低，请换个角度或手动输入',
      visionUnsupported: '当前模型不支持图片识别',
      allergyConflict: error.reason,
      noYesterdayMeal: '昨天这一餐没有记录',
      parseError: '解析失败，请重试',
    }
    message.error(errorMessages[error.code] || error.reason)
  }, [])

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
          message.success('📷 照片识别已自动记录！')
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
      message.error('照片处理失败，请重试')
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
      message.warning('请输入食物描述')
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
          message.success('✏️ 文字识别已自动记录！')
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
      message.error('文字识别失败，请重试')
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
        message.success('🔄 已复制昨天的记录！')
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
          message.success('🔄 已复制昨天的记录！')
        } else if (retryResult.error) {
          handleError(retryResult.error)
        }
      }
    } catch (err) {
      message.error('复制昨天记录失败')
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
        message.success(`${recipe?.emoji || '🍽️'} ${recipe?.name || '食物'}已记录！`)
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
          message.success(`${recipe?.emoji || '🍽️'} ${recipe?.name || '食物'}已记录！`)
        } else if (retryResult.error) {
          handleError(retryResult.error)
        }
      }
    } catch (err) {
      message.error('记录失败，请重试')
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

      message.success('✅ 已确认记录！')
      setPreview(null)
      setPhotoPreviewUrl(null)
      if (preview.source === 'text') {
        setTextInput('')
      }
    } catch (err) {
      message.error('保存失败，请重试')
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
        <Text strong>⚡ 快速记录</Text>
      </div>

      <div className="one-tap-logger-entries">
        {/* Photo button */}
        <div className="one-tap-entry one-tap-photo">
          <Button
            icon={loading === 'photo' ? <LoadingOutlined /> : <CameraOutlined />}
            onClick={handlePhotoClick}
            disabled={loading !== null}
            title="拍照识别食物"
          >
            📷 拍照
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
            placeholder="输入食物，如：一碗面条"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onSearch={() => void handleTextSubmit()}
            enterButton={
              <Button
                icon={loading === 'text' ? <LoadingOutlined /> : <EditOutlined />}
                disabled={loading !== null}
              >
                识别
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
            和昨天一样
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
              {loading === recipe.id ? <LoadingOutlined /> : recipe.emoji} {recipe.name}
            </Tag>
          ))}
        </div>
      </div>

      {/* Preview modal for photo/text estimates */}
      <Modal
        title="确认记录"
        open={preview !== null}
        onOk={() => void handleConfirmPreview()}
        onCancel={handleCancelPreview}
        okText="确认记录"
        cancelText="取消"
        className="one-tap-preview-modal"
      >
        {preview && (
          <div className="one-tap-preview">
            {photoPreviewUrl && (
              <div className="one-tap-preview-image">
                <img src={photoPreviewUrl} alt="食物照片" />
              </div>
            )}

            <div className="one-tap-preview-summary">
              <Text strong>
                共 {preview.items.length} 项，约 {Math.round(preview.totalCalories)} kcal
              </Text>
              <Tag color={preview.confidence >= 0.7 ? 'green' : 'orange'}>
                置信度 {Math.round(preview.confidence * 100)}%
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
