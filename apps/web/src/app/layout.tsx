import type { Metadata } from 'next'
import { ToastProvider } from '@/components/ui/ToastProvider'
import '@/lib/error-tracking'
import './globals.css'

export const metadata: Metadata = {
  title: 'The Smoker — Third Wave BBQ',
  description: 'Internal communications platform for Third Wave BBQ',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-white focus:text-black focus:rounded"
        >
          Skip to main content
        </a>
        {children}
        <ToastProvider />
      </body>
    </html>
  )
}
