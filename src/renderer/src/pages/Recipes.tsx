import { useEffect, useMemo, useState } from 'react'
import { Card, Input, Tag, Row, Col, Typography, Empty, Modal, List } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { recipes, type Recipe } from '../data/recipes'
import { additionalChineseRecipes, stapleFoodRecipes } from '../data/chineseRecipes'
import { westernRecipes } from '../data/westernRecipes'
import { getLocalizedCategory, localizeRecipe, recipeSearchText } from '../data/recipeTranslations.en'
import { getAllRecipesWithCustomFoods } from '../stores/customFoods'
import { DIET_LOG_UPDATED_EVENT, RECIPE_CALIBRATION_UPDATED_EVENT } from '../stores/events'
import { useI18n } from '../i18n'
import './Recipes.css'

const { Title, Text } = Typography

// 分类颜色映射
const categoryColors: Record<string, string> = {
  '快手菜': '#FFB6C1',
  '汤羹': '#87CEEB',
  '主食': '#FFD700',
  '凉菜': '#98FB98',
  '炒菜': '#FFA07A',
  '蒸菜': '#DDA0DD',
  '甜品': '#FFB6C1',
  '早餐': '#F0E68C',
  '西式': '#7BA7FF',
}

// 新增菜谱 ID 集合（扩展中式 + 西式菜）
const newRecipeIds = new Set<string>([
  ...additionalChineseRecipes.map((r) => r.id),
  ...stapleFoodRecipes.map((r) => r.id),
  ...westernRecipes.map((r) => r.id),
])

