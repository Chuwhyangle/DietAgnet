/**
 * Photo Log Parser — structured estimate extraction from food images.
 *
 * Uses the existing `window.agent.chatCompletions` proxy with vision-capable models
 * to identify food items and estimate nutritional values from a photo.
 *
 * Image bytes are NEVER persisted to disk.
 */

import type { AgentChatRequest, RemoteChatMessage } from '../../../shared/agent'
import { getSettings, type AppLanguage } from '../stores/settings'
import { writeAuditEntry } from './auditLog'
import type {
  PhotoEstimateResult,
  PhotoEstimateItem,
  PhotoParseError,
  OneTapLogError,
} from './types'

// ---------------------------------------------------------------------------
// Vision capability check
// ---------------------------------------------------------------------------

/**
 * Known vision-capable model name patterns.
 * If the configured model contains any of these substrings (case-insensitive),
 * we assume it supports vision. Otherwise we attempt the call and handle errors.
 */
const VISION_MODEL_PATTERNS = [
  'vision',
  'vl',
  'gpt-4o',
  'gpt-4-turbo',
  'claude-3',
  'gemini',
  'qwen-vl',
  'deepseek-vl',
]

function isLikelyVisionCapable(model: string): boolean {
  const lower = model.toLowerCase()
  return VISION_MODEL_PATTERNS.some((pattern) => lower.includes(pattern))
}

// ---------------------------------------------------------------------------
// Serialization / Deserialization
// ---------------------------------------------------------------------------

/**
 * Serialize a PhotoEstimateResult to its canonical JSON envelope.
 */
export function serializePhotoEstimate(result: PhotoEstimateResult): string {
  return JSON.stringify({
    name: result.name,
    servings: result.servings,
    calories: result.calories,
    protein: result.protein,
    carbs: result.carbs,
    fat: result.fat,
    confidence: result.confidence,
    items: result.items.map((item) => {
      const serialized: Record<string, unknown> = {
        name: item.name,
        servings: item.servings,
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
        confidence: item.confidence,
      }
      if (item.recipeId !== undefined) {
        serialized.recipeId = item.recipeId
      }
      return serialized
    }),
  })
}

/**
 * Parse a canonical JSON envelope back into a PhotoEstimateResult.
 * Returns a PhotoParseError if schema validation fails.
 */
export function parsePhotoEstimate(json: string): PhotoEstimateResult | PhotoParseError {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return {
      code: 'schemaValidationFailed',
      reason: 'Invalid JSON',
      offendingPath: '$',
    }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {
      code: 'schemaValidationFailed',
      reason: 'Root must be an object',
      offendingPath: '$',
    }
  }

  const obj = parsed as Record<string, unknown>

  // Validate top-level required string field
  if (typeof obj.name !== 'string') {
    return {
      code: 'schemaValidationFailed',
      reason: 'Field "name" must be a string',
      offendingPath: '$.name',
    }
  }

  // Validate top-level required number fields
  const numberFields = ['servings', 'calories', 'protein', 'carbs', 'fat', 'confidence'] as const
  for (const field of numberFields) {
    if (typeof obj[field] !== 'number' || !Number.isFinite(obj[field] as number)) {
      return {
        code: 'schemaValidationFailed',
        reason: `Field "${field}" must be a finite number`,
        offendingPath: `$.${field}`,
      }
    }
  }

  // Validate items array
  if (!Array.isArray(obj.items)) {
    return {
      code: 'schemaValidationFailed',
      reason: 'Field "items" must be an array',
      offendingPath: '$.items',
    }
  }

  const items: PhotoEstimateItem[] = []
  for (let i = 0; i < obj.items.length; i++) {
    const item = obj.items[i]
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return {
        code: 'schemaValidationFailed',
        reason: `items[${i}] must be an object`,
        offendingPath: `$.items[${i}]`,
      }
    }

    const itemObj = item as Record<string, unknown>

    if (typeof itemObj.name !== 'string') {
      return {
        code: 'schemaValidationFailed',
        reason: `items[${i}].name must be a string`,
        offendingPath: `$.items[${i}].name`,
      }
    }

    for (const field of numberFields) {
      if (typeof itemObj[field] !== 'number' || !Number.isFinite(itemObj[field] as number)) {
        return {
          code: 'schemaValidationFailed',
          reason: `items[${i}].${field} must be a finite number`,
          offendingPath: `$.items[${i}].${field}`,
        }
      }
    }

    // recipeId is optional but must be a string if present
    if (itemObj.recipeId !== undefined && typeof itemObj.recipeId !== 'string') {
      return {
        code: 'schemaValidationFailed',
        reason: `items[${i}].recipeId must be a string if present`,
        offendingPath: `$.items[${i}].recipeId`,
      }
    }

    items.push({
      name: itemObj.name as string,
      servings: itemObj.servings as number,
      calories: itemObj.calories as number,
      protein: itemObj.protein as number,
      carbs: itemObj.carbs as number,
      fat: itemObj.fat as number,
      confidence: itemObj.confidence as number,
      recipeId: itemObj.recipeId as string | undefined,
    })
  }

  return {
    name: obj.name as string,
    servings: obj.servings as number,
    calories: obj.calories as number,
    protein: obj.protein as number,
    carbs: obj.carbs as number,
    fat: obj.fat as number,
    confidence: obj.confidence as number,
    items,
  }
}

// ---------------------------------------------------------------------------
// Vision prompt construction
// ---------------------------------------------------------------------------

