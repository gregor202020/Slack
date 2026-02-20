import type { Metadata } from 'next'
import { ToastProvider } from '@/components/ui/ToastProvider'
import './globals.css'

export const metadata: Metadata = {
  title: 'The Smoker — Third Wave BBQ',
  description: 'Internal communications platform for Third Wave BBQ',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        {children}
        <ToastProvider />
      </body>
    </html>
  )
}
