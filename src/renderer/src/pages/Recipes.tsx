import { useState, useMemo } from 'react'
import { Card, Input, Tag, Row, Col, Typography, Empty, Modal, List } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { recipes, type Recipe } from '../data/recipes'
import { additionalChineseRecipes, westernRecipes } from '../data/recipeExtensions'
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

// 新增菜谱 ID 集合（来自 recipeExtensions.ts 的扩展中式 + 西式菜）
const newRecipeIds = new Set<string>([
  ...additionalChineseRecipes.map((r) => r.id),
  ...westernRecipes.map((r) => r.id),
])

function RecipesPage(): JSX.Element {
  const [searchText, setSearchText] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null)

  // 分类列表 + 每个分类下的菜谱数（用于分类tag数量徽章）
  const categoryStats = useMemo(() => {
    const counts = new Map<string, number>()
    for (const recipe of recipes) {
      counts.set(recipe.category, (counts.get(recipe.category) ?? 0) + 1)
    }
    return Array.from(counts.entries())
  }, [])

  const categories = useMemo(() => categoryStats.map(([cat]) => cat), [categoryStats])
  const categoryCountMap = useMemo(
    () => new Map<string, number>(categoryStats),
    [categoryStats],
  )

  const westernRecipeCount = useMemo(
    () => recipes.filter((recipe) => recipe.category === '西式').length,
    [],
  )

  const newRecipeCount = useMemo(
    () => recipes.filter((recipe) => newRecipeIds.has(recipe.id)).length,
    [],
  )

  const filteredRecipes = useMemo(() => {
    return recipes.filter(recipe => {
      const matchSearch = !searchText ||
        recipe.name.includes(searchText) ||
        recipe.ingredients.some(i => i.name.includes(searchText))
      const matchCategory = !selectedCategory || recipe.category === selectedCategory
      return matchSearch && matchCategory
    })
  }, [searchText, selectedCategory])

  return (
    <div className="recipes-page">
      <div className="recipes-header">
        <Title level={3}>🍳 猫猫虫的菜谱本</Title>
        <Text type="secondary">精选 {recipes.length} 道中西式菜谱，总有一道适合今天的你~</Text>
      </div>

      <div className="recipes-overview">
        <div className="recipes-overview-card">
          <span>总菜谱</span>
          <strong>{recipes.length}</strong>
          <Text type="secondary">覆盖家常、早餐、甜品与西式料理</Text>
        </div>
        <div className="recipes-overview-card recipes-overview-card-western">
          <span>西方菜肴</span>
          <strong>{westernRecipeCount}</strong>
          <Text type="secondary">意面、披萨、沙拉、甜点都能直接筛选</Text>
        </div>
        <div className="recipes-overview-card recipes-overview-card-new">
          <span>本次新增</span>
          <strong>{newRecipeCount}</strong>
          <Text type="secondary">中式扩展 + 西式新菜，卡片右上角带 NEW 标</Text>
        </div>
      </div>

      <div className="recipes-filter">
        <Input
          placeholder="🔍 搜索菜名或食材..."
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
            <span className="cat-tag-label">全部</span>
            <span className="cat-tag-count">{recipes.length}</span>
          </Tag>
          {categories.map(cat => (
            <Tag
              key={cat}
              className={`cat-tag ${selectedCategory === cat ? 'active' : ''}`}
              color={selectedCategory === cat ? categoryColors[cat] : undefined}
              onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
            >
              <span className="cat-tag-label">{cat}</span>
              <span className="cat-tag-count">{categoryCountMap.get(cat) ?? 0}</span>
            </Tag>
          ))}
        </div>
      </div>
      <Text className="recipes-results-meta" type="secondary">
        当前显示 {filteredRecipes.length} 道{selectedCategory ? `「${selectedCategory}」` : ''}菜谱
      </Text>

      {filteredRecipes.length === 0 ? (
        <Empty
          description={<Text type="secondary">没有找到菜谱呢... 换个关键词试试？🐛</Text>}
          style={{ marginTop: 60 }}
        />
      ) : (
        <Row gutter={[16, 16]} className="recipes-grid">
          {filteredRecipes.map(recipe => {
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
                  <Title level={5} className="recipe-card-title">{recipe.name}</Title>
                  <Tag color={categoryColors[recipe.category]} className="recipe-tag">
                    {recipe.category}
                  </Tag>
                  <div className="recipe-card-info">
                    <Text type="secondary">🔥 {recipe.calories} kcal</Text>
                    <Text type="secondary">⏰ {recipe.time}分钟</Text>
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
        {selectedRecipe && (
          <div
            className={`recipe-detail${
              selectedRecipe.category === '西式' ? ' recipe-detail-western' : ''
            }`}
          >
            <div className="recipe-detail-header">
              <span className="recipe-detail-emoji">{selectedRecipe.emoji || '🍽️'}</span>
              <Title level={3} className="recipe-detail-title">
                {selectedRecipe.name}
                {newRecipeIds.has(selectedRecipe.id) && (
                  <span className="recipe-detail-new-badge">NEW</span>
                )}
              </Title>
              <div className="recipe-detail-meta">
                <Tag color={categoryColors[selectedRecipe.category]}>
                  {selectedRecipe.category}
                </Tag>
                <Text type="secondary">🔥 {selectedRecipe.calories} kcal</Text>
                <Text type="secondary">⏰ {selectedRecipe.time}分钟</Text>
              </div>
            </div>

            <div className="recipe-section">
              <Title level={5}>🥬 食材</Title>
              <div className="ingredient-list">
                {selectedRecipe.ingredients.map((ing, i) => (
                  <Tag key={i} className="ingredient-tag">
                    {ing.name} {ing.amount}
                  </Tag>
                ))}
              </div>
            </div>

            <div className="recipe-section">
              <Title level={5}>👩‍🍳 做法</Title>
              <List
                dataSource={selectedRecipe.steps}
                renderItem={(step, index) => (
                  <List.Item className="step-item">
                    <span className="step-num">{index + 1}</span>
                    <Text>{step}</Text>
                  </List.Item>
                )}
              />
            </div>

            <div className="recipe-section nutrition-section">
              <Title level={5}>📊 营养信息（估算）</Title>
              <Row gutter={16}>
                <Col span={6}>
                  <div className="nutrition-item">
                    <Text type="secondary">卡路里</Text>
                    <Text strong>{selectedRecipe.calories} kcal</Text>
                  </div>
                </Col>
                <Col span={6}>
                  <div className="nutrition-item">
                    <Text type="secondary">蛋白质</Text>
                    <Text strong>{selectedRecipe.nutrition.protein}g</Text>
                  </div>
                </Col>
                <Col span={6}>
                  <div className="nutrition-item">
                    <Text type="secondary">碳水</Text>
                    <Text strong>{selectedRecipe.nutrition.carbs}g</Text>
                  </div>
                </Col>
                <Col span={6}>
                  <div className="nutrition-item">
                    <Text type="secondary">脂肪</Text>
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
