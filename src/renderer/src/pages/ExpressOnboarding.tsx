import { useEffect, useState } from 'react'
import { Button, Card, Form, InputNumber, message, Radio, Typography } from 'antd'
import { RocketOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { runExpressOnboarding } from '../coaching/expressOnboarding'
import { getCurrentPlanningProfile } from '../stores/planning'
import { getSettings, saveSettings } from '../stores/settings'
import type { ExpressOnboardingInput } from '../coaching/types'
import './ExpressOnboarding.css'

const { Title, Text, Paragraph } = Typography

function ExpressOnboardingPage(): JSX.Element {
  const navigate = useNavigate()
  const [form] = Form.useForm<ExpressOnboardingInput>()
  const [submitting, setSubmitting] = useState(false)
  const [prefilled, setPrefilled] = useState<Set<string>>(new Set())

  useEffect(() => {
    const loadProfile = async (): Promise<void> => {
      const profile = await getCurrentPlanningProfile()
      if (!profile) {
        return
      }

      const prefilledFields = new Set<string>()
      const values: Partial<ExpressOnboardingInput> = {}

      if (profile.gender) {
        values.gender = profile.gender
        prefilledFields.add('gender')
      }
      if (typeof profile.heightCm === 'number') {
        values.heightCm = profile.heightCm
        prefilledFields.add('heightCm')
      }
      if (typeof profile.weightKg === 'number') {
        values.weightKg = profile.weightKg
        prefilledFields.add('weightKg')
      }
      if (typeof profile.targetWeightKg === 'number') {
        values.targetWeightKg = profile.targetWeightKg
        prefilledFields.add('targetWeightKg')
      }
      if (profile.activityLevel) {
        values.activityLevel = profile.activityLevel
        prefilledFields.add('activityLevel')
      }

      if (Object.keys(values).length > 0) {
        form.setFieldsValue(values)
        setPrefilled(prefilledFields)
      }
    }

    void loadProfile()
  }, [form])

  const handleSubmit = async (values: ExpressOnboardingInput): Promise<void> => {
    setSubmitting(true)

    try {
      await runExpressOnboarding(values)

      const settings = getSettings()
      saveSettings({ ...settings, onboarded: true })

      message.success('计划已生成，开始你的减脂之旅吧！')
      navigate('/')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '生成计划失败，请重试'
      message.error(errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="express-onboarding-page">
      <Card className="express-onboarding-card" bordered={false}>
        <div className="express-onboarding-header">
          <RocketOutlined className="express-onboarding-icon" />
          <Title level={3} className="express-onboarding-title">
            一分钟开始减肥
          </Title>
          <Paragraph type="secondary" className="express-onboarding-subtitle">
            只需填写 5 项基本信息，猫猫虫就能帮你生成专属饮食计划
          </Paragraph>
        </div>

        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => void handleSubmit(values)}
          className="express-onboarding-form"
          requiredMark={false}
        >
          <Form.Item
            name="gender"
            label={
              <span>
                性别
                {prefilled.has('gender') && <Text type="secondary" className="prefill-hint">（已从档案预填）</Text>}
              </span>
            }
            rules={[{ required: true, message: '请选择性别' }]}
          >
            <Radio.Group>
              <Radio.Button value="male">男</Radio.Button>
              <Radio.Button value="female">女</Radio.Button>
              <Radio.Button value="other">其他</Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Form.Item
            name="heightCm"
            label={
              <span>
                身高
                {prefilled.has('heightCm') && <Text type="secondary" className="prefill-hint">（已从档案预填）</Text>}
              </span>
            }
            rules={[
              { required: true, message: '请输入身高' },
              { type: 'number', min: 100, max: 250, message: '身高需在 100–250 cm 之间' },
            ]}
          >
            <InputNumber
              placeholder="例如 170"
              addonAfter="cm"
              min={100}
              max={250}
              style={{ width: '100%' }}
            />
          </Form.Item>

          <Form.Item
            name="weightKg"
            label={
              <span>
                当前体重
                {prefilled.has('weightKg') && <Text type="secondary" className="prefill-hint">（已从档案预填）</Text>}
              </span>
            }
            rules={[
              { required: true, message: '请输入体重' },
              { type: 'number', min: 25, max: 300, message: '体重需在 25–300 kg 之间' },
            ]}
          >
            <InputNumber
              placeholder="例如 70"
              addonAfter="kg"
              min={25}
              max={300}
              style={{ width: '100%' }}
            />
          </Form.Item>

          <Form.Item
            name="targetWeightKg"
            label={
              <span>
                目标体重
                {prefilled.has('targetWeightKg') && <Text type="secondary" className="prefill-hint">（已从档案预填）</Text>}
              </span>
            }
            rules={[
              { required: true, message: '请输入目标体重' },
              { type: 'number', min: 25, max: 300, message: '目标体重需在 25–300 kg 之间' },
            ]}
          >
            <InputNumber
              placeholder="例如 60"
              addonAfter="kg"
              min={25}
              max={300}
              style={{ width: '100%' }}
            />
          </Form.Item>

          <Form.Item
            name="activityLevel"
            label={
              <span>
                日常活动量
                {prefilled.has('activityLevel') && <Text type="secondary" className="prefill-hint">（已从档案预填）</Text>}
              </span>
            }
            rules={[{ required: true, message: '请选择活动量' }]}
          >
            <Radio.Group>
              <Radio.Button value="low">久坐少动</Radio.Button>
              <Radio.Button value="medium">适度运动</Radio.Button>
              <Radio.Button value="high">经常运动</Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Form.Item className="express-onboarding-submit">
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              loading={submitting}
              block
            >
              生成我的计划
            </Button>
          </Form.Item>
        </Form>

        <div className="express-onboarding-footer">
          <Text type="secondary">
            想要更详细的问答？试试
            <Button type="link" onClick={() => navigate('/')} className="express-onboarding-link">
              完整问答版
            </Button>
          </Text>
        </div>
      </Card>
    </div>
  )
}

export default ExpressOnboardingPage