const PHOTO_ESTIMATE_SYSTEM_PROMPT = `You are a nutrition estimation assistant. Given a photo of food, identify all visible food items and estimate their nutritional values.

Respond ONLY with a valid JSON object in this exact format (no markdown, no explanation):
{
  "name": "overall meal name",
  "servings": 1,
  "calories": total calories,
  "protein": total protein in grams,
  "carbs": total carbs in grams,
  "fat": total fat in grams,
  "confidence": your confidence 0.0-1.0,
  "items": [
    {
      "name": "item name",
      "servings": 1,
      "calories": item calories,
      "protein": item protein in grams,
      "carbs": item carbs in grams,
      "fat": item fat in grams,
      "confidence": item confidence 0.0-1.0
    }
  ]
}

Rules:
- Estimate based on typical serving sizes visible in the photo
- confidence should reflect how certain you are (0.5 = uncertain, 0.9 = very confident)
- All numeric values must be finite positive numbers
- The total calories/macros should approximately equal the sum of items
- Return ONLY the JSON object, no other text`

function buildVisionMessages(imageBase64: string, language: AppLanguage): RemoteChatMessage[] {
  // Determine the image MIME type from the base64 header or default to jpeg
  let dataUrl: string
  if (imageBase64.startsWith('data:')) {
    dataUrl = imageBase64
  } else {
    dataUrl = `data:image/jpeg;base64,${imageBase64}`
  }

  return [
    {
      role: 'system',
      content: PHOTO_ESTIMATE_SYSTEM_PROMPT,
    },
    {
      role: 'user',
      content: JSON.stringify([
        {
          type: 'image_url',
          image_url: { url: dataUrl },
        },
        {
          type: 'text',
          text: language === 'zh'
            ? '请识别这张食物照片中的所有食物，并估算每种食物的营养成分。'
            : 'Identify all foods in this photo and estimate the nutrition for each item.',
        },
      ]),
    },
  ]
}

// ---------------------------------------------------------------------------
// Image dimension extraction (from base64)
// ---------------------------------------------------------------------------

function getImageDimensions(imageBase64: string): { width: number; height: number } {
  // We cannot decode the image in a pure function without a canvas/Image API.
  // Return placeholder dimensions; the audit log will record what we can.
  // In a browser environment we could use Image(), but this keeps the function sync-safe.
  return { width: 0, height: 0 }
}

// ---------------------------------------------------------------------------
// Main estimation function
// ---------------------------------------------------------------------------

/**
 * Estimate nutritional content from a food photo.
 *
 * Calls `window.agent.chatCompletions` with a vision prompt.
 * Returns PhotoEstimateResult on success, or OneTapLogError on failure.
 */
export async function estimateFromPhoto(
  imageBase64: string,
): Promise<PhotoEstimateResult | OneTapLogError> {
  const settings = getSettings()
  const agentSettings = settings.agent
  const language = settings.language === 'zh' ? 'zh' : 'en'

  // Check vision capability before sending
  if (!isLikelyVisionCapable(agentSettings.model)) {
    return {
      code: 'visionUnsupported',
      reason: language === 'zh'
        ? '当前模型不支持图片识别，请在设置中切换到支持视觉的模型（如 qwen-vl、gpt-4o 等）'
        : 'The current model does not support image recognition. Switch to a vision-capable model in Settings, such as qwen-vl or gpt-4o.',
    }
  }

  const messages = buildVisionMessages(imageBase64, language)

  const request: AgentChatRequest = {
    settings: agentSettings,
    messages,
    tools: [],
    temperature: 0.3,
  }

  let response
  try {
    response = await window.agent.chatCompletions(request)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    // If the error indicates vision is not supported, return the specific error
    if (message.toLowerCase().includes('vision') || message.toLowerCase().includes('image')) {
      return {
        code: 'visionUnsupported',
        reason: language === 'zh' ? '当前模型不支持图片识别' : 'The current model does not support image recognition',
      }
    }
    return {
      code: 'parseError',
      reason: language === 'zh' ? `LLM 请求失败: ${message}` : `LLM request failed: ${message}`,
    }
  }

  // Parse the response content
  const content = response.content?.trim()
  if (!content) {
    return {
      code: 'parseError',
      reason: language === 'zh' ? '模型返回了空内容' : 'The model returned empty content',
    }
  }

  // Try to extract JSON from the response (handle potential markdown wrapping)
  let jsonContent = content
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    jsonContent = jsonMatch[1].trim()
  }

  const parseResult = parsePhotoEstimate(jsonContent)

  // Check if parse failed
  if ('code' in parseResult && parseResult.code === 'schemaValidationFailed') {
    return {
      code: 'parseError',
      reason: language === 'zh'
        ? `解析失败: ${parseResult.reason} (path: ${parseResult.offendingPath})`
        : `Parsing failed: ${parseResult.reason} (path: ${parseResult.offendingPath})`,
      offendingPath: parseResult.offendingPath,
    }
  }

  const result = parseResult as PhotoEstimateResult

  // Write audit entry on success
  const dimensions = getImageDimensions(imageBase64)
  await writeAuditEntry({
    actor: 'agent',
    action: 'photo_estimate_success',
    payload: {
      model: response.model ?? agentSettings.model,
      promptTokens: response.usage?.promptTokens ?? 0,
      completionTokens: response.usage?.completionTokens ?? 0,
      imageWidth: dimensions.width,
      imageHeight: dimensions.height,
      confidence: result.confidence,
      itemCount: result.items.length,
    },
  })

  return result
}
