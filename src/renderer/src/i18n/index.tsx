import dayjs from 'dayjs'
import 'dayjs/locale/en'
import 'dayjs/locale/zh-cn'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { SETTINGS_UPDATED_EVENT } from '../stores/events'
import { getSettings, saveSettings, type AppLanguage } from '../stores/settings'

const translations = {
  en: {
    'app.loading': 'Loading...',
    'layout.brand': 'Diet Agent',
    'layout.subtitle': 'Desktop Diet Assistant',
    'layout.home': 'Home',
    'layout.recipes': 'Recipes',
    'layout.dietLog': 'Diet Log',
    'layout.chat': 'AI Chat',
    'layout.settings': 'Settings',
    'layout.footer': 'Eat well, stay steady.',
    'settings.title': 'Settings',
    'settings.subtitle': 'Make Diet Agent fit the way you eat.',
    'settings.language.title': 'Language',
    'settings.language.description': 'Choose the interface and assistant language.',
    'settings.language.english': 'English',
    'settings.language.chinese': '中文',
    'settings.language.saved': 'Language updated.',
    'settings.nickname.title': 'Nickname',
    'settings.nickname.description': 'How should Diet Agent address you?',
    'settings.nickname.placeholder': 'Enter your nickname...',
    'settings.save': 'Save Settings',
    'settings.saved': 'Saved',
    'welcome.hello.title': 'Welcome to Diet Agent',
    'welcome.hello.description': 'I can help you log meals, understand nutrition, and keep your diet plan realistic.',
    'welcome.hello.action': 'Get started',
    'welcome.nickname.title': 'What should I call you?',
    'welcome.nickname.description': 'Pick a nickname. You can change it later in Settings.',
    'welcome.nickname.confirm': 'Use this name',
    'welcome.nickname.skip': 'Skip for now',
    'welcome.features.title': 'What Diet Agent can do',
    'welcome.features.description': 'Three core workflows for everyday diet tracking.',
    'welcome.feature.log.title': 'Log meals',
    'welcome.feature.log.description': 'Record meals and snacks, then calculate calories and macros.',
    'welcome.feature.recipes.title': 'Browse recipes',
    'welcome.feature.recipes.description': 'Review recipes with ingredients, steps, and nutrition estimates.',
    'welcome.feature.plan.title': 'AI diet plan',
    'welcome.feature.plan.description': 'Collect your profile and generate a personalized plan.',
    'welcome.express': 'Build a quick plan',
    'welcome.full': 'Full guided chat',
    'welcome.skipAll': 'Skip onboarding',
    'home.defaultNickname': 'friend',
    'home.subtitle': 'Diet Agent helps you manage meals and nutrition day by day.',
    'home.mainFeature': 'Main feature',
    'home.planTitle': 'Let AI build a personalized diet plan step by step',
    'home.planDescription': 'Diet Agent collects weight, height, goals, schedule, and preferences, then stores the plan locally.',
    'home.localData': 'Local data',
    'home.followUps': 'Clarifies issues',
    'home.audit': 'Auditable stages',
    'home.caloriesToday': 'Today’s Calories',
    'home.mealsLoggedToday': 'Meals Logged',
    'home.availableRecipes': 'Recipes',
    'recipes.title': 'Recipe Library',
    'recipes.subtitle': 'A curated set of {count} Chinese and Western recipes.',
    'recipes.total': 'Total Recipes',
    'recipes.totalHelp': 'Home-style dishes, breakfast, desserts, and Western meals.',
    'recipes.western': 'Western Dishes',
    'recipes.westernHelp': 'Pasta, pizza, salads, and desserts are ready to filter.',
    'recipes.new': 'New Items',
    'recipes.newHelp': 'Expanded Chinese dishes plus Western additions.',
    'recipes.searchPlaceholder': 'Search recipes or ingredients...',
    'recipes.all': 'All',
    'recipes.results': 'Showing {count} recipes{category}',
    'recipes.empty': 'No recipes found. Try another keyword.',
    'recipes.ingredients': 'Ingredients',
    'recipes.steps': 'Steps',
    'recipes.nutrition': 'Nutrition estimate',
    'recipes.calories': 'Calories',
    'recipes.protein': 'Protein',
    'recipes.carbs': 'Carbs',
    'recipes.fat': 'Fat',
    'dietLog.title': 'Diet Log',
    'dietLog.subtitle': 'Track every meal and let Diet Agent calculate nutrition.',
    'dietLog.export': 'Export',
    'dietLog.estimate': 'AI Estimate',
    'dietLog.add': 'Add Entry',
    'dietLog.chatEstimate': 'Estimate in chat',
    'common.cancel': 'Cancel',
    'common.confirm': 'Confirm',
    'common.delete': 'Delete',
    'common.clear': 'Clear',
    'common.refresh': 'Refresh',
    'common.save': 'Save',
    'common.later': 'Later',
    'common.dismiss': 'Dismiss',
    'common.accept': 'Accept',
    'meal.breakfast': 'Breakfast',
    'meal.lunch': 'Lunch',
    'meal.dinner': 'Dinner',
    'meal.snack': 'Snack',
    'agent.open': 'AI Chat',
    'agent.launcherTitle': 'Drag to move. Click to open the AI chat page.',
    'agent.statusChecking': 'Checking',
    'agent.statusReady': 'Connected',
    'agent.statusMissing': 'Needs setup',
    'agent.workspaceTitle': 'Diet Agent AI Chat',
    'agent.canChat': 'Ready',
    'agent.needsSetup': 'Setup needed',
    'agent.goSettings': 'Settings',
    'agent.clearHistory': 'Clear History',
    'agent.placeholder': 'For example: I had tomato eggs for lunch, or recommend a light dinner.',
    'agent.send': 'Send',
    'agent.shiftEnter': 'Shift + Enter for a new line',
    'oneTap.title': 'Quick Log',
    'oneTap.photo': 'Photo',
    'oneTap.photoTitle': 'Recognize food from a photo',
    'oneTap.textPlaceholder': 'Describe food, e.g. a bowl of noodles',
    'oneTap.recognize': 'Recognize',
    'oneTap.sameYesterday': 'Same as yesterday',
    'proactive.rule.breakfast': 'Breakfast reminder',
    'proactive.rule.lunch': 'Lunch reminder',
    'proactive.rule.dinner': 'Dinner reminder',
    'proactive.rule.weeklyReport': 'Weekly report',
    'proactive.rule.planDrift': 'Plan drift',
    'proactive.rule.overcalorieStreak': 'High-calorie streak',
    'proactive.rule.default': 'Proactive reminder',
    'proactive.close': 'Close reminder',
  },
  zh: {
    'app.loading': '加载中...',
    'layout.brand': '猫猫虫',
    'layout.subtitle': '饮食小助手',
    'layout.home': '首页',
    'layout.recipes': '菜谱',
    'layout.dietLog': '饮食记录',
    'layout.chat': 'AI 对话',
    'layout.settings': '设置',
    'layout.footer': '吃好喝好，健康长大喵~',
    'settings.title': '设置',
    'settings.subtitle': '让猫猫虫更了解你~',
    'settings.language.title': '语言',
    'settings.language.description': '选择界面和助手使用的语言。',
    'settings.language.english': 'English',
    'settings.language.chinese': '中文',
    'settings.language.saved': '语言已更新。',
    'settings.nickname.title': '昵称',
    'settings.nickname.description': '猫猫虫怎么称呼你呢？',
    'settings.nickname.placeholder': '输入你的昵称...',
    'settings.save': '保存设置',
    'settings.saved': '已保存',
    'welcome.hello.title': '你好呀，欢迎来到猫猫虫的小窝！',
    'welcome.hello.description': '我是猫猫虫，你的饮食小助手。我会陪你记录每天的饮食，帮你吃得更健康，更开心~',
    'welcome.hello.action': '认识一下',
    'welcome.nickname.title': '猫猫虫该怎么称呼你呢？',
    'welcome.nickname.description': '给自己起一个可爱的昵称吧，之后随时可以在设置页修改哦',
    'welcome.nickname.confirm': '就叫这个！',
    'welcome.nickname.skip': '先跳过，之后再设',
    'welcome.features.title': '猫猫虫能帮你做这些事 🐾',
    'welcome.features.description': '三个核心能力，让健康饮食变得简单',
    'welcome.feature.log.title': '记录饮食',
    'welcome.feature.log.description': '轻松记录每日三餐和加餐，自动计算卡路里与营养',
    'welcome.feature.recipes.title': '浏览菜谱',
    'welcome.feature.recipes.description': '130 道中西式菜谱随时查看，包含食材、步骤和营养信息',
    'welcome.feature.plan.title': 'AI 专属计划',
    'welcome.feature.plan.description': '猫猫虫逐步采集你的资料，生成个性化饮食建议',
    'welcome.express': '一分钟开始减肥',
    'welcome.full': '完整问答版',
    'welcome.skipAll': '跳过引导',
    'home.defaultNickname': '小可爱',
    'home.subtitle': '猫猫虫陪你一起管理饮食，健康每一天~',
    'home.mainFeature': '主线功能',
    'home.planTitle': '让 AI 一步一步帮你制定专属饮食计划',
    'home.planDescription': '从体重、身高、目标到作息偏好，猫猫虫会逐项采集并落到本地数据库。',
    'home.localData': '本地落库',
    'home.followUps': '异常追问',
    'home.audit': '阶段可审计',
    'home.caloriesToday': '今日卡路里',
    'home.mealsLoggedToday': '今日已记录',
    'home.availableRecipes': '可用菜谱',
    'recipes.title': '猫猫虫的菜谱本',
    'recipes.subtitle': '精选 {count} 道中西式菜谱，总有一道适合今天的你~',
    'recipes.total': '总菜谱',
    'recipes.totalHelp': '覆盖家常、早餐、甜品与西式料理',
    'recipes.western': '西方菜肴',
    'recipes.westernHelp': '意面、披萨、沙拉、甜点都能直接筛选',
    'recipes.new': '本次新增',
    'recipes.newHelp': '中式扩展 + 西式新菜，卡片右上角带 NEW 标',
    'recipes.searchPlaceholder': '搜索菜名或食材...',
    'recipes.all': '全部',
    'recipes.results': '当前显示 {count} 道{category}菜谱',
    'recipes.empty': '没有找到菜谱呢... 换个关键词试试？🐛',
    'recipes.ingredients': '食材',
    'recipes.steps': '做法',
    'recipes.nutrition': '营养信息（估算）',
    'recipes.calories': '卡路里',
    'recipes.protein': '蛋白质',
    'recipes.carbs': '碳水',
    'recipes.fat': '脂肪',
    'dietLog.title': '饮食记录',
    'dietLog.subtitle': '记录每一餐，猫猫虫帮你算营养~',
    'dietLog.export': '导出记录',
    'dietLog.estimate': 'AI 估算食物',
    'dietLog.add': '添加记录',
    'dietLog.chatEstimate': '去聊天估算',
    'common.cancel': '取消',
    'common.confirm': '确认',
    'common.delete': '删除',
    'common.clear': '清空',
    'common.refresh': '刷新',
    'common.save': '保存',
    'common.later': '稍后',
    'common.dismiss': '忽略',
    'common.accept': '采纳',
    'meal.breakfast': '早餐',
    'meal.lunch': '午餐',
    'meal.dinner': '晚餐',
    'meal.snack': '加餐',
    'agent.open': 'AI 对话',
    'agent.launcherTitle': '拖动可移动，点击进入正式 AI 对话页',
    'agent.statusChecking': '检查中',
    'agent.statusReady': '已连接',
    'agent.statusMissing': '待配置',
    'agent.workspaceTitle': '猫猫虫 AI 对话',
    'agent.canChat': '可对话',
    'agent.needsSetup': '需配置',
    'agent.goSettings': '去设置',
    'agent.clearHistory': '清空对话记录',
    'agent.placeholder': '比如：我今天午餐吃了番茄炒蛋，或者 帮我推荐一道低卡晚餐',
    'agent.send': '发送',
    'agent.shiftEnter': 'Shift + Enter 换行',
    'oneTap.title': '快速记录',
    'oneTap.photo': '拍照',
    'oneTap.photoTitle': '拍照识别食物',
    'oneTap.textPlaceholder': '输入食物，如：一碗面条',
    'oneTap.recognize': '识别',
    'oneTap.sameYesterday': '和昨天一样',
    'proactive.rule.breakfast': '早餐提醒',
    'proactive.rule.lunch': '午餐提醒',
    'proactive.rule.dinner': '晚餐提醒',
    'proactive.rule.weeklyReport': '周报提醒',
    'proactive.rule.planDrift': '计划偏移',
    'proactive.rule.overcalorieStreak': '连续偏高',
    'proactive.rule.default': '主动提醒',
    'proactive.close': '关闭提醒',
  },
} as const

