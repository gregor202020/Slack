'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body className="flex min-h-screen items-center justify-center bg-smoke-900 text-white">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-4">Something went wrong</h2>
          <p className="text-smoke-400 mb-6">An unexpected error occurred. Please try again.</p>
          <button
            onClick={reset}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 rounded-md text-white"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
