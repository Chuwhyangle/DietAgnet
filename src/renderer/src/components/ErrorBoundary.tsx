import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button, Result } from 'antd'
import { getSettings } from '../stores/settings'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, info.componentStack)
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null })
  }

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children
    }

    const language = getSettings().language === 'zh' ? 'zh' : 'en'
    const l = (zh: string, en: string): string => (language === 'zh' ? zh : en)

    return (
      <Result
        status="error"
        title={l('页面出了点问题', 'Something went wrong')}
        subTitle={this.state.error?.message ?? l('未知错误', 'Unknown error')}
        extra={
          <Button type="primary" onClick={this.handleReset}>
            {l('重试', 'Try again')}
          </Button>
        }
      />
    )
  }
}

export default ErrorBoundary