export type TranslationKey = keyof typeof translations.en

type TranslationParams = Record<string, string | number>

interface I18nContextValue {
  language: AppLanguage
  setLanguage: (language: AppLanguage) => void
  t: (key: TranslationKey, params?: TranslationParams) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) {
    return template
  }

  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? `{${key}}`))
}

export function translate(key: TranslationKey, language: AppLanguage, params?: TranslationParams): string {
  return interpolate(translations[language][key] ?? translations.en[key], params)
}

export function I18nProvider({ children }: { children: ReactNode }): JSX.Element {
  const [language, setLanguageState] = useState<AppLanguage>(() => (getSettings().language === 'zh' ? 'zh' : 'en'))

  useEffect(() => {
    const syncLanguage = (): void => {
      setLanguageState(getSettings().language === 'zh' ? 'zh' : 'en')
    }

    window.addEventListener(SETTINGS_UPDATED_EVENT, syncLanguage)
    return () => {
      window.removeEventListener(SETTINGS_UPDATED_EVENT, syncLanguage)
    }
  }, [])

  useEffect(() => {
    dayjs.locale(language === 'zh' ? 'zh-cn' : 'en')
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
  }, [language])

  const setLanguage = useCallback((nextLanguage: AppLanguage): void => {
    const current = getSettings()
    saveSettings({ ...current, language: nextLanguage })
  }, [])

  const t = useCallback(
    (key: TranslationKey, params?: TranslationParams): string => translate(key, language, params),
    [language],
  )

  const value = useMemo<I18nContextValue>(() => ({ language, setLanguage, t }), [language, setLanguage, t])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext)
  if (context) {
    return context
  }

  const language = getSettings().language === 'zh' ? 'zh' : 'en'
  return {
    language,
    setLanguage: (nextLanguage: AppLanguage) => {
      const current = getSettings()
      saveSettings({ ...current, language: nextLanguage })
    },
    t: (key, params) => translate(key, language, params),
  }
}

