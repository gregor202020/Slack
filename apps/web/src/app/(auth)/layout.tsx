export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-smoke-900 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-wider text-smoke-100">THE SMOKER</h1>
          <p className="mt-2 text-sm text-smoke-400">Third Wave BBQ Internal Comms</p>
        </div>
        {children}
      </div>
    </div>
  )
}
