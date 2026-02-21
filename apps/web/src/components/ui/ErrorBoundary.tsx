'use client'

import { Component, type ReactNode } from 'react'
import { Button } from './Button'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex items-center justify-center h-full min-h-[200px] p-6" role="alert">
          <div className="rounded-lg border border-smoke-600 bg-smoke-800 p-6 text-center max-w-sm w-full">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-red-900/50">
              <svg className="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-smoke-100 mb-1">
              Something went wrong
            </h3>
            <p className="text-sm text-smoke-400 mb-4">
              An unexpected error occurred in this section.
            </p>
            <Button size="sm" onClick={this.handleRetry}>
              Try again
            </Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