const autoTextEn = new Map<string, string>([
  ['⚙️ 设置', 'Settings'],
  ['让猫猫虫更了解你~', 'Make Diet Agent fit the way you eat.'],
  ['🐱 昵称', 'Nickname'],
  ['🎯 每日卡路里目标', 'Daily calorie goal'],
  ['设定每天的卡路里摄入目标（可选）', 'Set your daily calorie target (optional).'],
  ['🔔 主动提醒设置', 'Proactive reminders'],
  ['主动提醒总开关', 'Enable proactive reminders'],
  ['餐次未记录提醒', 'Missing meal reminders'],
  ['动态计划建议提醒', 'Dynamic plan suggestions'],
  ['每周报告提醒', 'Weekly report reminder'],
  ['AI 对话设置', 'AI chat settings'],
  ['配置模型通道、Base URL、Model 和 API Key', 'Configure provider, Base URL, model, and API key.'],
  ['清除当前密钥', 'Clear current key'],
  ['测试连接', 'Test connection'],
  ['连接诊断', 'Connection diagnostics'],
  ['还没有运行连接诊断', 'No diagnostics have been run yet'],
  ['保存设置', 'Save settings'],
  ['关于猫猫虫饮食小助手', 'About Diet Agent'],
  ['当前版本聚焦桌面端饮食管理与 AI 对话能力', 'This version focuses on desktop diet tracking and AI chat.'],
  ['菜谱库来源: HowToCook 灵感整理 + 本地扩展中西式菜谱', 'Recipe library: HowToCook-inspired items plus local Chinese and Western additions.'],
  ['清空', 'Clear'],
  ['去设置', 'Settings'],
  ['发送', 'Send'],
  ['取消', 'Cancel'],
  ['添加', 'Add'],
  ['删除', 'Delete'],
  ['采纳', 'Accept'],
  ['忽略', 'Dismiss'],
  ['晚点', 'Later'],
  ['刷新', 'Refresh'],
  ['全部', 'All'],
  ['食材', 'Ingredients'],
  ['做法', 'Steps'],
  ['蛋白质', 'Protein'],
  ['碳水', 'Carbs'],
  ['脂肪', 'Fat'],
  ['卡路里', 'Calories'],
  ['餐次', 'Meal'],
  ['选择菜谱', 'Choose recipe'],
  ['份数', 'Servings'],
  ['添加饮食记录', 'Add diet log entry'],
  ['今天还没有记录呢~ 点击「添加记录」开始吧！🐾', 'No entries yet today. Click “Add Entry” to start.'],
])

