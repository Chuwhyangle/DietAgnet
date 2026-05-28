/**
 * Text/Voice Log Parser — structured estimate extraction from text descriptions.
 *
 * Uses the existing `window.agent.chatCompletions` proxy to identify food items
 * from a text description and estimate nutritional values.
 */

import type { AgentChatRequest, RemoteChatMessage } from '../../../shared/agent'
import { getSettings, type AppLanguage } from '../stores/settings'
import { writeAuditEntry } from './auditLog'
import type {
  TextEstimateResult,
  TextEstimateItem,
  TextParseError,
  OneTapLogError,
} from './types'

// ---------------------------------------------------------------------------
// Serialization / Deserialization
// ---------------------------------------------------------------------------

/**
 * Serialize a TextEstimateResult to its canonical JSON envelope.
 */
export function serializeTextEstimate(result: TextEstimateResult): string {
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
 * Parse a canonical JSON envelope back into a TextEstimateResult.
 * Returns a TextParseError if schema validation fails.
 */
export function parseTextEstimate(json: string): TextEstimateResult | TextParseError {
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

  const items: TextEstimateItem[] = []
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
// Text estimation prompt
// ---------------------------------------------------------------------------

const TEXT_ESTIMATE_SYSTEM_PROMPT = `You are a nutrition estimation assistant. Given a text description of food the user ate, identify all food items and estimate their nutritional values.

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
- Estimate based on typical serving sizes for the described food
- confidence should reflect how certain you are (0.5 = uncertain, 0.9 = very confident)
- All numeric values must be finite positive numbers
- The total calories/macros should approximately equal the sum of items
- If the description is vague or unrecognizable as food, set confidence below 0.5
- Return ONLY the JSON object, no other text`

function buildTextMessages(rawText: string, language: AppLanguage): RemoteChatMessage[] {
  return [
    {
      role: 'system',
      content: TEXT_ESTIMATE_SYSTEM_PROMPT,
    },
    {
      role: 'user',
      content: language === 'zh'
        ? `请根据以下文字描述识别食物并估算营养成分：\n\n${rawText}`
        : `Identify the food from the following text description and estimate its nutrition:\n\n${rawText}`,
    },
  ]
}

// ---------------------------------------------------------------------------
// Main estimation function
// ---------------------------------------------------------------------------

/**
 * Estimate nutritional content from a text description of food.
 *
 * Calls `window.agent.chatCompletions` with a text prompt (no vision needed).
 * Returns TextEstimateResult on success, or OneTapLogError on failure.
 */
export async function estimateFromText(
  rawText: string,
): Promise<TextEstimateResult | OneTapLogError> {
  const settings = getSettings()
  const agentSettings = settings.agent
  const language = settings.language === 'zh' ? 'zh' : 'en'

  const messages = buildTextMessages(rawText, language)

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

  const parseResult = parseTextEstimate(jsonContent)

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

  const result = parseResult as TextEstimateResult

  // Check confidence threshold — return lowConfidence error if < 0.5
  if (result.confidence < 0.5) {
    // Collect item names as unrecognized tokens for user feedback
    const unrecognizedTokens = result.items
      .filter((item) => item.confidence < 0.5)
      .map((item) => item.name)

    return {
      code: 'lowConfidence',
      reason: language === 'zh'
        ? '识别置信度太低，请换个描述方式或手动输入'
        : 'Recognition confidence is too low. Try another description or enter it manually.',
      unrecognizedTokens: unrecognizedTokens.length > 0 ? unrecognizedTokens : [rawText],
    }
  }

  // Write audit entry on success
  await writeAuditEntry({
    actor: 'agent',
    action: 'text_estimate_success',
    payload: {
      model: response.model ?? agentSettings.model,
      promptTokens: response.usage?.promptTokens ?? 0,
      completionTokens: response.usage?.completionTokens ?? 0,
      confidence: result.confidence,
      itemCount: result.items.length,
      inputLength: rawText.length,
    },
  })

  return result
}
