'use client'

import { clsx } from 'clsx'
import { forwardRef } from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={id} className="text-sm font-medium text-smoke-200">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={clsx(
            'h-10 w-full rounded-md bg-smoke-700 border px-3 text-sm text-smoke-100 placeholder:text-smoke-400 transition-colors focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent',
            error ? 'border-error' : 'border-smoke-600',
            className,
          )}
          {...props}
        />
        {error && <p className="text-xs text-error">{error}</p>}
      </div>
    )
  },
)
Input.displayName = 'Input'