const autoTextRules: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
  [/^共记录 (\d+) 餐，$/, (m) => `${m[1]} meals logged,`],
  [/^摄入$/, () => 'intake'],
  [/^当前显示 (\d+) 道菜谱$/, (m) => `Showing ${m[1]} recipes`],
  [/^当前显示 (\d+) 道「(.+)」菜谱$/, (m) => `Showing ${m[1]} ${m[2]} recipes`],
  [/^(\d+)分钟$/, (m) => `${m[1]} min`],
  [/^置信度 (\d+)%$/, (m) => `Confidence ${m[1]}%`],
]

function autoTranslateText(value: string, language: AppLanguage): string {
  if (language !== 'en') {
    return value
  }

  const trimmed = value.trim()
  const exact = autoTextEn.get(trimmed)
  if (exact) {
    return value.replace(trimmed, exact)
  }

  for (const [pattern, toText] of autoTextRules) {
    const match = trimmed.match(pattern)
    if (match) {
      return value.replace(trimmed, toText(match))
    }
  }

  return value
}

function translateDomNode(root: ParentNode, language: AppLanguage): void {
  if (typeof document === 'undefined') {
    return
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    const parent = node.parentElement
    if (!parent || ['SCRIPT', 'STYLE', 'TEXTAREA'].includes(parent.tagName)) {
      continue
    }
    textNodes.push(node)
  }

  for (const node of textNodes) {
    const next = autoTranslateText(node.nodeValue ?? '', language)
    if (next !== node.nodeValue) {
      node.nodeValue = next
    }
  }

  if (root instanceof Element || root instanceof Document) {
    const elements = (root instanceof Element ? [root, ...Array.from(root.querySelectorAll('*'))] : Array.from(root.querySelectorAll('*')))
    for (const element of elements) {
      for (const attr of ['placeholder', 'title', 'aria-label', 'alt']) {
        const current = element.getAttribute(attr)
        if (!current) {
          continue
        }
        const next = autoTranslateText(current, language)
        if (next !== current) {
          element.setAttribute(attr, next)
        }
      }
    }
  }
}

export function DomTranslationBridge(): null {
  const { language } = useI18n()

  useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }

    const translatePage = (): void => translateDomNode(document.body, language)
    translatePage()

    const observer = new MutationObserver(() => {
      translatePage()
    })
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['placeholder', 'title', 'aria-label', 'alt'],
    })

    return () => observer.disconnect()
  }, [language])

  return null
}
