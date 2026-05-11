import { useState, useMemo } from 'react'
import { Card, Input, Tag, Row, Col, Typography, Empty, Modal, List } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { recipes, type Recipe } from '../data/recipes'
import './Recipes.css'

const { Title, Text, Paragraph } = Typography

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
}

function RecipesPage(): JSX.Element {
  const [searchText, setSearchText] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null)

  const categories = useMemo(() => {
    const cats = new Set(recipes.map(r => r.category))
    return Array.from(cats)
  }, [])

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
        <Text type="secondary">精选 {recipes.length} 道美味菜谱，总有一道适合今天的你~</Text>
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
            全部
          </Tag>
          {categories.map(cat => (
            <Tag
              key={cat}
              className={`cat-tag ${selectedCategory === cat ? 'active' : ''}`}
              color={selectedCategory === cat ? categoryColors[cat] : undefined}
              onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
            >
              {cat}
            </Tag>
          ))}
        </div>
      </div>

      {filteredRecipes.length === 0 ? (
        <Empty
          description={<Text type="secondary">没有找到菜谱呢... 换个关键词试试？🐛</Text>}
          style={{ marginTop: 60 }}
        />
      ) : (
        <Row gutter={[16, 16]} className="recipes-grid">
          {filteredRecipes.map(recipe => (
            <Col xs={24} sm={12} md={8} key={recipe.id}>
              <Card
                className="recipe-card"
                hoverable
                onClick={() => setSelectedRecipe(recipe)}
              >
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
          ))}
        </Row>
      )}

      <Modal
        open={!!selectedRecipe}
        onCancel={() => setSelectedRecipe(null)}
        footer={null}
        width={600}
        className="recipe-modal"
      >
        {selectedRecipe && (
          <div className="recipe-detail">
            <div className="recipe-detail-header">
              <span className="recipe-detail-emoji">{selectedRecipe.emoji || '🍽️'}</span>
              <Title level={3}>{selectedRecipe.name}</Title>
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
