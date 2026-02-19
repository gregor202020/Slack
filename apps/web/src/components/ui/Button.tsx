'use client'

import { clsx } from 'clsx'
import { forwardRef } from 'react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={clsx(
          'inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 focus:ring-offset-smoke-900 disabled:opacity-50 disabled:cursor-not-allowed',
          {
            'bg-brand text-white hover:bg-brand-hover': variant === 'primary',
            'bg-smoke-700 text-smoke-100 hover:bg-smoke-600': variant === 'secondary',
            'bg-error text-white hover:bg-red-700': variant === 'danger',
            'bg-transparent text-smoke-300 hover:text-white hover:bg-smoke-700': variant === 'ghost',
          },
          {
            'h-8 px-3 text-sm': size === 'sm',
            'h-10 px-4 text-sm': size === 'md',
            'h-12 px-6 text-base': size === 'lg',
          },
          className,
        )}
        {...props}
      >
        {isLoading ? (
          <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : null}
        {children}
      </button>
    )
  },
)
Button.displayName = 'Button'