function RecipesPage(): JSX.Element {
  const { language, t } = useI18n()
  const [searchText, setSearchText] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null)
  const [recipesVersion, setRecipesVersion] = useState(0)
  const allRecipes = useMemo(() => getAllRecipesWithCustomFoods(recipes), [recipesVersion])

  useEffect(() => {
    const handleRecipesUpdated = (): void => {
      setRecipesVersion((current) => current + 1)
    }

    window.addEventListener(DIET_LOG_UPDATED_EVENT, handleRecipesUpdated)
    window.addEventListener(RECIPE_CALIBRATION_UPDATED_EVENT, handleRecipesUpdated)
    return () => {
      window.removeEventListener(DIET_LOG_UPDATED_EVENT, handleRecipesUpdated)
      window.removeEventListener(RECIPE_CALIBRATION_UPDATED_EVENT, handleRecipesUpdated)
    }
  }, [])

  // 分类列表 + 每个分类下的菜谱数（用于分类tag数量徽章）
  const categoryStats = useMemo(() => {
    const counts = new Map<string, number>()
    for (const recipe of allRecipes) {
      counts.set(recipe.category, (counts.get(recipe.category) ?? 0) + 1)
    }
    return Array.from(counts.entries())
  }, [allRecipes])

  const categories = useMemo(() => categoryStats.map(([cat]) => cat), [categoryStats])
  const categoryCountMap = useMemo(
    () => new Map<string, number>(categoryStats),
    [categoryStats],
  )

  const westernRecipeCount = useMemo(
    () => allRecipes.filter((recipe) => recipe.category === '西式').length,
    [allRecipes],
  )

  const newRecipeCount = useMemo(
    () => allRecipes.filter((recipe) => newRecipeIds.has(recipe.id)).length,
    [allRecipes],
  )

  const filteredRecipes = useMemo(() => {
    const query = searchText.trim().toLowerCase()
    return allRecipes.filter(recipe => {
      const matchSearch = !query || recipeSearchText(recipe, language).includes(query)
      const matchCategory = !selectedCategory || recipe.category === selectedCategory
      return matchSearch && matchCategory
    })
  }, [allRecipes, searchText, selectedCategory, language])
  const localizedSelectedRecipe = selectedRecipe ? localizeRecipe(selectedRecipe, language) : null

  return (
    <div className="recipes-page">
      <div className="recipes-header">
        <Title level={3}>🍳 {t('recipes.title')}</Title>
        <Text type="secondary">{t('recipes.subtitle', { count: allRecipes.length })}</Text>
      </div>

      <div className="recipes-overview">
        <div className="recipes-overview-card">
          <span>{t('recipes.total')}</span>
          <strong>{allRecipes.length}</strong>
          <Text type="secondary">{t('recipes.totalHelp')}</Text>
        </div>
        <div className="recipes-overview-card recipes-overview-card-western">
          <span>{t('recipes.western')}</span>
          <strong>{westernRecipeCount}</strong>
          <Text type="secondary">{t('recipes.westernHelp')}</Text>
        </div>
        <div className="recipes-overview-card recipes-overview-card-new">
          <span>{t('recipes.new')}</span>
          <strong>{newRecipeCount}</strong>
          <Text type="secondary">{t('recipes.newHelp')}</Text>
        </div>
      </div>

      <div className="recipes-filter">
        <Input
          placeholder={`🔍 ${t('recipes.searchPlaceholder')}`}
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          allowClear
          className="search-input"
        />
        <div className="category-tags">
          <Tag
            className={`cat-tag ${!selectedCategory ? 'active' : ''}`}
            onClick={() => setSelectedCategory(null)}
          >
            <span className="cat-tag-label">{t('recipes.all')}</span>
            <span className="cat-tag-count">{allRecipes.length}</span>
          </Tag>
          {categories.map(cat => (
            <Tag
              key={cat}
              className={`cat-tag ${selectedCategory === cat ? 'active' : ''}`}
              color={selectedCategory === cat ? categoryColors[cat] : undefined}
              onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
            >
              <span className="cat-tag-label">{getLocalizedCategory(cat, language)}</span>
              <span className="cat-tag-count">{categoryCountMap.get(cat) ?? 0}</span>
            </Tag>
          ))}
        </div>
      </div>
      <Text className="recipes-results-meta" type="secondary">
        {t('recipes.results', {
          count: filteredRecipes.length,
          category: selectedCategory ? ` ${getLocalizedCategory(selectedCategory, language)}` : '',
        })}
      </Text>

      {filteredRecipes.length === 0 ? (
        <Empty
          description={<Text type="secondary">{t('recipes.empty')}</Text>}
          style={{ marginTop: 60 }}
        />
      ) : (
        <Row gutter={[16, 16]} className="recipes-grid">
          {filteredRecipes.map(recipe => {
            const displayRecipe = localizeRecipe(recipe, language)
            const isWestern = recipe.category === '西式'
            const isNew = newRecipeIds.has(recipe.id)
            const cardClassName = [
              'recipe-card',
              isWestern ? 'recipe-card-western' : '',
              isNew ? 'recipe-card-new' : '',
            ]
              .filter(Boolean)
              .join(' ')

            return (
              <Col xs={24} sm={12} md={8} key={recipe.id}>
                <Card
                  className={cardClassName}
                  hoverable
                  onClick={() => setSelectedRecipe(recipe)}
                >
                  {isNew && <span className="recipe-card-new-badge">NEW</span>}
                  <div className="recipe-card-emoji">{recipe.emoji || '🍽️'}</div>
                  <Title level={5} className="recipe-card-title">{displayRecipe.name}</Title>
                  <Tag color={categoryColors[recipe.category]} className="recipe-tag">
                    {displayRecipe.category}
                  </Tag>
                  <div className="recipe-card-info">
                    <Text type="secondary">🔥 {recipe.calories} kcal</Text>
                    <Text type="secondary">⏰ {recipe.time} {language === 'zh' ? '分钟' : 'min'}</Text>
                  </div>
                </Card>
              </Col>
            )
          })}
        </Row>
      )}

      <Modal
        open={!!selectedRecipe}
        onCancel={() => setSelectedRecipe(null)}
        footer={null}
        width={600}
        className={`recipe-modal${
          selectedRecipe?.category === '西式' ? ' recipe-modal-western' : ''
        }`}
      >
        {selectedRecipe && localizedSelectedRecipe && (
          <div
            className={`recipe-detail${
              selectedRecipe.category === '西式' ? ' recipe-detail-western' : ''
            }`}
          >
            <div className="recipe-detail-header">
              <span className="recipe-detail-emoji">{selectedRecipe.emoji || '🍽️'}</span>
              <Title level={3} className="recipe-detail-title">
                {localizedSelectedRecipe.name}
                {newRecipeIds.has(selectedRecipe.id) && (
                  <span className="recipe-detail-new-badge">NEW</span>
                )}
              </Title>
              <div className="recipe-detail-meta">
                <Tag color={categoryColors[selectedRecipe.category]}>
                  {localizedSelectedRecipe.category}
                </Tag>
                <Text type="secondary">🔥 {selectedRecipe.calories} kcal</Text>
                <Text type="secondary">⏰ {selectedRecipe.time} {language === 'zh' ? '分钟' : 'min'}</Text>
              </div>
            </div>

            <div className="recipe-section">
              <Title level={5}>🥬 {t('recipes.ingredients')}</Title>
              <div className="ingredient-list">
                {localizedSelectedRecipe.ingredients.map((ing, i) => (
                  <Tag key={i} className="ingredient-tag">
                    {ing.name} {ing.amount}
                  </Tag>
                ))}
              </div>
            </div>

            <div className="recipe-section">
              <Title level={5}>👩‍🍳 {t('recipes.steps')}</Title>
              <List
                dataSource={localizedSelectedRecipe.steps}
                renderItem={(step, index) => (
                  <List.Item className="step-item">
                    <span className="step-num">{index + 1}</span>
                    <Text>{step}</Text>
                  </List.Item>
                )}
              />
            </div>

            <div className="recipe-section nutrition-section">
              <Title level={5}>📊 {t('recipes.nutrition')}</Title>
              <Row gutter={16}>
                <Col span={6}>
                  <div className="nutrition-item">
                    <Text type="secondary">{t('recipes.calories')}</Text>
                    <Text strong>{selectedRecipe.calories} kcal</Text>
                  </div>
                </Col>
                <Col span={6}>
                  <div className="nutrition-item">
                    <Text type="secondary">{t('recipes.protein')}</Text>
                    <Text strong>{selectedRecipe.nutrition.protein}g</Text>
                  </div>
                </Col>
                <Col span={6}>
                  <div className="nutrition-item">
                    <Text type="secondary">{t('recipes.carbs')}</Text>
                    <Text strong>{selectedRecipe.nutrition.carbs}g</Text>
                  </div>
                </Col>
                <Col span={6}>
                  <div className="nutrition-item">
                    <Text type="secondary">{t('recipes.fat')}</Text>
                    <Text strong>{selectedRecipe.nutrition.fat}g</Text>
                  </div>
                </Col>
              </Row>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default RecipesPage
